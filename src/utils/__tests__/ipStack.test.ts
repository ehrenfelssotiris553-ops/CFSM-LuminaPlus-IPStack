import { describe, expect, it } from "vitest";
import {
  getIpStackOverride,
  normalizeIpStackOverrides,
  resolveIpStackVisibility,
  setIpStackMode,
} from "@/utils/ipStack";
import { normalizeThemeSettings } from "@/utils/themeSettings";

const dual = { uuid: "a", ipv4: "1", ipv6: "1" };

describe("homepage IPv4 / IPv6 visibility", () => {
  it("keeps existing sites automatic and follows the CF flags independently", () => {
    const settings = normalizeThemeSettings({});
    expect(resolveIpStackVisibility(dual, settings)).toEqual({ ipv4: true, ipv6: true });
    expect(resolveIpStackVisibility({ ...dual, ipv6: "" }, settings)).toEqual({ ipv4: true, ipv6: false });
    expect(resolveIpStackVisibility({ uuid: "a" }, settings)).toEqual({ ipv4: false, ipv6: false });
    expect(resolveIpStackVisibility(dual, { ...settings, showIpv4: false })).toEqual({ ipv4: false, ipv6: true });
    expect(resolveIpStackVisibility(dual, { ...settings, showIpv6: false })).toEqual({ ipv4: true, ipv6: false });
  });

  it("applies each node and protocol separately, without mutating backend data", () => {
    const settings = normalizeThemeSettings({
      showIpv4: false,
      homepageIpStackOverrides: { a: { ipv4: true, ipv6: false }, b: { ipv6: true } },
    });
    expect(resolveIpStackVisibility(dual, settings)).toEqual({ ipv4: true, ipv6: false });
    expect(resolveIpStackVisibility({ uuid: "b" }, settings)).toEqual({ ipv4: false, ipv6: true });
    expect(resolveIpStackVisibility({ ...dual, uuid: "c" }, settings)).toEqual({ ipv4: false, ipv6: true });
    expect(dual).toEqual({ uuid: "a", ipv4: "1", ipv6: "1" });
  });

  it("restores Auto per protocol and preserves other nodes and the other protocol", () => {
    const original = { a: { ipv4: true, ipv6: false }, b: { ipv6: true } };
    const next = setIpStackMode(original, "a", "ipv4", "auto");
    expect(next).toEqual({ a: { ipv6: false }, b: { ipv6: true } });
    expect(setIpStackMode(next, "a", "ipv6", "auto")).toEqual({ b: { ipv6: true } });
    expect(setIpStackMode(next, "b", "ipv4", "hide")).toEqual({ a: { ipv6: false }, b: { ipv4: false, ipv6: true } });
    expect(original.a.ipv4).toBe(true);
  });

  it("rejects malformed settings and never treats inherited object keys as nodes", () => {
    const dirty = JSON.parse('{"__proto__":{"ipv4":true},"a":{"ipv4":"false","ipv6":false},"b":[],"c":{"other":true}}');
    expect(normalizeIpStackOverrides(dirty)).toEqual({ a: { ipv6: false } });
    expect(normalizeIpStackOverrides(null)).toEqual({});
    expect(normalizeIpStackOverrides([])).toEqual({});
    expect(getIpStackOverride({}, "constructor")).toEqual({});
    const inherited = Object.create({ ipv4: true }) as { ipv4?: boolean; ipv6?: boolean };
    inherited.ipv6 = false;
    expect(normalizeIpStackOverrides({ a: inherited })).toEqual({ a: { ipv6: false } });
  });
});

describe("IPv4 / IPv6 capability for filtering and stats", () => {
  it("follows per-node overrides first and ignores the global badge switches", async () => {
    const { resolveIpStackCapability, ipStackCategory } = await import("@/utils/ipStack");
    // 全站关掉了 V4 标签也不代表节点没有 IPv4：筛选和统计照旧算它双栈。
    expect(resolveIpStackCapability(dual, {})).toEqual({ ipv4: true, ipv6: true });
    expect(resolveIpStackCapability(dual, { a: { ipv6: false } })).toEqual({ ipv4: true, ipv6: false });
    expect(resolveIpStackCapability({ uuid: "b" }, { b: { ipv6: true } })).toEqual({ ipv4: false, ipv6: true });
    expect(ipStackCategory({ ipv4: true, ipv6: true })).toBe("dual");
    expect(ipStackCategory({ ipv4: true, ipv6: false })).toBe("ipv4");
    expect(ipStackCategory({ ipv4: false, ipv6: true })).toBe("ipv6");
    expect(ipStackCategory({ ipv4: false, ipv6: false })).toBe("none");
  });

  it("counts each category once per node", async () => {
    const { countIpStackCategories } = await import("@/utils/ipStack");
    const nodes = [
      dual,
      { uuid: "b", ipv4: "1", ipv6: "" },
      { uuid: "c", ipv4: "", ipv6: "1" },
      { uuid: "d" },
    ];
    expect(countIpStackCategories(nodes, {})).toEqual({ dual: 1, ipv4: 1, ipv6: 1, none: 1 });
    expect(countIpStackCategories(nodes, { d: { ipv4: true } })).toEqual({ dual: 1, ipv4: 2, ipv6: 1, none: 0 });
  });

  it("applies one mode to many nodes and leaves an unset protocol alone", async () => {
    const { setIpStackModeForNodes } = await import("@/utils/ipStack");
    const before = { a: { ipv6: true }, c: { ipv4: false } };
    const after = setIpStackModeForNodes(before, ["a", "b"], { ipv4: "hide", ipv6: null });
    expect(after).toEqual({ a: { ipv4: false, ipv6: true }, b: { ipv4: false }, c: { ipv4: false } });
    expect(setIpStackModeForNodes(after, ["a", "b"], { ipv4: "auto", ipv6: "auto" })).toEqual({ c: { ipv4: false } });
  });
});
