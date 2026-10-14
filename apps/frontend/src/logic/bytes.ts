// "235 B", "12.4 KB", "1.4 MB".
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// How much bigger or smaller: "+1.2 KB", "−40 B", "±0 B".
export function formatBytesChange(change: number): string {
  const sign = change > 0 ? "+" : change < 0 ? "−" : "±";
  return `${sign}${formatBytes(Math.abs(change))}`;
}
