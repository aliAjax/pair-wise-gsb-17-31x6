import { useState } from "react";
import type { Borehole, Thresholds } from "../domain/types";
import { expectedDepths, formalReadings, fmtDepth } from "../domain/rules";
import { Badge, today } from "./ui";

/** 基准页：每孔先设基准；基准确定测点序列与孔参数，阈值在此调整 */
export function BaselineTab({
  hole,
  onAddBaseline,
  onThresholds,
}: {
  hole: Borehole;
  onAddBaseline: (date: string) => void;
  onThresholds: (patch: Partial<Thresholds>) => void;
}) {
  const baseline = hole.surveys.find((s) => s.kind === "baseline") ?? null;
  const [date, setDate] = useState(today());
  const depths = expectedDepths(hole.totalDepth, hole.spacing);
  const formal = baseline ? formalReadings(baseline) : [];

  return (
    <div className="tab-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p>孔位基准</p>
            <h2>{hole.code} 基准设置</h2>
          </div>
        </div>

        <div className="info-grid">
          <div>
            <span>孔号</span>
            <strong>{hole.code}</strong>
          </div>
          <div>
            <span>位置</span>
            <strong>{hole.location}</strong>
          </div>
          <div>
            <span>孔深 / 点距</span>
            <strong>
              {hole.totalDepth} m / {hole.spacing} m
            </strong>
          </div>
          <div>
            <span>测点序列</span>
            <strong>
              {depths.length} 点 · {fmtDepth(depths[0] ?? 0)} 起
            </strong>
          </div>
        </div>

        {!baseline ? (
          <div className="empty-banner">
            <div>
              <h3>尚未建立基准</h3>
              <p>基准测次确定测点序列与初始读数；未设基准前不能进行复测判定与正式曲线绘制。</p>
            </div>
            <div className="baseline-create">
              <label>
                <span>基准观测日期</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <button className="primary-action" onClick={() => onAddBaseline(date)}>
                建立基准测次
              </button>
            </div>
          </div>
        ) : (
          <div className="baseline-summary">
            <div className="baseline-line">
              <Badge cls="badge-baseline" label="基准已建立" />
              <strong>{baseline.date}</strong>
              <span>
                {formal.length}/{baseline.readings.length} 个测点进入正式曲线
              </span>
            </div>
            {baseline.note && <p className="muted">{baseline.note}</p>}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>校验与预警规则</p>
            <h2>阈值设置</h2>
          </div>
        </div>
        <div className="threshold-grid">
          <ThresholdField
            label="正反和偏差限值"
            unit="读数单位"
            value={hole.thresholds.sumTol}
            hint="|正程+反程 − 典型值| 超限即进入待复核"
            onChange={(v) => onThresholds({ sumTol: v })}
          />
          <ThresholdField
            label="累计位移关注值"
            unit="mm"
            value={hole.thresholds.watchMm}
            hint="较基准位移达到该值提示关注"
            onChange={(v) => onThresholds({ watchMm: v })}
          />
          <ThresholdField
            label="累计位移预警值"
            unit="mm"
            value={hole.thresholds.alertMm}
            hint="较基准位移达到该值提示预警"
            onChange={(v) => onThresholds({ alertMm: v })}
          />
          <ThresholdField
            label="速率关注值"
            unit="mm/d"
            value={hole.thresholds.rateWatch}
            hint="较上次复测的位移速率关注限"
            onChange={(v) => onThresholds({ rateWatch: v })}
          />
          <ThresholdField
            label="速率预警值"
            unit="mm/d"
            value={hole.thresholds.rateAlert}
            hint="较上次复测的位移速率预警限"
            onChange={(v) => onThresholds({ rateAlert: v })}
          />
        </div>
      </section>
    </div>
  );
}

function ThresholdField({
  label,
  unit,
  value,
  hint,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  hint: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="threshold-field">
      <span>
        {label}（{unit}）
      </span>
      <input
        type="number"
        value={value}
        min={0}
        step={0.5}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
      />
      <small>{hint}</small>
    </label>
  );
}
