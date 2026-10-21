import { describe, expect, it } from "vitest";
import { agentUpdateTarget, findOutdatedAgents } from "@/utils/agentVersion";

const node = (uuid: string, agent_version: string) => ({ uuid, name: uuid.toUpperCase(), agent_version });

describe("findOutdatedAgents", () => {
  it("lists only agents older than the latest release", () => {
    const nodes = [
      node("a", "1.0.18"),
      node("b", "1.0.20"),
      node("c", "v1.0.9"),
      node("d", "1.1.0"),
      node("e", ""),
      node("f", "dev-build"),
    ];
    // 没上报版本、版本号认不出的不算：宁可漏报，不乱报。比最新版还新的（自己编译的）也不算。
    expect(findOutdatedAgents(nodes, "1.0.20").map((item) => item.uuid)).toEqual(["a", "c"]);
  });

  it("reports nothing without a latest version (visitors, old backends)", () => {
    expect(findOutdatedAgents([node("a", "1.0.1")], "")).toEqual([]);
  });
});

describe("agentUpdateTarget", () => {
  it("stays quiet for an ignored version and speaks up again for a newer one", () => {
    expect(agentUpdateTarget("1.0.20", "", true)).toBe("1.0.20");
    expect(agentUpdateTarget("1.0.20", "1.0.20", true)).toBe("");
    expect(agentUpdateTarget("1.0.20", "v1.0.20", true)).toBe("");
    expect(agentUpdateTarget("1.0.21", "1.0.20", true)).toBe("1.0.21");
    // 关掉提醒，或者没有最新版本号（访客、老后端），一律不提醒。
    expect(agentUpdateTarget("1.0.21", "", false)).toBe("");
    expect(agentUpdateTarget("", "", true)).toBe("");
  });
});
