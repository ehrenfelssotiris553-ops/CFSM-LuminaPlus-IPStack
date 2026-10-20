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

/**
 * 节点「有哪种协议」：单台设了显示 / 隐藏就以它为准，自动时看后端标记。
 *
 * 和 {@link resolveIpStackVisibility} 的区别是不看全站「默认显示 V4 / V6 标签」开关 —— 那两个开关决定标签画不画，
 * 不代表节点没有这种协议。首页按协议筛选、总览统计都用这个口径。
 */
export function resolveIpStackCapability(
  node: { uuid: string; ipv4?: string | null; ipv6?: string | null },
  overrides: IpStackOverridesByNode,
): IpStackVisibility {
  const override = getIpStackOverride(overrides, node.uuid);
  return {
    ipv4: override.ipv4 ?? Boolean(node.ipv4),
    ipv6: override.ipv6 ?? Boolean(node.ipv6),
  };
}

export type IpStackCategory = "dual" | "ipv4" | "ipv6" | "none";
export const IP_STACK_CATEGORIES = ["dual", "ipv4", "ipv6"] as const;

export function ipStackCategory(stack: IpStackVisibility): IpStackCategory {
  if (stack.ipv4 && stack.ipv6) return "dual";
  if (stack.ipv4) return "ipv4";
  if (stack.ipv6) return "ipv6";
  return "none";
}

/** 各协议类别的节点数；没有任何标记的节点不计入三类，单独记在 `none`。 */
export function countIpStackCategories(
  nodes: readonly { uuid: string; ipv4?: string | null; ipv6?: string | null }[],
  overrides: IpStackOverridesByNode,
): Record<IpStackCategory, number> {
  const counts: Record<IpStackCategory, number> = { dual: 0, ipv4: 0, ipv6: 0, none: 0 };
  for (const node of nodes) counts[ipStackCategory(resolveIpStackCapability(node, overrides))] += 1;
  return counts;
}

/**
 * 一次给多台节点设同一个模式（设置页「按分组批量设置」）。`mode` 为 null 表示这个协议不动。
 */
export function setIpStackModeForNodes(
  byNode: IpStackOverridesByNode,
  uuids: readonly string[],
  modes: Partial<Record<keyof IpStackVisibility, IpStackMode | null>>,
): IpStackOverridesByNode {
  let next = byNode;
  for (const uuid of uuids) {
    for (const protocol of ["ipv4", "ipv6"] as const) {
      const mode = modes[protocol];
      if (mode) next = setIpStackMode(next, uuid, protocol, mode);
    }
  }
  return next;
}
