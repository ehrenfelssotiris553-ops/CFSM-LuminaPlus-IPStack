// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { changedManagedSettings, draftFromSettings, rebaseDraft } from "@/pages/ThemeManage";
import type { ThemeSettings } from "@/types/cfsm";
import { mergeLocalThemeSettingsEdits, mergeThemeSettingsLayers, normalizeThemeSettings } from "@/utils/themeSettings";
import { buildSiteThemeOptions } from "@/hooks/useSiteThemeOptions";
import { LOCAL_PING_VISIBILITY_EDITS_KEY, LOCAL_PING_GROUP_EDITS_KEY, LOCAL_PING_PROTOCOL_EDITS_KEY } from "@/utils/pingVisibility";
import { LOCAL_IP_STACK_EDITS_KEY } from "@/utils/ipStack";

function resolved(settings: Record<string, unknown>) {
  return normalizeThemeSettings(settings as ThemeSettings & Record<string, unknown>);
}

describe("设置页自动保存只存改过的项", () => {
  it("preserves another device's edits to other nodes and protocols when syncing IP badges", () => {
    const source = resolved({ homepageIpStackOverrides: { a: { ipv4: true } } });
    const edits = changedManagedSettings({ ...source, homepageIpStackOverrides: { a: { ipv4: false } } }, source);
    const snapshot = buildSiteThemeOptions({
      siteSettings: { homepageIpStackOverrides: { a: { ipv4: true, ipv6: false }, b: { ipv6: true } } },
      preferredAppearance: undefined,
      localSettings: edits,
      localLineOverrides: {},
    });
    expect(snapshot.homepageIpStackOverrides).toEqual({ a: { ipv4: false, ipv6: false }, b: { ipv6: true } });
  });
  it("saves IPv4 and IPv6 settings independently and restores inherited values", () => {
    const source = resolved({ showIpv4: false, homepageIpStackOverrides: { a: { ipv4: true } } });
    const draft = { ...source, showIpv6: false, homepageIpStackOverrides: {} };
    expect(changedManagedSettings(draft, source)).toEqual({
      showIpv6: false,
      [LOCAL_IP_STACK_EDITS_KEY]: { a: { ipv4: "auto" } },
    });
    expect(draftFromSettings(source)).toMatchObject({ showIpv4: false, showIpv6: true, homepageIpStackOverrides: { a: { ipv4: true } } });
  });
  it("combines consecutive unsynced edits without copying untouched backend nodes", () => {
    const site = { homepageIpStackOverrides: { a: { ipv4: true }, b: { ipv6: true } } };
    const source = resolved(site);
    const local = changedManagedSettings({ ...source, homepageIpStackOverrides: { a: { ipv4: false }, b: { ipv6: true } } }, source);
    const updatedSource = resolved(mergeThemeSettingsLayers(site, local));
    const next = changedManagedSettings({ ...updatedSource, homepageIpStackOverrides: { a: { ipv4: false }, b: { ipv6: false } } }, updatedSource);
    const snapshot = buildSiteThemeOptions({
      siteSettings: { homepageIpStackOverrides: { a: { ipv4: true, ipv6: true }, b: { ipv6: true }, c: { ipv4: true } } },
      preferredAppearance: undefined,
      localSettings: mergeLocalThemeSettingsEdits(local, next),
      localLineOverrides: {},
    });
    expect(snapshot.homepageIpStackOverrides).toEqual({ a: { ipv4: false, ipv6: true }, b: { ipv6: false }, c: { ipv4: true } });
    expect(snapshot).not.toHaveProperty(LOCAL_IP_STACK_EDITS_KEY);
  });
  it("没改的项不进本机，站长同步时才不会把别的设备改过的写回旧值", () => {
    const source = resolved({ surfaceOpacity: 100, desktopNodeViewMode: "card" });
    const draft = { ...source, desktopNodeViewMode: "list" } as ThemeSettings;

    expect(changedManagedSettings(draft, source)).toEqual({ desktopNodeViewMode: "list" });
  });

  it("什么都没改就是空的", () => {
    const source = resolved({ surfaceOpacity: 80 });
    expect(changedManagedSettings({ ...source } as ThemeSettings, source)).toEqual({});
  });
});

describe("设置变了时草稿按项合并（rebaseDraft）", () => {
  it("merges incoming IP badge changes per protocol instead of keeping a stale whole map", () => {
    const base = draftFromSettings(resolved({ homepageIpStackOverrides: { a: { ipv4: true } } }));
    const current = { ...base, homepageIpStackOverrides: { a: { ipv4: false } } };
    const next = draftFromSettings(resolved({ homepageIpStackOverrides: { a: { ipv4: true, ipv6: false }, b: { ipv6: true } } }));
    expect(rebaseDraft(current, base, next).homepageIpStackOverrides).toEqual({ a: { ipv4: false, ipv6: false }, b: { ipv6: true } });
  });
  it("用户改过的留着，没改的跟上新设置", () => {
    const base = draftFromSettings(resolved({ surfaceOpacity: 100, enableHomepageMultiPing: true }));
    const current = { ...base, desktopNodeViewMode: "list" as const };
    // 别的设备把透明度改成 50、关掉多线路。
    const next = draftFromSettings(resolved({ surfaceOpacity: 50, enableHomepageMultiPing: false }));

    const rebased = rebaseDraft(current, base, next);

    expect(rebased.surfaceOpacity).toBe(50);
    expect(rebased.enableHomepageMultiPing).toBe(false);
    expect(rebased.desktopNodeViewMode).toBe("list");
  });

  it("正在输入的多行文本原样留着（末尾的逗号、换行不被归一化吞掉）", () => {
    const base = draftFromSettings(resolved({}));
    const current = { ...base, hiddenNodesText: "node-a,\n" };
    const next = draftFromSettings(resolved({ surfaceOpacity: 50 }));

    expect(rebaseDraft(current, base, next).hiddenNodesText).toBe("node-a,\n");
  });
});


describe("ping visibility autosave", () => {
  it("posts sparse task edits and preserves another device's node and task", () => {
    const source = resolved({ homepagePingVisibilityOverrides: { a: { 1: false } } });
    const edits = changedManagedSettings({ ...source, homepagePingVisibilityOverrides: { a: { 1: false, 5: false } } }, source);
    expect(edits).toEqual({ [LOCAL_PING_VISIBILITY_EDITS_KEY]: { a: { 5: false } } });
    const snapshot = buildSiteThemeOptions({ siteSettings: { homepagePingVisibilityOverrides: { a: { 1: false, 6: true }, b: { 3: false } } }, preferredAppearance: undefined, localSettings: edits, localLineOverrides: {} });
    expect(snapshot.homepagePingVisibilityOverrides).toEqual({ a: { 1: false, 5: false, 6: true }, b: { 3: false } });
    expect(snapshot).not.toHaveProperty(LOCAL_PING_VISIBILITY_EDITS_KEY);
  });
  it("rebases forms per task including resetting a line to auto", () => {
    const base = draftFromSettings(resolved({ homepagePingVisibilityOverrides: { a: { 1: false } } }));
    const current = { ...base, homepagePingVisibilityOverrides: { a: { 5: false } } };
    const fresh = draftFromSettings(resolved({ homepagePingVisibilityOverrides: { a: { 1: false, 6: true }, b: { 3: false } } }));
    expect(rebaseDraft(current, base, fresh).homepagePingVisibilityOverrides).toEqual({ a: { 5: false, 6: true }, b: { 3: false } });
  });
});


describe("independent protocol display edits", () => {
  it("stores group and protocol edits sparsely and merges other devices' tasks", () => {
    const source = resolved({ homepagePingProtocols: { 1: "ipv4", 5: "ipv6" }, homepagePingGroupOverrides: { a: { ipv6: true } } });
    const edits = changedManagedSettings({ ...source, homepagePingProtocols: { 1: "other", 5: "ipv6" }, homepagePingGroupOverrides: { a: { ipv6: false } } }, source);
    expect(edits).toEqual({ [LOCAL_PING_PROTOCOL_EDITS_KEY]: { 1: "other" }, [LOCAL_PING_GROUP_EDITS_KEY]: { a: { ipv6: false } } });
    const merged = mergeThemeSettingsLayers({ homepagePingProtocols: { 1: "ipv4", 5: "other" }, homepagePingGroupOverrides: { a: { ipv4: false }, b: { ipv6: false } } }, edits);
    expect(merged.homepagePingProtocols).toEqual({ 1: "other", 5: "other" });
    expect(merged.homepagePingGroupOverrides).toEqual({ a: { ipv4: false, ipv6: false }, b: { ipv6: false } });
    expect(merged).not.toHaveProperty(LOCAL_PING_GROUP_EDITS_KEY);
  });
  it("rebases only the edited protocol assignment", () => {
    const base = draftFromSettings(resolved({ homepagePingProtocols: { 1: "ipv4", 5: "ipv6" } }));
    const current = { ...base, homepagePingProtocols: { 1: "other" as const, 5: "ipv6" as const } };
    const next = draftFromSettings(resolved({ homepagePingProtocols: { 1: "ipv4", 5: "other" } }));
    expect(rebaseDraft(current, base, next).homepagePingProtocols).toEqual({ 1: "other", 5: "other" });
  });
});
