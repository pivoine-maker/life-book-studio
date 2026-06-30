export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${id}`;
}
