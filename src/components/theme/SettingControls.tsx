import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { t } from "@/i18n";
import type { IpStackMode } from "@/utils/ipStack";

/*
 * 定制版几个设置面板（V4 / V6、延迟线路、掉线通知）共用的小控件，样式和 ThemeManage 里原版的
 * ToggleRow / SettingSelect 一致。原版那两个绑在设置页的草稿上，这里是不带草稿的版本。
 */

/** 「标题 + 说明 + 开关」一行。 */
export function SettingToggle({
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  desc?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="surface-inset flex items-center justify-between gap-3 px-4 py-3">
      <span className="min-w-0">
        <span className="block setting-subhead-title">{title}</span>
        {desc != null ? <span className="mt-1 block setting-hint">{desc}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--accent-500)]"
      />
    </label>
  );
}

/** 下拉框：原生箭头贴边，隐藏它、自己画一个（样式见 .setting-select）。 */
export function SettingSelect({ children, ...props }: ComponentPropsWithoutRef<"select">) {
  return (
    <div className="setting-select">
      <select {...props} className="surface-inset w-full text-[13px] text-[var(--text-primary)] outline-none">
        {children}
      </select>
      <ChevronDown size={14} className="setting-select-icon" aria-hidden />
    </div>
  );
}

export const IP_STACK_MODES = ["auto", "show", "hide"] as const;

/** 「自动 / 显示 / 隐藏」的文字，V4 / V6 标签和延迟线路共用。 */
export function ipStackModeLabel(mode: IpStackMode): string {
  return t(mode === "auto" ? "settings.ipStackAuto" : mode === "show" ? "settings.ipStackShow" : "settings.ipStackHide");
}
