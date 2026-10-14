// Raster images a browser shows, by extension. SVG is left out: it is text,
// read and previewed as such.
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

export function imageTypeOf(path: string): string | null {
  const dot = path.lastIndexOf(".");
  return dot < 0
    ? null
    : (IMAGE_TYPES[path.slice(dot + 1).toLowerCase()] ?? null);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
