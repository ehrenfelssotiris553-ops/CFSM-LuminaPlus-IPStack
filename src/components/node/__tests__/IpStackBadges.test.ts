import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IpStackBadges } from "../IpStackBadges";

describe("IP badges", () => {
  it.each([
    [true, true, ["V4", "V6"]],
    [true, false, ["V4"]],
    [false, true, ["V6"]],
    [false, false, []],
  ] as const)("renders the independently resolved flags (%s / %s)", (ipv4, ipv6, expected) => {
    const html = renderToStaticMarkup(createElement(IpStackBadges, { ipv4, ipv6 }));
    expect([...html.matchAll(/>(V[46])</g)].map((match) => match[1])).toEqual(expected);
  });
});
