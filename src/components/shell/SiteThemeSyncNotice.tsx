import { getLocalThemeSettings, saveLocalThemeSettings } from "@/services/themeSettingsStore";
import { memoByLanguage, t } from "@/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Cloud, CloudAlert, History } from "lucide-react";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import {
  checkSiteThemeBackup,
  dismissSiteThemeBackup,
  restoreSiteThemeBackup,
  resolveSiteThemeConflict,
  retrySiteThemeSync,
  startSiteThemeAutoSync,
  useCanSyncSiteTheme,
  useSiteThemeSyncStatus,
  type SiteThemeBackupCheck,
} from "@/hooks/useSiteThemeOptions";
import { ApiRequestError } from "@/services/cfsm/http";
import { mergeThemeSettingsLayers, normalizeThemeSettings } from "@/utils/themeSettings";
import { migrateLocalPingPreferences } from "@/utils/pingVisibility";

function describeSyncError(error: unknown): string {
  const status = error instanceof ApiRequestError ? error.status : 0;
  if (status === 401) return t("sync.err401");
  // http 层清掉失效的人机验证凭证后，全局验证弹窗会自己重新出来（见 TurnstileGate）。
  if (status === 403) return t("sync.err403");
  if (status === 400) return t("sync.err400");
  return error instanceof Error && error.message ? error.message : t("sync.errNetwork");
}

function describeRestoreError(error: unknown): string {
  const status = error instanceof ApiRequestError ? error.status : 0;
  if (status === 401) return t("sync.restore401");
  if (status === 403) return t("sync.restore403");
  return error instanceof Error && error.message
    ? t("sync.restoreFailedWith", { message: error.message })
    : t("sync.restoreFailed");
}

const backupTimeFormatter = memoByLanguage(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
);

function formatBackupTime(at: number | null): string {
  if (at == null) return t("sync.lastTime");
  return backupTimeFormatter().format(at);
}

/** 同步成功的提示停留多久。 */
const SUCCESS_NOTICE_MS = 3200;

/**
 * 登录站长的改动自动同步到后端（设置页、卡片配色、卡片上换线路都走这一条，见 startSiteThemeAutoSync）。
 * 这里负责启动监听，并提示结果 —— 改动是在首页取色器、卡片上做的，除了这儿没别的地方能说。
 *
 * 成功的提示只在设置页**之外**出现几秒：设置页顶栏自己有同步状态，两边一起说就重复了。
 *
 * 后端配置被别的主题 / 后台旧副本整份改掉时（见 checkSiteThemeBackup），也在这里问要不要恢复。三种提示同一个位置，
 * 同步失败优先，其次恢复，最后才是成功。
 */
export function SiteThemeSyncNotice() {
  const titleId = useId();
  const status = useSiteThemeSyncStatus();
  const [dismissedError, setDismissedError] = useState<unknown>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const previousPhase = useRef(status.phase);
  const { search } = useLocation();
  const onSettingsPage = new URLSearchParams(search).get("view") === "theme-manage";
  const backupTitleId = useId();
  const { data: config } = usePublicConfig();
  const canSyncSiteTheme = useCanSyncSiteTheme();
  const [backupCheck, setBackupCheck] = useState<SiteThemeBackupCheck | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => startSiteThemeAutoSync(), []);
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current || !config?.pingDisplayMigration) return;
    const original = getLocalThemeSettings();
    const local = migrateLocalPingPreferences(original);
    if (!canSyncSiteTheme) {
      if (Object.keys(original).length > 0 && local !== original) saveLocalThemeSettings(local);
      return;
    }
    migrated.current = true;
    const value = normalizeThemeSettings(mergeThemeSettingsLayers(config.theme_settings, local));
    saveLocalThemeSettings({
      pingDisplayVersion: 1,
      showPingIpv4: value.showPingIpv4,
      showPingIpv6: value.showPingIpv6,
      homepagePingGroupOverrides: value.homepagePingGroupOverrides,
      homepagePingProtocols: value.homepagePingProtocols,
      ...local,
    });
  }, [canSyncSiteTheme, config]);


  // 只给登录站长判；自己的同步在路上时不判（发出去之前后端当然还是旧的）。
  const syncBusy = status.phase === "pending" || status.phase === "saving";
  useEffect(() => {
    if (!canSyncSiteTheme || !config || syncBusy) return;
    setBackupCheck(checkSiteThemeBackup(config.theme_settings, config.preferredAppearance));
  }, [canSyncSiteTheme, config, syncBusy]);

  const handleRestore = async () => {
    setRestoring(true);
    setRestoreError(null);
    try {
      if (!(await restoreSiteThemeBackup())) setRestoreError(t("sync.restoreBusy"));
    } catch (error) {
      setRestoreError(describeRestoreError(error));
    } finally {
      setRestoring(false);
    }
  };

  const handleDismissBackup = () => {
    if (!backupCheck) return;
    dismissSiteThemeBackup(backupCheck.fingerprint);
    setBackupCheck({ ...backupCheck, overwritten: false });
    setRestoreError(null);
  };

  // 只认「发出去之后回来了」这一次跳变：idle → synced（没发请求，快照和站点一样）不提示。
  useEffect(() => {
    const wasSaving = previousPhase.current === "saving";
    previousPhase.current = status.phase;
    if (status.phase !== "synced" || !wasSaving) return;
    setShowSuccess(true);
    const timer = window.setTimeout(() => setShowSuccess(false), SUCCESS_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [status.phase]);

  if (status.phase === "conflict") {
    return <section className="realtime-session-prompt site-theme-sync-notice" role="alert" aria-labelledby={titleId}>
      <CloudAlert size={16} aria-hidden />
      <div className="realtime-session-prompt-body"><strong id={titleId}>{t("sync.conflictTitle")}</strong><p>{t("sync.conflictBody")}</p></div>
      <div className="realtime-session-prompt-actions">
        <button type="button" className="control-button realtime-session-prompt-button" onClick={() => resolveSiteThemeConflict(false)}>{t("sync.useRemote")}</button>
        <button type="button" className="control-button realtime-session-prompt-button is-primary" onClick={() => resolveSiteThemeConflict(true)}>{t("sync.keepMine")}</button>
      </div>
    </section>;
  }
  if (status.phase !== "error" || status.error === dismissedError) {
    if (canSyncSiteTheme && backupCheck?.overwritten && (!syncBusy || restoring)) {
      return (
        <section
          className="realtime-session-prompt site-theme-sync-notice"
          aria-labelledby={backupTitleId}
          aria-live="polite"
        >
          <History size={16} strokeWidth={2} className="realtime-session-prompt-icon" aria-hidden />
          <div className="realtime-session-prompt-body">
            <strong id={backupTitleId}>{t("sync.backupTitle")}</strong>
            <p>
              {restoreError ??
                t("sync.backupBody", { time: formatBackupTime(backupCheck.backupAt) })}
            </p>
          </div>
          <div className="realtime-session-prompt-actions">
            <button
              type="button"
              className="control-button realtime-session-prompt-button"
              onClick={handleDismissBackup}
              disabled={restoring}
            >
              {t("sync.ignore")}
            </button>
            <button
              type="button"
              className="control-button realtime-session-prompt-button is-primary"
              onClick={() => void handleRestore()}
              disabled={restoring}
              aria-busy={restoring}
            >
              {restoring ? t("sync.restoring") : t("sync.restore")}
            </button>
          </div>
        </section>
      );
    }
    if (!showSuccess || onSettingsPage) return null;
    return (
      <section
        className="realtime-session-prompt site-theme-sync-notice is-success"
        aria-live="polite"
      >
        <Cloud size={16} strokeWidth={2} className="realtime-session-prompt-icon" aria-hidden />
        <div className="realtime-session-prompt-body">
          <strong>{t("sync.successTitle")}</strong>
          <p>{t("sync.successBody")}</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="realtime-session-prompt site-theme-sync-notice"
      aria-labelledby={titleId}
      aria-live="polite"
    >
      <CloudAlert size={16} strokeWidth={2} className="realtime-session-prompt-icon" aria-hidden />
      <div className="realtime-session-prompt-body">
        <strong id={titleId}>{t("sync.failedTitle")}</strong>
        <p>{describeSyncError(status.error)}</p>
      </div>
      <div className="realtime-session-prompt-actions">
        <button
          type="button"
          className="control-button realtime-session-prompt-button"
          onClick={() => setDismissedError(status.error)}
        >
          {t("common.close")}
        </button>
        <button
          type="button"
          className="control-button realtime-session-prompt-button is-primary"
          onClick={retrySiteThemeSync}
        >
          {t("common.retry")}
        </button>
      </div>
    </section>
  );
}
