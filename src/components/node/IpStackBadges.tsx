// Homepage display flags resolved by useNodeCardModel; never render an address.
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
      {ipv4 ? <span className="ip-stack-badge" data-tag="green">V4</span> : null}
      {ipv6 ? <span className="ip-stack-badge" data-tag="green">V6</span> : null}
    </>
  );
}
