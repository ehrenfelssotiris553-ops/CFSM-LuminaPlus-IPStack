import { describe, expect, it } from "vitest";
import { findThemeConflicts } from "@/utils/themeConflicts";

describe("theme sync conflict detection", () => {
  it("allows non-overlapping nodes and protocol fields", () => {
    expect(findThemeConflicts({ map: { a: { v4: true } } }, { map: { a: { v4: true, v6: false }, b: {} } }, { map: { a: { v4: false } } })).toEqual([]);
  });
  it("allows both devices to choose the same value", () => {
    expect(findThemeConflicts({ url: "a" }, { url: "b" }, { url: "b" })).toEqual([]);
  });
  it("detects conflicting scalars and full list changes", () => {
    expect(findThemeConflicts({ url: "a", lines: [1, 2] }, { url: "b", lines: [1, 3] }, { url: "c", lines: [1, 4] })).toEqual(["url", "lines"]);
  });
  it("detects a removed override conflicting with a remote replacement", () => {
    expect(findThemeConflicts({ map: { a: { ipv6: true } } }, { map: { a: { ipv6: false } } }, { map: {} })).toEqual(["map.a.ipv6"]);
  });
});
