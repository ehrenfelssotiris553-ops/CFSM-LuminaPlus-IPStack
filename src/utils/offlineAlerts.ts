import { t } from "@/i18n";

/** 一台节点的在线状态（null = 还不知道）。 */
export interface NodeOnlineState {
  uuid: string;
  name: string;
  online: boolean | null;
}

export function countOfflineNodes(nodes: readonly NodeOnlineState[]): number {
  let count = 0;
  for (const node of nodes) if (node.online === false) count += 1;
  return count;
}

/** 浏览器标签页标题：有节点离线时在站点名前加「(N 离线)」，切到别的标签页也看得到。 */
export function formatSiteTitle(siteName: string, offlineCount: number, enabled: boolean): string {
  return enabled && offlineCount > 0 ? t("title.offlinePrefix", { n: offlineCount, site: siteName }) : siteName;
}

/**
 * 两次状态之间谁掉线了、谁恢复了。只认「在线 → 离线」和「离线 → 在线」：
 * 第一次看到的节点、状态未知的节点都不算，免得一打开页面就把本来就离线的节点报一遍。
 */
export function findOnlineTransitions(
  previous: ReadonlyMap<string, boolean | null>,
  next: readonly NodeOnlineState[],
): { offline: NodeOnlineState[]; recovered: NodeOnlineState[] } {
  const offline: NodeOnlineState[] = [];
  const recovered: NodeOnlineState[] = [];
  for (const node of next) {
    if (!previous.has(node.uuid)) continue;
    const before = previous.get(node.uuid);
    if (before === true && node.online === false) offline.push(node);
    else if (before === false && node.online === true) recovered.push(node);
  }
  return { offline, recovered };
}

const NOTIFY_NAME_LIMIT = 5;

/** 通知正文：节点名列出前几台，多了写「等 N 台」。 */
export function formatNodeNames(nodes: readonly NodeOnlineState[]): string {
  const names = nodes.slice(0, NOTIFY_NAME_LIMIT).map((node) => node.name);
  const joined = names.join(t("settings.listJoiner"));
  return nodes.length > NOTIFY_NAME_LIMIT ? t("notify.andMore", { names: joined, n: nodes.length }) : joined;
}

/* ---- 掉线通知开关：只存本机（通知权限本来就是每台设备、每个浏览器各自授予的） ---- */

export const OFFLINE_NOTIFY_STORAGE_KEY = "cfsm-luminaplus:offline-notify";
const notifyListeners = new Set<() => void>();

export function readOfflineNotifyEnabled(): boolean {
  try {
    return window.localStorage.getItem(OFFLINE_NOTIFY_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeOfflineNotifyEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(OFFLINE_NOTIFY_STORAGE_KEY, "1");
    else window.localStorage.removeItem(OFFLINE_NOTIFY_STORAGE_KEY);
  } catch {
    // 写不进去就只在这次打开页面里生效。
  }
  for (const listener of notifyListeners) listener();
}

export function subscribeOfflineNotifyEnabled(listener: () => void): () => void {
  notifyListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === OFFLINE_NOTIFY_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    notifyListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export type NotificationSupport = "unsupported" | "default" | "granted" | "denied";

export function notificationSupport(): NotificationSupport {
  if (typeof window === "undefined" || typeof window.Notification === "undefined") return "unsupported";
  return window.Notification.permission;
}
