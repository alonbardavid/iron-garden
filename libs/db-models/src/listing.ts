import {
  and,
  asc,
  Column,
  desc,
  eq,
  gt,
  is,
  lt,
  sql,
  type SQL,
  type Subquery,
} from "drizzle-orm";
import type { SQLiteColumn, SQLiteSelect } from "drizzle-orm/sqlite-core";
import { getDb } from "./db";
import { moduleLogger } from "@lib/logging";

const log = moduleLogger("db-models/listing");

export const LIST_TOTAL_CAP = 10_000;

const OFFSET_CURSOR = /^\d+$/;

const PAGE_PARAMS: ReadonlySet<string> = new Set<keyof ListRequest>([
  "sort",
  "dir",
  "limit",
  "cursor",
  "withTotal",
]);

export interface ListRequest<Sort extends string = string> {
  sort?: Sort;
  dir: "asc" | "desc";
  limit: number;
  cursor?: string;
  withTotal: boolean;
}

export interface ListResult<Row> {
  items: Row[];
  nextCursor: string | null;
  total: { count: number; capped: boolean } | null;
}

export type ListFilter<Value> = (value: Value) => SQL | undefined;

type Fields<Select extends SQLiteSelect> = Select["_"]["selectedFields"];

type ColumnKey<Select extends SQLiteSelect> = {
  [K in keyof Fields<Select>]: Fields<Select>[K] extends SQLiteColumn
    ? K
    : never;
}[keyof Fields<Select>] &
  string;

type FilterKey<Request> = Exclude<keyof Request & string, keyof ListRequest>;

type FilterValue<Request, K extends keyof Request> = NonNullable<Request[K]>;

type ColumnFilterKey<Select extends SQLiteSelect, Request> = {
  [K in FilterKey<Request>]: K extends keyof Fields<Select>
    ? Fields<Select>[K] extends { _: { data: infer Data } }
      ? FilterValue<Request, K> extends Data
        ? K
        : never
      : never
    : never;
}[FilterKey<Request>];

// A filter named after a same-typed selected column is an equality test by
// default; any other filter needs a function.
type ListFilters<Select extends SQLiteSelect, Request> = {
  [K in Exclude<
    FilterKey<Request>,
    ColumnFilterKey<Select, Request>
  >]: ListFilter<FilterValue<Request, K>>;
} & {
  [K in ColumnFilterKey<Select, Request>]?: ListFilter<FilterValue<Request, K>>;
};

type SelectsId<Select extends SQLiteSelect> =
  "id" extends ColumnKey<Select> ? unknown : { selectAnIdColumn: never };

export type ListOptions<Select extends SQLiteSelect, Request> = {
  defaultSort?: ColumnKey<Select>;
} & (object extends ListFilters<Select, Request>
  ? { filters?: ListFilters<Select, Request> }
  : { filters: ListFilters<Select, Request> });

// Applies a list query to a `$dynamic()` select: the caller's own `where()` is
// kept, the sort column and `id` come from the selection. A cursor is either a
// list offset or the id of the row to continue after; the row form compares
// `(sort column, id)` against that row so the database reads only the page.
export async function paginate<
  Select extends SQLiteSelect,
  Request extends ListRequest<ColumnKey<Select>>,
>(
  select: Select & SelectsId<Select>,
  request: Request,
  options: ListOptions<Select, Request>,
): Promise<ListResult<Awaited<Select>[number]>> {
  const fields: Record<string, unknown> = select._.selectedFields;
  const id = columnOf(fields, "id");
  const sortName = request.sort ?? options.defaultSort;
  const sortColumn = sortName === undefined ? null : columnOf(fields, sortName);
  const position = parsePosition(request.cursor);
  const where = and(
    select._.config.where,
    ...filterConditions(fields, request, options.filters ?? {}),
  );
  const counted = request.withTotal
    ? select
        .where(where)
        .limit(LIST_TOTAL_CAP + 1)
        .as("counted")
    : null;
  const [rows, total] = await Promise.all([
    select
      .where(and(where, afterRow(id, sortColumn, request.dir, position.after)))
      .orderBy(...orderFor(id, sortColumn, request.dir))
      .limit(request.limit + 1)
      .offset(position.offset),
    counted ? countCapped(counted) : null,
  ]);
  const items = rows.slice(0, request.limit);
  const hasMore = rows.length > request.limit;
  const last = items.at(-1) as { id: unknown } | undefined;
  log.debug("listed a page", {
    sort: sortName ?? "id",
    dir: request.dir,
    from: position.after === undefined ? "offset" : "row",
    offset: position.offset,
    returned: items.length,
    hasMore,
  });
  return {
    items,
    nextCursor: hasMore && last !== undefined ? String(last.id) : null,
    total,
  };
}

// A "contains every term" search, with LIKE wildcards in the terms escaped.
export function matchesAllTerms(
  expression: SQLiteColumn | SQL,
  terms: string[],
): SQL | undefined {
  return and(
    ...terms.map(
      (term) =>
        sql`${expression} like ${`%${escapeLikePattern(term)}%`} escape '\\'`,
    ),
  );
}

export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

function columnOf(fields: Record<string, unknown>, name: string): SQLiteColumn {
  const column = fields[name];
  if (!is(column, Column)) {
    throw new Error(`"${name}" is not a selected column`);
  }
  return column as SQLiteColumn;
}

function filterConditions(
  fields: Record<string, unknown>,
  request: object,
  filters: Partial<Record<string, ListFilter<never>>>,
): (SQL | undefined)[] {
  return Object.entries(request)
    .filter(([key, value]) => !PAGE_PARAMS.has(key) && value !== undefined)
    .map(([key, value]) => {
      const filter = filters[key] as ListFilter<unknown> | undefined;
      return filter ? filter(value) : eq(columnOf(fields, key), value);
    });
}

function parsePosition(cursor: string | undefined): {
  after?: string;
  offset: number;
} {
  if (cursor === undefined) {
    return { offset: 0 };
  }
  return OFFSET_CURSOR.test(cursor)
    ? { offset: Number(cursor) }
    : { after: cursor, offset: 0 };
}

function afterRow(
  id: SQLiteColumn,
  sortColumn: SQLiteColumn | null,
  dir: "asc" | "desc",
  afterId: string | undefined,
): SQL | undefined {
  if (afterId === undefined) {
    return undefined;
  }
  if (sortColumn === null) {
    return (dir === "asc" ? gt : lt)(id, afterId);
  }
  const comparison = sql.raw(dir === "asc" ? ">" : "<");
  return sql`(${sortColumn}, ${id}) ${comparison} (select ${sortColumn}, ${id} from ${id.table} where ${id} = ${afterId})`;
}

function orderFor(
  id: SQLiteColumn,
  sortColumn: SQLiteColumn | null,
  dir: "asc" | "desc",
): SQL[] {
  const direction = dir === "asc" ? asc : desc;
  return sortColumn === null
    ? [direction(id)]
    : [direction(sortColumn), direction(id)];
}

async function countCapped(
  counted: Subquery,
): Promise<{ count: number; capped: boolean }> {
  const rows = await getDb()
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(counted);
  const count = rows[0]?.count ?? 0;
  log.debug("counted a list", { count, capped: count > LIST_TOTAL_CAP });
  return {
    count: Math.min(count, LIST_TOTAL_CAP),
    capped: count > LIST_TOTAL_CAP,
  };
}
