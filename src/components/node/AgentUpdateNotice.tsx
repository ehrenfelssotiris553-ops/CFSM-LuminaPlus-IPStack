import { useMemo } from "react";
import { ArrowUpCircle } from "lucide-react";
import { t } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useAllNodeMeta } from "@/hooks/useNode";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { getAdminUrl } from "@/services/cfsm/config";
import { findOutdatedAgents } from "@/utils/agentVersion";
import { formatNodeNames } from "@/utils/offlineAlerts";
import { formatVersionLabel } from "@/utils/versionCompare";

/**
 * 「N 台 Agent 可更新」：只有登录站长看得到（最新版本号 `/api/config` 只发给站长），
 * 用的都是页面已经拿到的数据，不多发请求。首页隐藏的节点也算进去 —— 隐藏只是不展示，Agent 照样要升级。
 */
export function AgentUpdateNotice() {
  const { data: me } = useAuth();
  const { data: config } = usePublicConfig();
  const settings = useThemeSettings();
  const nodes = useAllNodeMeta();
  const latest = config?.latestAgentVersion ?? "";
  const enabled = me?.logged_in === true && settings.isReady && settings.showAgentUpdateHint;
  const outdated = useMemo(
    () => (enabled ? findOutdatedAgents(nodes, latest) : []),
    [enabled, nodes, latest],
  );
  if (outdated.length === 0) return null;

  const allNames = outdated
    .map((node) => t("agentUpdate.nodeVersion", { name: node.name, version: formatVersionLabel(node.agent_version) }))
    .join("\n");
  return (
    <p className="home-admin-notice" role="status">
      <ArrowUpCircle size={14} aria-hidden className="home-admin-notice-icon" />
      <span className="home-admin-notice-text">
        {t("agentUpdate.notice", { n: outdated.length, version: formatVersionLabel(latest) })}
      </span>
      <span className="home-admin-notice-names" title={allNames}>
        {formatNodeNames(outdated)}
      </span>
      <a href={getAdminUrl()} className="home-admin-notice-link">
        {t("agentUpdate.openAdmin")}
      </a>
    </p>
  );
}
