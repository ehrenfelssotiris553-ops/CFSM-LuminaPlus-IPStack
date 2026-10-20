/** Only a field edited locally and changed remotely to a third value conflicts. */
export function findThemeConflicts(base: unknown, remote: unknown, desired: unknown, path = ""): string[] {
  if (JSON.stringify(base) === JSON.stringify(desired) || JSON.stringify(remote) === JSON.stringify(base) || JSON.stringify(remote) === JSON.stringify(desired)) return [];
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
  if ((object(base) || base === undefined) && (object(remote) || remote === undefined) && (object(desired) || desired === undefined)) {
    const a = object(base) ? base : {}, b = object(remote) ? remote : {}, c = object(desired) ? desired : {};
    return [...new Set([...Object.keys(a), ...Object.keys(c)])].flatMap((key) => findThemeConflicts(a[key], b[key], c[key], path ? `${path}.${key}` : key));
  }
  return [path];
}

export class ThemeSyncConflictError extends Error {
  constructor(readonly fields: string[]) {
    super("Theme configuration changed on another device");
    this.name = "ThemeSyncConflictError";
  }
}
