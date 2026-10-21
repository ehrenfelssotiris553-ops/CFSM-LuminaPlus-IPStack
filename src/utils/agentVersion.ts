import { compareVersions, isNewerVersion } from "@/utils/versionCompare";

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

/**
 * 这次要提醒升级到哪个版本；不提醒时返回空串。站长点过「忽略此版本」就不再提醒这一版（和更早的），
 * Agent 出了更新的版本再提醒 —— 想晚点升级时不用把提醒整个关掉、结果错过下一版。
 */
export function agentUpdateTarget(latest: string, ignored: string, enabled: boolean): string {
  if (!enabled || !latest) return "";
  if (ignored) {
    const cmp = compareVersions(latest, ignored);
    if (cmp != null ? cmp <= 0 : latest.trim() === ignored.trim()) return "";
  }
  return latest;
}
