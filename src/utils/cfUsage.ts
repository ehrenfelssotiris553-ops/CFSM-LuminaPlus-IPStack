import { ApiRequestError } from "@/services/cfsm/http";
import type { CfUsageDay } from "@/types/cfsm";

/**
 * 首页 CF 用量面板的口径和刷新规则。数据来自后台「查询 CF 用量」（见 api.ts 的 getCfUsage），
 * 这里只放纯函数，方便测试。
 */

/** 刷新方式：open = 每次打开首页查一次，manual = 只在点刷新时查，interval = 定时查。 */
export const CF_USAGE_REFRESH_MODES = ["open", "manual", "interval"] as const;
export type CfUsageRefreshMode = (typeof CF_USAGE_REFRESH_MODES)[number];

/** 定时刷新的档位（分钟）。最短 5 分钟：Cloudflare 的统计本身就晚几分钟，查得再勤也看不到新数。 */
export const CF_USAGE_REFRESH_MINUTES = [5, 10, 30, 60] as const;
export const DEFAULT_CF_USAGE_REFRESH_MINUTES = 10;

export function normalizeCfUsageRefreshMode(value: unknown): CfUsageRefreshMode {
  return (CF_USAGE_REFRESH_MODES as readonly unknown[]).includes(value)
    ? (value as CfUsageRefreshMode)
    : "open";
}

export function normalizeCfUsageRefreshMinutes(value: unknown): number {
  const minutes = typeof value === "string" ? Number(value) : value;
  return (CF_USAGE_REFRESH_MINUTES as readonly unknown[]).includes(minutes)
    ? (minutes as number)
    : DEFAULT_CF_USAGE_REFRESH_MINUTES;
}

export interface CfUsageQueryTiming {
  /** 打开首页时自己查；false 时只有点刷新才查。 */
  autoFetch: boolean;
  staleTime: number;
  refetchInterval: number | false;
  /** 切回前台时如果已经过了刷新间隔，补查一次。 */
  refetchOnWindowFocus: boolean;
}

/**
 * 三种刷新方式对应的查询节奏。「每次打开」= 每次加载页面查一次：从详情页回到首页、切标签页回来都不重查。
 * 定时刷新在页面切到后台时不查（TanStack Query 默认 refetchIntervalInBackground = false）。
 */
export function cfUsageQueryTiming(mode: CfUsageRefreshMode, minutes: number): CfUsageQueryTiming {
  if (mode === "interval") {
    const interval = normalizeCfUsageRefreshMinutes(minutes) * 60_000;
    return { autoFetch: true, staleTime: interval, refetchInterval: interval, refetchOnWindowFocus: true };
  }
  return {
    autoFetch: mode === "open",
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  };
}

/** 免费版每天的额度，和后台用量弹窗用的同一组数（按 UTC 日计）。 */
export const CF_FREE_DAILY_LIMITS = {
  rowsRead: 5_000_000,
  rowsWritten: 100_000,
  workersRequests: 100_000,
  durableObjectsRequests: 100_000,
  durableObjectsDuration: 13_000,
} as const;

export type CfUsageMetric = keyof typeof CF_FREE_DAILY_LIMITS;
export const CF_USAGE_METRICS: readonly CfUsageMetric[] = [
  "rowsRead",
  "rowsWritten",
  "workersRequests",
  "durableObjectsRequests",
  "durableObjectsDuration",
];

export type CfUsageLevel = "ok" | "warn" | "danger";

export interface CfUsageMeter {
  metric: CfUsageMetric;
  used: number;
  limit: number;
  /** 用了多少比例，可以超过 1。 */
  ratio: number;
  level: CfUsageLevel;
}

export function cfUsageLevel(ratio: number): CfUsageLevel {
  if (ratio >= 0.9) return "danger";
  if (ratio >= 0.7) return "warn";
  return "ok";
}

export function cfUsageMeters(day: CfUsageDay): CfUsageMeter[] {
  return CF_USAGE_METRICS.map((metric) => {
    const used = Math.max(0, day[metric]);
    const limit = CF_FREE_DAILY_LIMITS[metric];
    const ratio = used / limit;
    return { metric, used, limit, ratio, level: cfUsageLevel(ratio) };
  });
}

/** 收起时摘要里放哪几项：用得最多的排前面。 */
export function topCfUsageMeters(meters: readonly CfUsageMeter[], count = 2): CfUsageMeter[] {
  return [...meters].sort((a, b) => b.ratio - a.ratio).slice(0, count);
}

/** 百分比文字：不到 10% 留一位小数，有用量但不到 0.1% 写「<0.1%」，免得看着像没用。 */
export function formatCfUsagePercent(ratio: number): string {
  const pct = ratio * 100;
  if (pct > 0 && pct < 0.1) return "<0.1%";
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

/** 本地时间几点清零：「今天」按 UTC 算，北京时间是 08:00。 */
export function cfUsageResetTime(locale: string, now = new Date()): string {
  const nextUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(
    nextUtcMidnight,
  );
}

export type CfUsageErrorKind = "notConfigured" | "loginExpired" | "unavailable" | "failed";

/**
 * 出错原因分四类给面板显示：
 * - notConfigured：后台没填 CF Token 或 Account ID；
 * - loginExpired：登录过期（401）。有令牌时请求层会清掉它、首页随即按访客显示；只剩 Cookie 的登录没东西可清，在这里提示；
 * - unavailable：后台接口没了或返回格式变了（探针升级改了接口）；
 * - failed：其它，比如 Token 没有统计权限、网络超时，带上原始信息。
 */
export function classifyCfUsageError(error: unknown): { kind: CfUsageErrorKind; detail: string } {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  if (error instanceof ApiRequestError) {
    if (detail === "cloudflareTokenRequired" || detail === "cloudflareAccountIdRequired") {
      return { kind: "notConfigured", detail };
    }
    if (error.status === 401) return { kind: "loginExpired", detail };
    if (error.status === 404 || error.status === 405) return { kind: "unavailable", detail };
    return { kind: "failed", detail };
  }
  if (detail.startsWith("Schema mismatch")) return { kind: "unavailable", detail };
  return { kind: "failed", detail };
}
