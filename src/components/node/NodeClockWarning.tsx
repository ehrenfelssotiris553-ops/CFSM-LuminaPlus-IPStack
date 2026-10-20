import { t } from "@/i18n";
import { useMinuteClock } from "@/hooks/useClock";
import { MAX_FUTURE_CLOCK_SKEW_MS } from "@/services/cfsm/mappers";

export function NodeClockWarning({ sampleAt }: { sampleAt: number }) {
  const now = useMinuteClock();
  if (sampleAt <= now + MAX_FUTURE_CLOCK_SKEW_MS) return null;
  return <span className="clock-warning mx-3 my-1 inline-block text-[11px] text-[var(--status-warning)]" title={t("card.clockAheadHint")}>{t("card.clockAhead")}</span>;
}
