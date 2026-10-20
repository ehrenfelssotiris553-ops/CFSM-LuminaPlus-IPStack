// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCfUsage, getPublic } from "@/services/api";
import { resetApiBaseCache } from "@/services/cfsm/config";
import { classifyCfUsageError } from "@/utils/cfUsage";

function jsonReply(body: unknown, status = 200) {
  return async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetApiBaseCache();
  window.localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getCfUsage", () => {
  it("sends the same request as the admin button, without any Cloudflare credentials", async () => {
    window.localStorage.setItem("jwt_token", "token");
    fetchMock.mockImplementation(
      jsonReply({
        success: true,
        message: "d1UsageQueried",
        usage: {
          today: { rowsRead: 1200, rowsWritten: 30, workersRequests: 800, durableObjectsRequests: 95 },
          yesterday: { rowsRead: "4000" },
        },
      }),
    );

    const usage = await getCfUsage();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/admin\/api$/);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token");
    // 只带 action：后端用站长保存的 Token / Account ID，CF 凭证不经过浏览器。
    expect(JSON.parse(init.body as string)).toEqual({ action: "d1_usage" });
    expect(usage.today).toMatchObject({ rowsRead: 1200, rowsWritten: 30, workersRequests: 800, durableObjectsRequests: 95 });
    expect(usage.yesterday).toMatchObject({ rowsRead: 4000, rowsWritten: 0, workersRequests: 0 });
  });

  it("reports a missing token as not configured", async () => {
    window.localStorage.setItem("jwt_token", "token");
    fetchMock.mockImplementation(jsonReply({ error: "cloudflareTokenRequired", code: 400 }, 400));
    const error = await getCfUsage().catch((reason: unknown) => reason);
    expect(classifyCfUsageError(error).kind).toBe("notConfigured");
    // 400 不是登录问题，令牌留着。
    expect(window.localStorage.getItem("jwt_token")).toBe("token");
  });

  it("treats an unexpected response shape as an API change", async () => {
    window.localStorage.setItem("jwt_token", "token");
    fetchMock.mockImplementation(jsonReply({ success: true, data: { rowsRead: 1 } }));
    const error = await getCfUsage().catch((reason: unknown) => reason);
    expect(classifyCfUsageError(error).kind).toBe("unavailable");
  });
});

describe("latest agent version", () => {
  it("comes from /api/config (owner only) and is empty otherwise", async () => {
    fetchMock.mockImplementation(jsonReply({ site_title: "S", authorization: true, last_agent_version: "1.0.20" }));
    expect((await getPublic()).latestAgentVersion).toBe("1.0.20");
    fetchMock.mockImplementation(jsonReply({ site_title: "S" }));
    expect((await getPublic()).latestAgentVersion).toBe("");
  });
});
