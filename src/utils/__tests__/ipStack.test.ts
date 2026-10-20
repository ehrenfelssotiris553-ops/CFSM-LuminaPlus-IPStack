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
