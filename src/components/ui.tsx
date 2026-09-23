import { useEffect, useState } from "react";
import type { HoleStatus, PointStatus, ReviewState } from "../domain/types";

/* 状态展示元数据：界面层只负责显示，判定来自 domain/rules */

export const HOLE_STATUS_META: Record<HoleStatus, { label: string; cls: string; dot: string }> = {
  idle: { label: "未设基准", cls: "badge-idle", dot: "dot-idle" },
  baseline: { label: "待复测", cls: "badge-baseline", dot: "dot-baseline" },
  stable: { label: "稳定", cls: "badge-stable", dot: "dot-stable" },
  watch: { label: "关注", cls: "badge-watch", dot: "dot-watch" },
  alert: { label: "预警", cls: "badge-alert", dot: "dot-alert" },
};

export const POINT_STATUS_META: Record<PointStatus, { label: string; cls: string }> = {
  stable: { label: "稳定", cls: "badge-stable" },
  watch: { label: "关注", cls: "badge-watch" },
  alert: { label: "预警", cls: "badge-alert" },
};

export const REVIEW_META: Record<ReviewState, { label: string; cls: string }> = {
  none: { label: "通过", cls: "badge-pass" },
  pending: { label: "待复核", cls: "badge-pending" },
  accepted: { label: "已采纳", cls: "badge-accepted" },
  rejected: { label: "已退回", cls: "badge-rejected" },
};

export function Badge({ cls, label }: { cls: string; label: string }) {
  return <span className={`badge ${cls}`}>{label}</span>;
}

/** 数字录入框：空字符串 = 缺测(null)；失焦或回车时提交，非法输入标红不提交 */
export function NumberField({
  value,
  onCommit,
  placeholder = "缺测",
  ariaLabel,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [bad, setBad] = useState(false);

  useEffect(() => {
    setText(value === null ? "" : String(value));
  }, [value]);

  const commit = () => {
    const t = text.trim();
    if (t === "") {
      setBad(false);
      onCommit(null);
      return;
    }
    const n = Number(t);
    if (Number.isFinite(n)) {
      setBad(false);
      if (n !== value) onCommit(n);
    } else {
      setBad(true);
    }
  };

  return (
    <input
      className={`num-input${bad ? " invalid" : ""}`}
      value={text}
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        setBad(false);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
