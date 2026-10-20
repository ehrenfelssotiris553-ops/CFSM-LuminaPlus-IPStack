import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { t } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import {
  getAllNodeMetaSnapshot,
  getNodeOnlineSummariesSnapshot,
  getStoreStatusSnapshot,
  subscribeAllNodes,
  subscribeNodeOnlineSummaries,
  subscribeStoreStatus,
} from "@/services/wsStore";
import { collectMatchingNodeUuids } from "@/utils/nodeIdentity";
import {
  findOnlineTransitions,
  formatNodeNames,
  notificationSupport,
  readOfflineNotifyEnabled,
  subscribeOfflineNotifyEnabled,
  type NodeOnlineState,
} from "@/utils/offlineAlerts";

/**
 * 当前可见节点的在线状态，**只读、不启动实时 store**。
 *
 * 标题和掉线通知在每个页面都挂着（AppShell），用 useNodeOnlineSummaries 的话会顺手 retainStore，
 * 设置页上也会去拉 `/api/servers` —— 违反「列表只在首页首次进入查一次」。这里只订阅已有的数据：
 * 首页 / 详情页把 store 跑起来时才有（`active`），其余页面 `active` 为 false。
 * 可见性口径和首页一致：后台隐藏的节点只给登录站长算，主题里隐藏的节点谁都不算。
 */
export function useVisibleOnlineStates(): { active: boolean; nodes: NodeOnlineState[] } {
  const status = useSyncExternalStore(subscribeStoreStatus, getStoreStatusSnapshot, getStoreStatusSnapshot);
  const online = useSyncExternalStore(subscribeNodeOnlineSummaries, getNodeOnlineSummariesSnapshot, getNodeOnlineSummariesSnapshot);
  const meta = useSyncExternalStore(subscribeAllNodes, getAllNodeMetaSnapshot, getAllNodeMetaSnapshot);
  const { data: me } = useAuth();
  const { hiddenNodes } = useThemeSettings();
  const loggedIn = me?.logged_in === true;

  const nodes = useMemo(() => {
    const hidden = collectMatchingNodeUuids(meta, hiddenNodes);
    const metaByUuid = new Map(meta.map((node) => [node.uuid, node]));
    return online.flatMap(({ uuid, online: isOnline }) => {
      const node = metaByUuid.get(uuid);
      if (!node || (node.hidden && !loggedIn) || hidden.has(uuid)) return [];
      return [{ uuid, name: node.name?.trim() || uuid, online: isOnline }];
    });
  }, [hiddenNodes, loggedIn, meta, online]);

  return { active: status.hydrated, nodes };
}

export function useOfflineNotifyEnabled(): boolean {
  return useSyncExternalStore(subscribeOfflineNotifyEnabled, readOfflineNotifyEnabled, readOfflineNotifyEnabled);
}

/**
 * 掉线、恢复各用一个 tag：同一 tag 的新通知会替换旧的，两种共用的话同一时刻既有掉线又有恢复，
 * 掉线那条会被恢复那条顶掉。同一种的新通知替换旧的正好（只看最新一批）。
 */
function showNotification(kind: "offline" | "recovered", title: string, body: string) {
  try {
    const notification = new window.Notification(title, { body, tag: `cfsm-luminaplus-${kind}`, lang: document.documentElement.lang });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // 有的浏览器（安卓 Chrome）只允许经 Service Worker 发通知，构造函数直接抛错：静默跳过。
  }
}

/**
 * 节点掉线 / 恢复时弹浏览器通知。只在本机开了开关、浏览器授了权时发。
 *
 * 只有页面在前台时有效：后端主题规范要求页面进后台就断开实时连接，后台期间收不到数据，也就判断不了掉线。
 * 同一时刻多台一起变化合成一条通知；store 重新开始（从设置页回首页）时先记一份基线，不补报。
 */
export function useOfflineNotifications() {
  const { active, nodes } = useVisibleOnlineStates();
  const enabled = useOfflineNotifyEnabled();
  const previous = useRef<Map<string, boolean | null> | null>(null);

  useEffect(() => {
    if (!active) {
      previous.current = null;
      return;
    }
    const before = previous.current;
    previous.current = new Map(nodes.map((node) => [node.uuid, node.online]));
    if (!before || !enabled || notificationSupport() !== "granted") return;
    const { offline, recovered } = findOnlineTransitions(before, nodes);
    if (offline.length > 0) {
      showNotification("offline", t("notify.offlineTitle", { n: offline.length }), formatNodeNames(offline));
    }
    if (recovered.length > 0) {
      showNotification("recovered", t("notify.recoveredTitle", { n: recovered.length }), formatNodeNames(recovered));
    }
  }, [active, enabled, nodes]);
}
