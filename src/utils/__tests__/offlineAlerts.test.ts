// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  countOfflineNodes,
  findOnlineTransitions,
  formatNodeNames,
  formatSiteTitle,
  readOfflineNotifyEnabled,
  subscribeOfflineNotifyEnabled,
  writeOfflineNotifyEnabled,
} from "@/utils/offlineAlerts";

const node = (uuid: string, online: boolean | null) => ({ uuid, name: uuid.toUpperCase(), online });

beforeEach(() => {
  window.localStorage.clear();
});

describe("tab title offline count", () => {
  it("prefixes the site name only when something is offline and the option is on", () => {
    expect(countOfflineNodes([node("a", true), node("b", false), node("c", null), node("d", false)])).toBe(2);
    expect(formatSiteTitle("My Monitor", 2, true)).toContain("My Monitor");
    expect(formatSiteTitle("My Monitor", 2, true)).toContain("2");
    expect(formatSiteTitle("My Monitor", 2, false)).toBe("My Monitor");
    expect(formatSiteTitle("My Monitor", 0, true)).toBe("My Monitor");
  });
});

describe("findOnlineTransitions", () => {
  it("reports only online → offline and offline → online", () => {
    const before = new Map<string, boolean | null>([
      ["a", true],
      ["b", false],
      ["c", null],
      ["d", true],
    ]);
    const { offline, recovered } = findOnlineTransitions(before, [
      node("a", false),
      node("b", true),
      node("c", false),
      node("d", true),
      node("e", false),
    ]);
    // c 之前状态未知、e 是第一次出现：都不算掉线，免得一打开页面就把本来离线的节点报一遍。
    expect(offline.map((item) => item.uuid)).toEqual(["a"]);
    expect(recovered.map((item) => item.uuid)).toEqual(["b"]);
  });
});

describe("formatNodeNames", () => {
  it("lists a few names and summarizes the rest", () => {
    expect(formatNodeNames([node("a", false)])).toBe("A");
    const many = ["a", "b", "c", "d", "e", "f", "g"].map((uuid) => node(uuid, false));
    const text = formatNodeNames(many);
    expect(text).toContain("A");
    expect(text).toContain("E");
    expect(text).not.toContain("F");
    expect(text).toContain("7");
  });
});

describe("offline notification switch", () => {
  it("is stored per browser and notifies subscribers", () => {
    expect(readOfflineNotifyEnabled()).toBe(false);
    let calls = 0;
    const unsubscribe = subscribeOfflineNotifyEnabled(() => {
      calls += 1;
    });
    writeOfflineNotifyEnabled(true);
    expect(readOfflineNotifyEnabled()).toBe(true);
    writeOfflineNotifyEnabled(false);
    expect(readOfflineNotifyEnabled()).toBe(false);
    expect(calls).toBe(2);
    unsubscribe();
  });
});
