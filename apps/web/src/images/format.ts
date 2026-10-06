export function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024))
}
