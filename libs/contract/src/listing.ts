import { z } from "zod";

export const LIST_SORT_DIRECTIONS = ["asc", "desc"] as const;
export const LIST_MAX_OFFSET = 10_000;
export const LIST_TOTAL_CAP = 10_000;
export const LIST_MAX_SEARCH_LENGTH = 100;

const OFFSET_CURSOR = /^\d+$/;

export type ListSortDirection = (typeof LIST_SORT_DIRECTIONS)[number];

type ScalarKey<Item extends z.ZodObject> = {
  [K in keyof z.infer<Item>]-?: z.infer<Item>[K] extends
    | string
    | number
    | boolean
    ? K
    : never;
}[keyof z.infer<Item>] &
  string;

type QueryValue<Value> = z.ZodOptional<z.ZodType<Value, unknown>>;

type ScalarFilters<Item extends z.ZodObject> = {
  [K in ScalarKey<Item>]: QueryValue<z.infer<Item>[K]>;
};

// The query of a paged list endpoint: search, sort, page position and, unless
// `filters` says otherwise, an equality filter per scalar property of the item.
// Every value arrives as a string, so numbers and flags are coerced.
export function listQuerySchema<
  Item extends z.ZodObject,
  const Sorts extends readonly ScalarKey<Item>[] = ScalarKey<Item>[],
  Filters extends z.ZodRawShape = ScalarFilters<Item>,
>(
  item: Item,
  options: {
    sorts?: Sorts;
    filters?: Filters;
    defaultLimit?: number;
    maxLimit?: number;
  } = {},
) {
  const sorts = options.sorts ?? scalarKeys(item);
  return z
    .object({
      q: z.string().trim().max(LIST_MAX_SEARCH_LENGTH).optional(),
      sort: z
        .enum(sorts as [string, ...string[]])
        .optional() as unknown as QueryValue<Sorts[number]>,
      dir: z.enum(LIST_SORT_DIRECTIONS).default("asc"),
      limit: z.coerce
        .number<number>()
        .int()
        .min(1)
        .max(options.maxLimit ?? 200)
        .default(options.defaultLimit ?? 50),
      cursor: listCursorSchema.optional(),
      withTotal: queryFlagSchema.default(false),
    })
    .extend((options.filters ?? scalarFilters(item)) as Filters);
}

export function listPageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: listTotalSchema.nullable(),
  });
}

// A cursor is either a list offset (all digits) or the id of the row to continue after.
export function isOffsetCursor(cursor: string): boolean {
  return OFFSET_CURSOR.test(cursor);
}

export const listCursorSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (cursor) => !isOffsetCursor(cursor) || Number(cursor) <= LIST_MAX_OFFSET,
    { error: `Pages past row ${LIST_MAX_OFFSET} are not served` },
  );

export const listTotalSchema = z.object({
  count: z.number(),
  capped: z.boolean(),
});

const queryFlagSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

function scalarKeys(item: z.ZodObject): string[] {
  return Object.keys(scalarFilters(item));
}

function scalarFilters(item: z.ZodObject): z.ZodRawShape {
  return Object.fromEntries(
    Object.entries(item.shape).flatMap(([key, field]) => {
      const filter = queryValueFor(field);
      return filter ? [[key, filter.optional()]] : [];
    }),
  );
}

function queryValueFor(field: z.ZodType): z.ZodType | null {
  if (field instanceof z.ZodString) {
    return z.string();
  }
  if (field instanceof z.ZodNumber) {
    return z.coerce.number<number>();
  }
  if (field instanceof z.ZodBoolean) {
    return queryFlagSchema;
  }
  return null;
}

export type ListTotal = z.infer<typeof listTotalSchema>;

export interface ListPage<Item> {
  items: Item[];
  nextCursor: string | null;
  total: ListTotal | null;
}
