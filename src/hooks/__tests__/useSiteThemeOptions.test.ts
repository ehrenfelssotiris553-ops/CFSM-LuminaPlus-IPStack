// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildSiteThemeOptions, unmanagedSiteSettings } from "@/hooks/useSiteThemeOptions";
import { EMPTY_PING_LINE_OVERRIDES_BY_NODE } from "@/utils/pingLineOverrides";
import { LOCAL_IP_STACK_EDITS_KEY } from "@/utils/ipStack";

const base = {
  siteSettings: undefined,
  preferredAppearance: undefined,
  localSettings: {},
  localLineOverrides: EMPTY_PING_LINE_OVERRIDES_BY_NODE,
};

describe("buildSiteThemeOptions", () => {
  it("keeps an explicit Auto choice through newer backend data without deleting other nodes", () => {
    const snapshot = buildSiteThemeOptions({
      ...base,
      siteSettings: { homepageIpStackOverrides: { a: { ipv4: true, ipv6: true }, b: { ipv6: false } } },
      localSettings: { [LOCAL_IP_STACK_EDITS_KEY]: { a: { ipv4: "auto", ipv6: false } } },
    });
    expect(snapshot.homepageIpStackOverrides).toEqual({ a: { ipv6: false }, b: { ipv6: false } });
    expect(snapshot).not.toHaveProperty(LOCAL_IP_STACK_EDITS_KEY);
  });
  it("exports badge defaults and per-node overrides through the existing backend save path", () => {
    const snapshot = buildSiteThemeOptions({
      ...base,
      siteSettings: { showIpv4: false, homepageIpStackOverrides: { a: { ipv6: false } } },
      localSettings: { showIpv6: false },
    });
    expect(snapshot).toMatchObject({
      showIpv4: false,
      showIpv6: false,
      homepageIpStackOverrides: { a: { ipv6: false } },
    });
  });
  it("keeps the backend's default appearance when no theme setting names one", () => {
    // 取色器的「保存到后端」曾把「跟随系统」写进站点配置，后台设的深色对所有访客失效。
    expect(buildSiteThemeOptions({ ...base, preferredAppearance: "dark" }).defaultAppearance).toBe(
      "dark",
    );
    expect(
      buildSiteThemeOptions({
        ...base,
        preferredAppearance: "dark",
        localSettings: { defaultAppearance: "light" },
      }).defaultAppearance,
    ).toBe("light");
  });

  it("carries the line switches made on cards", () => {
    const snapshot = buildSiteThemeOptions({
      ...base,
      localLineOverrides: { "node-a": { "0": 5 } },
    });

    expect(snapshot.homepagePingLineOverrides).toEqual({ "node-a": { "0": 5 } });
  });

  it("layers site, local and draft settings, with colours merged one by one", () => {
    const snapshot = buildSiteThemeOptions({
      ...base,
      siteSettings: { desktopNodeViewMode: "list", metricColors: { cpu: "#111111", disk: "#222222" } },
      localSettings: { desktopNodeViewMode: "compact", metricColors: { cpu: "#333333" } },
      draftSettings: { desktopNodeViewMode: "large" },
    });

    expect(snapshot.desktopNodeViewMode).toBe("large");
    expect(snapshot.metricColors).toEqual({ cpu: "#333333", disk: "#222222" });
  });

  it("writes Lumina Prism's view modes back unchanged unless they were changed here", () => {
    // Prism 的「跟随风格」和新布局：这里按默认读（电脑大卡片、手机小卡片），写回去要还是原值。
    const site = { desktopNodeViewMode: "follow", mobileNodeViewMode: "ring" };
    expect(buildSiteThemeOptions({ ...base, siteSettings: site })).toMatchObject(site);
    // 设置页草稿里是读出来的默认值，等于没改。
    expect(
      buildSiteThemeOptions({
        ...base,
        siteSettings: site,
        draftSettings: { desktopNodeViewMode: "large", mobileNodeViewMode: "compact" },
      }),
    ).toMatchObject(site);
    // 在这里改成了别的，就写这边的。
    expect(
      buildSiteThemeOptions({
        ...base,
        siteSettings: site,
        localSettings: { desktopNodeViewMode: "list", mobileNodeViewMode: "mini" },
      }),
    ).toMatchObject({ desktopNodeViewMode: "list", mobileNodeViewMode: "mini" });
  });
});

describe("unmanagedSiteSettings", () => {
  it("keeps keys this theme does not manage and drops the ones it rewrites", () => {
    expect(
      unmanagedSiteSettings({
        skin: "paper",
        screenshotMaskNodes: ["a"],
        mikus: { enabled: false },
        surfaceOpacity: 60,
        metricColors: { cpu: "#111111" },
        darkDepth: 60,
        showCostSummaryFloatingButton: true,
        luminaplusSyncedAt: 1,
        [LOCAL_IP_STACK_EDITS_KEY]: { a: { ipv4: true } },
      }),
    ).toEqual({ skin: "paper", screenshotMaskNodes: ["a"], mikus: { enabled: false } });
    expect(unmanagedSiteSettings(undefined)).toEqual({});
  });
});
