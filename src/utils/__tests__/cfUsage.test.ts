import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/services/cfsm/http";
import { CfUsageDaySchema } from "@/types/cfsm";
import {
  cfUsageLevel,
  cfUsageMeters,
  cfUsageQueryTiming,
  cfUsageResetTime,
  topCfUsageMeters,
  classifyCfUsageError,
  formatCfUsagePercent,
  normalizeCfUsageRefreshMinutes,
  normalizeCfUsageRefreshMode,
} from "@/utils/cfUsage";
import { normalizeThemeSettings } from "@/utils/themeSettings";

describe("CF usage settings", () => {
  it("defaults to on, refresh on page open, 10-minute interval", () => {
    const settings = normalizeThemeSettings({});
    expect(settings.showCfUsage).toBe(true);
    expect(settings.cfUsageRefreshMode).toBe("open");
    expect(settings.cfUsageRefreshMinutes).toBe(10);
    expect(settings.showAgentUpdateHint).toBe(true);
  });

  it("keeps valid values and falls back on anything else", () => {
    expect(normalizeCfUsageRefreshMode("manual")).toBe("manual");
    expect(normalizeCfUsageRefreshMode("interval")).toBe("interval");
    expect(normalizeCfUsageRefreshMode("hourly")).toBe("open");
    expect(normalizeCfUsageRefreshMinutes(30)).toBe(30);
    expect(normalizeCfUsageRefreshMinutes("60")).toBe(60);
    // 不在档位里的（包括比 5 分钟更勤的）一律回到默认，免得手写配置把 Cloudflare 统计接口查得太勤。
    expect(normalizeCfUsageRefreshMinutes(1)).toBe(10);
    expect(normalizeCfUsageRefreshMinutes(-5)).toBe(10);
    expect(
      normalizeThemeSettings({ showCfUsage: false, cfUsageRefreshMode: "interval", cfUsageRefreshMinutes: 5 }),
    ).toMatchObject({ showCfUsage: false, cfUsageRefreshMode: "interval", cfUsageRefreshMinutes: 5 });
  });
});

describe("cfUsageQueryTiming", () => {
  it("queries once per page load in open mode", () => {
    expect(cfUsageQueryTiming("open", 10)).toEqual({
      autoFetch: true,
      staleTime: Number.POSITIVE_INFINITY,
      refetchInterval: false,
      refetchOnWindowFocus: false,
    });
  });

  it("never queries by itself in manual mode", () => {
    expect(cfUsageQueryTiming("manual", 10)).toMatchObject({ autoFetch: false, refetchInterval: false });
  });

  it("refetches on the interval and catches up when the tab comes back", () => {
    expect(cfUsageQueryTiming("interval", 30)).toEqual({
      autoFetch: true,
      staleTime: 30 * 60_000,
      refetchInterval: 30 * 60_000,
      refetchOnWindowFocus: true,
    });
  });
});

describe("cfUsageMeters", () => {
  it("compares each metric with the free daily limit", () => {
    const day = CfUsageDaySchema.parse({
      rowsRead: 1_000_000,
      rowsWritten: 75_000,
      workersRequests: "95000",
      durableObjectsRequests: 120_000,
      durableObjectsDuration: 11_050.5,
    });
    const meters = cfUsageMeters(day);
    expect(meters.map((meter) => meter.metric)).toEqual([
      "rowsRead",
      "rowsWritten",
      "workersRequests",
      "durableObjectsRequests",
      "durableObjectsDuration",
    ]);
    expect(meters.map((meter) => meter.level)).toEqual(["ok", "warn", "danger", "danger", "warn"]);
    // DO 时长对比每天 13,000 GB-s。
    expect(meters[4]).toMatchObject({ used: 11_050.5, limit: 13_000 });
    expect(meters[0]).toMatchObject({ used: 1_000_000, limit: 5_000_000, ratio: 0.2 });
    // 超额时比例照实给（条子在界面上封顶 100%）。
    expect(meters[3]!.ratio).toBeCloseTo(1.2);
  });

  it("puts the most-used metrics first for the collapsed summary", () => {
    const day = CfUsageDaySchema.parse({ rowsRead: 100_000, workersRequests: 74_000, durableObjectsRequests: 94_000 });
    expect(topCfUsageMeters(cfUsageMeters(day)).map((meter) => meter.metric)).toEqual([
      "durableObjectsRequests",
      "workersRequests",
    ]);
  });

  it("fills missing fields with zero", () => {
    const day = CfUsageDaySchema.parse({});
    expect(cfUsageMeters(day).every((meter) => meter.used === 0 && meter.level === "ok")).toBe(true);
    expect(day.durableObjectsRequestBillingRatio).toBe(20);
  });

  it("levels and percentages", () => {
    expect(cfUsageLevel(0.69)).toBe("ok");
    expect(cfUsageLevel(0.7)).toBe("warn");
    expect(cfUsageLevel(0.9)).toBe("danger");
    expect(formatCfUsagePercent(0)).toBe("0.0%");
    expect(formatCfUsagePercent(0.0004)).toBe("<0.1%");
    expect(formatCfUsagePercent(0.0123)).toBe("1.2%");
    expect(formatCfUsagePercent(0.456)).toBe("46%");
  });
});

describe("cfUsageResetTime", () => {
  it("is the next UTC midnight in local time", () => {
    const format = (date: Date) =>
      new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    expect(cfUsageResetTime("en-GB", new Date("2026-10-21T15:00:00Z"))).toBe(
      format(new Date("2026-10-22T00:00:00Z")),
    );
    expect(cfUsageResetTime("en-GB", new Date("2026-10-21T23:59:00Z"))).toBe(
      format(new Date("2026-10-22T00:00:00Z")),
    );
  });
});

describe("classifyCfUsageError", () => {
  it("tells a missing token apart from an API change and other failures", () => {
    expect(
      classifyCfUsageError(new ApiRequestError("cloudflareTokenRequired", 400, "/admin/api")).kind,
    ).toBe("notConfigured");
    expect(
      classifyCfUsageError(new ApiRequestError("cloudflareAccountIdRequired", 400, "/admin/api")).kind,
    ).toBe("notConfigured");
    expect(classifyCfUsageError(new ApiRequestError("Unauthorized", 401, "/admin/api")).kind).toBe("loginExpired");
    expect(classifyCfUsageError(new ApiRequestError("Not Found", 404, "/admin/api")).kind).toBe("unavailable");
    expect(classifyCfUsageError(new Error("Schema mismatch on /admin/api: Required")).kind).toBe("unavailable");
    expect(classifyCfUsageError(new ApiRequestError("Authentication error", 400, "/admin/api"))).toEqual({
      kind: "failed",
      detail: "Authentication error",
    });
  });
});
