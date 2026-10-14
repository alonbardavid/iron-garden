// A path with query parameters, leaving slashes in values readable
// (?file=src/app.ts). Empty values are left out.
export function withQuery(
  path: string,
  params: Record<string, string | null | undefined>,
): string {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(
      ([key, value]) =>
        `${key}=${encodeURIComponent(value).replace(/%2F/g, "/")}`,
    )
    .join("&");
  return query ? `${path}?${query}` : path;
}
