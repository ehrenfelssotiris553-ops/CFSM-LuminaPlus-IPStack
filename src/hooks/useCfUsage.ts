import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { getCfUsage } from "@/services/api";
import { cfUsageQueryTiming } from "@/utils/cfUsage";

export const CF_USAGE_QUERY_KEY = ["cf-usage"] as const;

/**
 * 首页 CF 用量。只有登录站长、且设置里开着时才查；查几次由「刷新方式」决定（见 cfUsageQueryTiming）。
 * 结果一直留在内存里（gcTime 无限）：「每次打开首页查一次」指每次加载页面，详情页回来不重查。
 */
export function useCfUsage() {
  const { data: me } = useAuth();
  const settings = useThemeSettings();
  const visible = me?.logged_in === true && settings.isReady && settings.showCfUsage;
  const timing = cfUsageQueryTiming(settings.cfUsageRefreshMode, settings.cfUsageRefreshMinutes);
  const query = useQuery({
    queryKey: CF_USAGE_QUERY_KEY,
    // 不接组件卸载的取消信号：接了的话面板一重挂（首页从「还没有节点」切到列表、开发模式的双挂载），
    // 半路的请求被取消再重发，后端就连查两遍 Cloudflare。让它跑完，结果留着给重挂后的面板用。
    queryFn: () => getCfUsage(),
    enabled: visible && timing.autoFetch,
    staleTime: timing.staleTime,
    gcTime: Number.POSITIVE_INFINITY,
    refetchInterval: visible ? timing.refetchInterval : false,
    refetchOnWindowFocus: timing.refetchOnWindowFocus,
    // 没配 Token、没权限这类错误重试也没用；临时的网络问题等下次刷新。
    retry: false,
  });
  return { visible, mode: settings.cfUsageRefreshMode, query };
}
