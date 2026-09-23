// 正式测斜曲线：纯手写 SVG，无第三方依赖。
// 仅绘制进入正式曲线的测点；断链区间用灰色虚线标出缺测段。
import type { HoleConfig, Round } from "../inclino/types";
import { buildCurve, assessRound, type CurvePoint } from "../inclino/curves";
import { depthSlots, fmt } from "../inclino/math";

interface Props {
  config: HoleConfig;
  rounds: Round[];
  current: Round;
}

const STATUS_COLOR: Record<string, string> = {
  stable: "#0f766e",
  watch: "#d97706",
  warn: "#e11d48",
};

function segments(points: CurvePoint[]): CurvePoint[][] {
  const result: CurvePoint[][] = [];
  let seg: CurvePoint[] = [];
  for (const p of [...points].reverse()) {
    if (p.cumulative === null) {
      if (seg.length) result.push(seg);
      seg = [];
      continue;
    }
    if (seg.length === 0 || p.connected) {
      seg.push(p);
    } else {
      result.push(seg);
      seg = [p];
    }
  }
  if (seg.length) result.push(seg);
  return result;
}

export default function CurveChart({ config, rounds, current }: Props) {
  const baseline = rounds.find((r) => r.kind === "baseline") ?? null;
  const ordered = [...rounds].sort((a, b) =>
    a.date === b.date
      ? a.id < b.id
        ? -1
        : 1
      : a.date < b.date
        ? -1
        : 1
  );
  const currentCurve = buildCurve(config, baseline, current);
  const assessment = assessRound(config, rounds, current);
  const statusByDepth = new Map(
    assessment.points.map((p) => [p.depth, p.status])
  );

  const slots = depthSlots(config.depth, config.interval);
  const W = 560;
  const padL = 52;
  const padR = 24;
  const padT = 18;
  const padB = 34;
  const rowH = slots.length > 24 ? 15 : 18;
  const H = padT + padB + slots.length * rowH;

  const allCurves = ordered
    .filter((r) => r.kind !== "baseline" || ordered.length === 1)
    .map((r) => buildCurve(config, baseline, r));
  let maxAbs = Math.max(config.warnTotal, 5);
  for (const c of allCurves) {
    for (const p of c) {
      if (p.cumulative !== null) maxAbs = Math.max(maxAbs, Math.abs(p.cumulative));
    }
  }
  maxAbs = Math.ceil(maxAbs / 5) * 5;

  const x = (v: number) => padL + ((v + maxAbs) / (2 * maxAbs)) * (W - padL - padR);
  const y = (depth: number) =>
    padT + (depth / config.interval - 1) * rowH + rowH / 2;

  const pathFor = (seg: CurvePoint[]) =>
    seg
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.cumulative!).toFixed(1)},${y(p.depth).toFixed(1)}`)
      .join(" ");

  // 跨缺测区间的虚线连接（缺口两侧最近的两个有效点）
  const gapLinks: [CurvePoint, CurvePoint][] = [];
  const segs = segments(currentCurve);
  for (let i = 0; i < segs.length - 1; i++) {
    // segs 自深向浅排列；seg 内同样深→浅
    const nearDeep = segs[i][segs[i].length - 1]; // 较深段最浅点
    const nearShallow = segs[i + 1][0]; // 较浅段最深点
    if (nearDeep && nearShallow) gapLinks.push([nearDeep, nearShallow]);
  }

  const tickStep = maxAbs <= 20 ? 5 : maxAbs <= 50 ? 10 : 20;
  const ticks: number[] = [];
  for (let v = -maxAbs; v <= maxAbs + 0.001; v += tickStep) ticks.push(v);

  const depthLabels = slots.filter((d) => Math.abs(d - Math.round(d)) < 1e-9);

  const history = ordered.filter(
    (r) => r.kind !== "baseline" && r.id !== current.id
  );

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="测斜累计位移曲线">
        {/* 阈值参考线 */}
        {[-config.warnTotal, -config.watchTotal, 0, config.watchTotal, config.warnTotal].map(
          (v) => (
            <g key={v}>
              <line
                x1={x(v)}
                x2={x(v)}
                y1={padT}
                y2={H - padB}
                stroke={v === 0 ? "#94a3b8" : v === config.warnTotal || v === -config.warnTotal ? "#fecdd3" : "#fde68a"}
                strokeWidth={v === 0 ? 1.4 : 1}
                strokeDasharray={v === 0 ? undefined : "4 4"}
              />
              <text x={x(v)} y={H - padB + 18} textAnchor="middle" className="axis-text">
                {v}
              </text>
            </g>
          )
        )}

        {/* 深度刻度 */}
        {depthLabels.map((d) => (
          <g key={d}>
            <line x1={padL - 6} x2={padL} y1={y(d)} y2={y(d)} stroke="#94a3b8" />
            <text x={padL - 9} y={y(d) + 4} textAnchor="end" className="axis-text">
              {d.toFixed(0)}
            </text>
          </g>
        ))}
        <text x={14} y={padT + 8} className="axis-name">深度m</text>
        <text x={W / 2} y={H - 4} textAnchor="middle" className="axis-name">
          累计位移 mm（相对基准，正值向基坑内）
        </text>

        {/* 历次复测曲线（背景细线） */}
        {history.map((r) => {
          const curve = buildCurve(config, baseline, r);
          return segments(curve).map((seg, i) => (
            <path
              key={`${r.id}-${i}`}
              d={pathFor(seg)}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth={1.4}
            />
          ));
        })}

        {/* 缺测断链区间 */}
        {gapLinks.map(([u, l], i) => (
          <line
            key={`gap-${i}`}
            x1={x(u.cumulative!)}
            y1={y(u.depth)}
            x2={x(l.cumulative!)}
            y2={y(l.depth)}
            stroke="#e11d48"
            strokeWidth={1.2}
            strokeDasharray="3 4"
            opacity={0.55}
          />
        ))}

        {/* 本轮正式曲线 */}
        {segs.map((seg, i) => (
          <path
            key={`cur-${i}`}
            d={pathFor(seg)}
            fill="none"
            stroke={STATUS_COLOR[assessment.status]}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
        ))}
        {currentCurve.map(
          (p) =>
            p.cumulative !== null && (
              <circle
                key={p.depth}
                cx={x(p.cumulative)}
                cy={y(p.depth)}
                r={3.4}
                fill={STATUS_COLOR[statusByDepth.get(p.depth) ?? "stable"]}
              />
            )
        )}
      </svg>

      <div className="chart-legend">
        <span><i className="dot stable" />稳定</span>
        <span><i className="dot watch" />关注</span>
        <span><i className="dot warn" />预警</span>
        <span><i className="dot hist" />历次复测</span>
        <span className="legend-note">
          最大累计 {fmt(assessment.maxCumulative)}mm
          {assessment.maxDepth !== null ? `（${assessment.maxDepth.toFixed(1)}m）` : ""}
        </span>
      </div>
    </div>
  );
}
