export const THEME_FALLBACK_TITLE = "CF-Server-Monitor";
export const SITE_SYNC_MARKER_KEY = "luminaplusSyncedAt";

export function themeSyncMarkerOf(themeOptions: Record<string, unknown> | undefined): number | null {
  const value = themeOptions?.[SITE_SYNC_MARKER_KEY];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
