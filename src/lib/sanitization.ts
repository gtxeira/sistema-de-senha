export function sanitizeNull<T>(value: T): T | null {
  if (value === "null" || value === "undefined" || value === "") {
    return null;
  }
  return value;
}