/** Homepage badges only: these preferences never change a node's reported addresses or probes. */
export interface IpStackVisibility {
  ipv4: boolean;
  ipv6: boolean;
}

export type IpStackOverride = Partial<IpStackVisibility>;
export type IpStackOverridesByNode = Readonly<Record<string, IpStackOverride>>;
export type IpStackMode = "auto" | "show" | "hide";
/** Local-only, sparse edits. "auto" is explicit so an undo survives an in-flight save. */
export type IpStackEdits = Readonly<Record<string, Partial<Record<keyof IpStackVisibility, boolean | "auto">>>>;
export const LOCAL_IP_STACK_EDITS_KEY = "__luminaplusIpStackEdits";

export function normalizeIpStackEdits(value: unknown): IpStackEdits {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries: Array<[string, Partial<Record<keyof IpStackVisibility, boolean | "auto">>]> = [];
  for (const [uuid, raw] of Object.entries(value)) {
    if (!uuid || uuid === "__proto__" || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const edit: Partial<Record<keyof IpStackVisibility, boolean | "auto">> = {};
    for (const protocol of ["ipv4", "ipv6"] as const) {
      if (Object.hasOwn(row, protocol) && (typeof row[protocol] === "boolean" || row[protocol] === "auto")) {
        edit[protocol] = row[protocol] as boolean | "auto";
      }
    }
    if (Object.keys(edit).length > 0) entries.push([uuid, edit]);
  }
  return Object.fromEntries(entries);
}

export function diffIpStackOverrides(before: IpStackOverridesByNode, after: IpStackOverridesByNode): IpStackEdits {
  const edits: Record<string, Partial<Record<keyof IpStackVisibility, boolean | "auto">>> = {};
  for (const uuid of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!uuid || uuid === "__proto__") continue;
    const previous = getIpStackOverride(before, uuid);
    const next = getIpStackOverride(after, uuid);
    const edit: Partial<Record<keyof IpStackVisibility, boolean | "auto">> = {};
    for (const protocol of ["ipv4", "ipv6"] as const) {
      if (previous[protocol] !== next[protocol]) edit[protocol] = next[protocol] ?? "auto";
    }
    if (Object.keys(edit).length > 0) edits[uuid] = edit;
  }
  return edits;
}

export function mergeIpStackEdits(previous: IpStackEdits, incoming: IpStackEdits): IpStackEdits {
  return Object.fromEntries(
    [...new Set([...Object.keys(previous), ...Object.keys(incoming)])]
      .filter((uuid) => uuid && uuid !== "__proto__")
      .map((uuid) => [uuid, {
        ...(Object.hasOwn(previous, uuid) ? previous[uuid] : {}),
        ...(Object.hasOwn(incoming, uuid) ? incoming[uuid] : {}),
      }]),
  );
}

export function applyIpStackEdits(base: IpStackOverridesByNode, edits: IpStackEdits): IpStackOverridesByNode {
  const result = { ...base };
  for (const [uuid, edit] of Object.entries(edits)) {
    if (!uuid || uuid === "__proto__") continue;
    const entry = { ...getIpStackOverride(result, uuid) };
    for (const protocol of ["ipv4", "ipv6"] as const) {
      if (!Object.hasOwn(edit, protocol)) continue;
      if (edit[protocol] === "auto") delete entry[protocol];
      else if (typeof edit[protocol] === "boolean") entry[protocol] = edit[protocol];
    }
    if (Object.keys(entry).length === 0) delete result[uuid];
    else result[uuid] = entry;
  }
  return normalizeIpStackOverrides(result);
}

export function normalizeIpStackOverrides(value: unknown): IpStackOverridesByNode {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries: Array<[string, IpStackOverride]> = [];
  for (const [uuid, raw] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
    if (!uuid || uuid === "__proto__" || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const entry: IpStackOverride = {};
    for (const protocol of ["ipv4", "ipv6"] as const) {
      if (Object.hasOwn(row, protocol) && typeof row[protocol] === "boolean") {
        entry[protocol] = row[protocol];
      }
    }
    if (Object.keys(entry).length > 0) entries.push([uuid, entry]);
  }
  return Object.fromEntries(entries);
}

export function getIpStackOverride(byNode: IpStackOverridesByNode, uuid: string): IpStackOverride {
  return Object.hasOwn(byNode, uuid) ? byNode[uuid]! : {};
}

export function setIpStackMode(
  byNode: IpStackOverridesByNode,
  uuid: string,
  protocol: keyof IpStackVisibility,
  mode: IpStackMode,
): IpStackOverridesByNode {
  if (!uuid || uuid === "__proto__") return byNode;
  const entry = { ...getIpStackOverride(byNode, uuid) };
  if (mode === "auto") delete entry[protocol];
  else entry[protocol] = mode === "show";
  const next = { ...byNode };
  if (Object.keys(entry).length === 0) delete next[uuid];
  else next[uuid] = entry;
  return normalizeIpStackOverrides(next);
}

export function ipStackMode(value: boolean | undefined): IpStackMode {
  return value === undefined ? "auto" : value ? "show" : "hide";
}

export function resolveIpStackVisibility(
  node: { uuid: string; ipv4?: string | null; ipv6?: string | null },
  settings: { showIpv4: boolean; showIpv6: boolean; homepageIpStackOverrides: IpStackOverridesByNode },
): IpStackVisibility {
  const override = getIpStackOverride(settings.homepageIpStackOverrides, node.uuid);
  return {
    ipv4: override.ipv4 ?? (settings.showIpv4 && Boolean(node.ipv4)),
    ipv6: override.ipv6 ?? (settings.showIpv6 && Boolean(node.ipv6)),
  };
}
