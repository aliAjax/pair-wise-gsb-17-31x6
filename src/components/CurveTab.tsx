import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Borehole } from "../domain/types";
import type { HoleAssessment } from "../domain/rules";
import {
  baselineOf,
  fmtMm,
  formalReadings,
  surveyCurve,
} from "../domain/rules";
import { Badge, HOLE_STATUS_META, POINT_STATUS_META } from "./ui";

const SERIES_COLORS = ["#94a3b8", "#38bdf8", "#a16207", "#e11d48"];

/** 曲线页：对照基准与上次结果给出稳定/关注/预警，仅绘制已准入正式测点 */
export function CurveTab({ hole, assessment }: { hole: Borehole; assessment: HoleAssessment }) {
  const baseline = baselineOf(hole);
  const [relative, setRelative] = useState(true);
  const [showPrev, setShowPrev] = useState(true);

  if (!baseline) {
    return (
      <section className="panel notice-panel">
        <h2>正式曲线尚不可用</h2>
        <p>建立基准并完成测点复核后，这里将按深度绘制累计位移曲线并给出状态判定。</p>
      </section>
    );
  }

  const meta = HOLE_STATUS_META[assessment.status];
  const latest = assessment.latest;
  const previous = assessment.previous;
  const curves = [...hole.surveys]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s, i) => ({
      survey: s,
      color:
        latest && s.id === latest.id
          ? "#0f766e"
          : s.kind === "baseline"
          ? "#92400e"
          : SERIES_COLORS[i % SERIES_COLORS.length],
      points: surveyCurve(s, relative && s.kind !== "baseline" ? baseline : null),
    }))
    .filter((c) => c.points.length > 0);

  const visibleCurves = showPrev
    ? curves
    : curves.filter((c) => c.survey.kind === "baseline" || (latest && c.survey.id === latest.id));

  return (
    <div className="tab-stack">
      <section className={`panel status-banner ${meta.cls}`}>
        <div>
          <p>最新观测{latest ? ` · ${latest.date}` : ""}</p>
          <h2>
            当前判定：{meta.label}
            <Badge cls={meta.cls} label={meta.label} />
          </h2>
          {assessment.status === "baseline" && <p>已建立基准，等待首次复测对照。</p>}
          {latest && (
            <p className="banner-sub">
              正式测点 {assessment.points.length} 个；对照基准 {baseline.date}
              {previous ? `，上次复测 ${previous.date}` : ""}
              {assessment.pending > 0 ? `；另有 ${assessment.pending} 个测点待复核，未参与判定` : ""}
            </p>
          )}
        </div>
        <div className="curve-toggles">
          <label className="switch-label">
            <input type="checkbox" checked={relative} onChange={(e) => setRelative(e.target.checked)} />
            相对基准位移
          </label>
          <label className="switch-label">
            <input type="checkbox" checked={showPrev} onChange={(e) => setShowPrev(e.target.checked)} />
            显示历次曲线
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>正式曲线</p>
            <h2>位移 — 深度曲线（mm）</h2>
          </div>
        </div>
        <CurveChart
          curves={visibleCurves}
          depthMax={hole.totalDepth}
          thresholds={[
            { v: hole.thresholds.watchMm, cls: "line-watch", label: `关注 ${hole.thresholds.watchMm}` },
            { v: hole.thresholds.alertMm, cls: "line-alert", label: `预警 ${hole.thresholds.alertMm}` },
            { v: -hole.thresholds.watchMm, cls: "line-watch", label: "" },
            { v: -hole.thresholds.alertMm, cls: "line-alert", label: "" },
          ]}
          relative={relative}
        />
        <div className="legend">
          {visibleCurves.map((c) => (
            <span key={c.survey.id} className="legend-item">
              <i style={{ background: c.color }} />
              {c.survey.kind === "baseline" ? "基准" : "复测"} · {c.survey.date}（{formalReadings(c.survey).length} 点）
            </span>
          ))}
        </div>
        <p className="muted chart-note">缺测区间与未通过复核的测点不参与连线；曲线仅代表可采信数据。</p>
      </section>

      {latest && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p>逐点判定</p>
              <h2>对照基准与上次复测（{latest.date}）</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="assess-table">
              <thead>
                <tr>
                  <th>深度(m)</th>
                  <th>基准(mm)</th>
                  <th>上次(mm)</th>
                  <th>本次(mm)</th>
                  <th>较基准(mm)</th>
                  <th>速率(mm/d)</th>
                  <th>判定</th>
                  <th>依据</th>
                </tr>
              </thead>
              <tbody>
                {assessment.points.map((p) => {
                  const pm = POINT_STATUS_META[p.status];
                  return (
                    <tr key={p.depth} className={`assess-${p.status}`}>
                      <td className="depth-cell">{p.depth}</td>
                      <td>{p.baseline.toFixed(1)}</td>
                      <td>{p.previous === null ? "—" : p.previous.toFixed(1)}</td>
                      <td>{p.cumulative.toFixed(1)}</td>
                      <td>{fmtMm(p.delta)}</td>
                      <td>{p.rate === null ? "—" : `${p.rate >= 0 ? "+" : ""}${p.rate.toFixed(2)}`}</td>
                      <td>
                        <Badge cls={pm.cls} label={pm.label} />
                      </td>
                      <td className="reason-cell">{p.reasons.join("；")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

interface ChartCurve {
  survey: { id: string; kind: string; date: string };
  color: string;
  points: { depth: number; value: number }[];
}

function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function CurveChart({
  curves,
  depthMax,
  thresholds,
  relative,
}: {
  curves: ChartCurve[];
  depthMax: number;
  thresholds: { v: number; cls: string; label: string }[];
  relative: boolean;
}) {
  const [ref, width] = useWidth();
  const height = Math.min(560, Math.max(360, depthMax * 22));
  const padL = 56;
  const padR = 24;
  const padT = 16;
  const padB = 34;

  const allValues = curves.flatMap((c) => c.points.map((p) => p.value));
  const dataMax = allValues.length ? Math.max(...allValues.map(Math.abs)) : 10;
  const limitMax = Math.max(...thresholds.map((t) => Math.abs(t.v)), 1);
  const xMax = niceCeil(Math.max(dataMax, limitMax, 10) * 1.15);
  const xMin = -xMax;

  const x = (v: number) => padL + ((v - xMin) / (xMax - xMin)) * (width - padL - padR);
  const y = (d: number) => padT + (d / depthMax) * (height - padT - padB);

  const depthTicks = ticks(0, depthMax, Math.max(4, Math.round(depthMax / 4)));
  const xTicks = [-xMax, -xMax / 2, 0, xMax / 2, xMax];

  // 缺测点会被滤掉；为避免跨越长缺测区间强行连线，相邻深度差大于 1.5 倍点距时断开
  const segments = (pts: { depth: number; value: number }[]) => {
    const segs: typeof pts[] = [];
    let cur: typeof pts = [];
    const sorted = [...pts].sort((a, b) => a.depth - b.depth);
    sorted.forEach((p, i) => {
      if (i === 0 || p.depth - sorted[i - 1].depth - minSpacing(pts) < 1e-6) {
        cur.push(p);
      } else {
        if (cur.length) segs.push(cur);
        cur = [p];
      }
    });
    if (cur.length) segs.push(cur);
    return segs;
  };

  return (
    <div ref={ref} className="chart-host">
      <svg width={width} height={height} role="img" aria-label="位移深度曲线">
        {xTicks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={padT} x2={x(t)} y2={height - padB} className="grid-line" />
            <text x={x(t)} y={height - padB + 18} textAnchor="middle" className="axis-text">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {depthTicks.map((d) => (
          <g key={d}>
            <line x1={padL} y1={y(d)} x2={width - padR} y2={y(d)} className="grid-line" />
            <text x={padL - 8} y={y(d) + 4} textAnchor="end" className="axis-text">
              {d}
            </text>
          </g>
        ))}

        {/* 关注 / 预警限值线 */}
        {relative &&
          thresholds.map((t, i) =>
            x(t.v) > padL && x(t.v) < width - padR ? (
              <g key={i}>
                <line x1={x(t.v)} y1={padT} x2={x(t.v)} y2={height - padB} className={`threshold-line ${t.cls}`} />
                {t.label && (
                  <text x={x(t.v) + 3} y={padT + 12} className={`threshold-text ${t.cls}`}>
                    {t.label}
                  </text>
                )}
              </g>
            ) : null
          )}

        {/* 零位移基准轴 */}
        <line x1={x(0)} y1={padT} x2={x(0)} y2={height - padB} className="zero-line" />

        {curves.map((c) =>
          segments(c.points).map((seg, si) => (
            <polyline
              key={`${c.survey.id}-${si}`}
              fill="none"
              stroke={c.color}
              strokeWidth={c.survey.kind === "baseline" || curves[curves.length - 1] === c ? 2.4 : 1.4}
              strokeDasharray={c.survey.kind === "baseline" ? "6 4" : undefined}
              points={seg.map((p) => `${x(p.value)},${y(p.depth)}`).join(" ")}
            />
          ))
        )}
        {curves.map((c) =>
          c.points.map((p) => (
            <circle key={`${c.survey.id}-${p.depth}`} cx={x(p.value)} cy={y(p.depth)} r={2.6} fill={c.color} />
          ))
        )}

        <text x={padL} y={height - 4} className="axis-title">
          位移（mm，{relative ? "相对基准" : "原始累计"}）
        </text>
        <text x={14} y={padT + 6} className="axis-title">
          深度(m)
        </text>
      </svg>
    </div>
  );
}

function minSpacing(pts: { depth: number }[]): number {
  const ds = [...new Set(pts.map((p) => p.depth))].sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < ds.length; i++) min = Math.min(min, ds[i] - ds[i - 1]);
  return min === Infinity ? 0 : min * 1.5;
}

function ticks(min: number, max: number, count: number): number[] {
  const step = max / count;
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(Math.round((min + step * i) * 100) / 100);
  return out;
}

function niceCeil(v: number): number {
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * mag;
}
