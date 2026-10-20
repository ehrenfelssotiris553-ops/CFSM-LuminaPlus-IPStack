import { t } from "@/i18n";

// Homepage display flags resolved by useNodeCardModel; never render an address.
// V4 绿、V6 蓝，扫一眼就分得出；悬停 / 读屏给完整说法（「V4」两个字母对读屏不友好）。
export function IpStackBadges({
  ipv4,
  ipv6,
}: {
  ipv4: boolean;
  ipv6: boolean;
}) {
  if (!ipv4 && !ipv6) return null;
  return (
    <>
      {ipv4 ? (
        <span className="ip-stack-badge" data-tag="green" title={t("ipStack.v4Title")} aria-label={t("ipStack.v4Title")}>
          V4
        </span>
      ) : null}
      {ipv6 ? (
        <span className="ip-stack-badge" data-tag="blue" title={t("ipStack.v6Title")} aria-label={t("ipStack.v6Title")}>
          V6
        </span>
      ) : null}
    </>
  );
}

/** 列表视图整行是一个链接、读屏只念 aria-label，把标签也念进去。没有标签时返回空串。 */
export function ipStackAriaText({ ipv4, ipv6 }: { ipv4: boolean; ipv6: boolean }): string {
  if (ipv4 && ipv6) return t("ipStack.ariaDual");
  if (ipv4) return t("ipStack.v4Title");
  if (ipv6) return t("ipStack.v6Title");
  return "";
}
