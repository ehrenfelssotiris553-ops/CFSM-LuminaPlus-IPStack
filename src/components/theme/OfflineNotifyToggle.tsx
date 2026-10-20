import { useState } from "react";
import { t } from "@/i18n";
import { useOfflineNotifyEnabled } from "@/hooks/useOfflineAlerts";
import { notificationSupport, writeOfflineNotifyEnabled, type NotificationSupport } from "@/utils/offlineAlerts";

/**
 * 掉线通知开关。只存本机、不进站点设置：通知权限是每台设备、每个浏览器各自授予的，
 * 站长在电脑上打开不该替访客、或替自己的手机打开。打开时向浏览器申请权限，拒绝了就保持关闭并说明原因。
 */
export function OfflineNotifyToggle() {
  const enabled = useOfflineNotifyEnabled();
  const [support, setSupport] = useState(notificationSupport);
  const [requesting, setRequesting] = useState(false);
  const active = enabled && support === "granted";

  const toggle = async (next: boolean) => {
    if (!next) {
      writeOfflineNotifyEnabled(false);
      return;
    }
    if (support === "unsupported") return;
    let permission: NotificationSupport = support;
    if (permission === "default") {
      setRequesting(true);
      try {
        permission = await window.Notification.requestPermission();
      } catch {
        permission = notificationSupport();
      } finally {
        setRequesting(false);
      }
      setSupport(permission);
    }
    writeOfflineNotifyEnabled(permission === "granted");
  };

  const status =
    support === "unsupported"
      ? t("settings.offlineNotifyUnsupported")
      : support === "denied"
        ? t("settings.offlineNotifyDenied")
        : t("settings.offlineNotifyDesc");

  return (
    <label className="surface-inset flex items-center justify-between gap-3 px-4 py-3">
      <span className="min-w-0">
        <span className="block setting-subhead-title">{t("settings.offlineNotify")}</span>
        <span className="mt-1 block setting-hint" role="status">{status}</span>
      </span>
      <input
        type="checkbox"
        checked={active}
        disabled={requesting || support === "unsupported" || support === "denied"}
        onChange={(event) => void toggle(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--accent-500)]"
      />
    </label>
  );
}
