/**
 * 版本号比较。认 `1.2.15`、`v1.2.15`、`2.8.5 Beta5`、`2.8.5-beta.5`、`2.8.5 RC1` 这几种写法：
 * 数字段逐段比；同号时预发布低于正式版（2.8.5 Beta5 < 2.8.5），同为预发布按 alpha < beta < rc、再比序号。
 *
 * 认不出的返回 null，版本提醒据此**不提示** —— 后端的 `last_workers_version` 是远端 version.json 原样给的，
 * 写法哪天变了宁可漏报，也不能让站长天天看见一个假的「有新版」。
 *
 * 定制版号 `1.2.21+ipstack.4` 的 `+` 后缀：只有两边都带、且前缀相同时才按序号比（ipstack.5 新于 ipstack.4），
 * 一边带一边不带、或前缀不同（不同的定制线）都当相同，只看前面的正式版号。
 */

const VERSION_PATTERN = /^v?(\d+(?:\.\d+)*)(?:[\s._-]*(alpha|beta|rc)[\s._-]*(\d+)?)?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/i;
const CHANNEL_RANK: Record<string, number> = { alpha: 0, beta: 1, rc: 2 };
const RELEASE_RANK = 3;

interface ParsedVersion {
  parts: number[];
  channel: number;
  serial: number;
  build: string[];
}

function parseVersion(raw: unknown): ParsedVersion | null {
  if (typeof raw !== "string") return null;
  const match = raw.trim().match(VERSION_PATTERN);
  if (!match) return null;
  return {
    parts: match[1]!.split(".").map(Number),
    channel: match[2] ? CHANNEL_RANK[match[2].toLowerCase()]! : RELEASE_RANK,
    serial: match[3] ? Number(match[3]) : 0,
    build: match[4] ? match[4].toLowerCase().split(".") : [],
  };
}

/** 定制后缀的先后：两边都有、逐段比，数字段按数值；遇到对不上的文字段（不同定制线）就当相同。 */
function compareBuild(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? "0";
    const b = right[index] ?? "0";
    if (a === b) continue;
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) - Number(b);
    return 0;
  }
  return 0;
}

/** a 比 b 新返回正数、旧返回负数、相同返回 0；任一认不出返回 null。 */
export function compareVersions(a: unknown, b: unknown): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  const length = Math.max(left.parts.length, right.parts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left.parts[index] ?? 0) - (right.parts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  if (left.channel !== right.channel) return left.channel - right.channel;
  if (left.serial !== right.serial) return left.serial - right.serial;
  return compareBuild(left.build, right.build);
}

/** `candidate` 确实比 `current` 新才返回 true；认不出一律 false。 */
export function isNewerVersion(candidate: unknown, current: unknown): boolean {
  const result = compareVersions(candidate, current);
  return result != null && result > 0;
}

/** 页脚展示用：`2.8.5 Beta5` → `v2.8.5 Beta5`，已经带 v 的不重复加。 */
export function formatVersionLabel(raw: string): string {
  const trimmed = raw.trim();
  return /^v/i.test(trimmed) ? trimmed : `v${trimmed}`;
}
