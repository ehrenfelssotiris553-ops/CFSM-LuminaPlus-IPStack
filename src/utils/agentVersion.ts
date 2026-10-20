import { isNewerVersion } from "@/utils/versionCompare";

export interface AgentVersionSource {
  uuid: string;
  name: string;
  agent_version: string;
}

/**
 * 找出 Agent 比最新版旧的节点。最新版本号来自 `/api/config`（只对登录站长下发）。
 * 版本号认不出、或节点没上报版本的不算 —— 宁可漏报也不乱报（和页脚版本提醒同一个原则）。
 */
export function findOutdatedAgents<T extends AgentVersionSource>(nodes: readonly T[], latest: string): T[] {
  if (!latest) return [];
  return nodes.filter((node) => isNewerVersion(latest, node.agent_version));
}
