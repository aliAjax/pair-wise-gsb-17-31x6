// 钻孔设置：每孔先设基准——孔深、测点间距、正反行程允差与稳定/关注/预警阈值。
// 孔深/间距调整后将按新序列重新排测点行（已有读数按深度保留）。
import { useState } from "react";
import type { HoleConfig } from "../inclino/types";

interface Props {
  config: HoleConfig;
  onSave: (patch: Partial<HoleConfig>) => void;
  onClose: () => void;
}

function Field({
  label,
  unit,
  value,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label>
      <span>
        {label}（{unit}）
      </span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

export default function HoleSetup({ config, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    name: config.name,
    location: config.location,
    depth: config.depth,
    interval: config.interval,
    tolerance: config.tolerance,
    watchTotal: config.watchTotal,
    warnTotal: config.warnTotal,
    watchRate: config.watchRate,
    warnRate: config.warnRate,
  });
  const set = (k: keyof typeof form) => (v: number | string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid =
    form.name.trim() !== "" &&
    form.depth > 0 &&
    form.interval > 0 &&
    form.tolerance > 0 &&
    form.watchTotal > 0 &&
    form.warnTotal > form.watchTotal &&
    form.watchRate > 0 &&
    form.warnRate > form.watchRate;

  return (
    <div className="setup-grid">
      <label>
        <span>孔号</span>
        <input value={form.name} onChange={(e) => set("name")(e.target.value)} />
      </label>
      <label>
        <span>孔位描述</span>
        <input value={form.location} onChange={(e) => set("location")(e.target.value)} />
      </label>
      <Field label="孔深" unit="m" value={form.depth} step={0.5} onChange={set("depth")} />
      <Field label="测点间距" unit="m" value={form.interval} step={0.5} onChange={set("interval")} />
      <Field label="正反行程允差 |正+反|" unit="mm" value={form.tolerance} step={0.1} onChange={set("tolerance")} />
      <Field label="累计位移关注值" unit="mm" value={form.watchTotal} step={1} onChange={set("watchTotal")} />
      <Field label="累计位移预警值" unit="mm" value={form.warnTotal} step={1} onChange={set("warnTotal")} />
      <Field label="变化速率关注值" unit="mm/d" value={form.watchRate} step={0.5} onChange={set("watchRate")} />
      <Field label="变化速率预警值" unit="mm/d" value={form.warnRate} step={0.5} onChange={set("warnRate")} />
      <div className="setup-actions">
        <button className="ghost" onClick={onClose}>
          返回
        </button>
        <button
          className="primary-action"
          disabled={!valid}
          onClick={() => {
            onSave({
              ...form,
              name: form.name.trim(),
              location: form.location.trim(),
            });
            onClose();
          }}
        >
          保存基准参数
        </button>
      </div>
    </div>
  );
}
