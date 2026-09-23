// 深度录入表：按深度逐点录入正行程、反行程、纸表累计位移；
// 实时显示正反偏差、推算累计位移与测点状态，待复核点醒目提示。
import type { HoleConfig, Round } from "../inclino/types";
import {
  deviationOf,
  pointState,
  type PointState,
} from "../inclino/rules";
import { cumulativeSeries } from "../inclino/curves";
import { depthSlots, fmt, num, readingAt } from "../inclino/math";

interface Props {
  config: HoleConfig;
  baseline: Round | null;
  round: Round;
  onEdit: (depth: number, field: "forward" | "reverse" | "cumulative", value: string) => void;
  onFillCumulative: (series: Record<string, number | null>) => void;
}

const STATE_TEXT: Record<PointState, string> = {
  ok: "正常",
  adopted: "复核采用",
  excluded: "弃用/缺测",
  pending: "待复核",
};

export default function ReadingTable({
  config,
  baseline,
  round,
  onEdit,
  onFillCumulative,
}: Props) {
  const slots = depthSlots(config.depth, config.interval);
  const series = cumulativeSeries(config, baseline, round);

  const entered = round.readings.filter(
    (r) => num(r.forward) !== null || num(r.reverse) !== null || r.cumulative.trim() !== ""
  ).length;

  return (
    <div className="reading-table-wrap">
      <div className="table-toolbar">
        <p>
          测点 {slots.length} 个，已录入 {entered} 个 · 正反行程允差
          <strong> {config.tolerance.toFixed(2)}mm</strong>
        </p>
        <button
          className="ghost"
          onClick={() => onFillCumulative(series)}
          disabled={!baseline && round.kind === "observation"}
          title={
            !baseline && round.kind === "observation"
              ? "本孔尚未完成基准观测"
              : "按基准自孔底逐段推算，誊入纸表累计位移列"
          }
        >
          一键誊填推算累计位移
        </button>
      </div>

      <div className="table-scroll">
        <table className="reading-table">
          <thead>
            <tr>
              <th>深度 m</th>
              <th>正行程读数 mm</th>
              <th>反行程读数 mm</th>
              <th>正反偏差 |正+反|</th>
              <th>纸表累计位移 mm</th>
              <th>推算累计 mm</th>
              <th>测点状态</th>
            </tr>
          </thead>
          <tbody>
            {[...slots].reverse().map((depth) => {
              const r = readingAt(round, depth);
              const dev = deviationOf(round, depth);
              const state = pointState(config, round, depth);
              const over = dev !== null && dev > config.tolerance + 1e-9;
              const calc = series[depth.toFixed(2)] ?? null;
              const paper = num(r.cumulative);
              const mismatch =
                paper !== null && calc !== null && Math.abs(paper - calc) > 0.6;

              return (
                <tr key={depth} className={`row-${state}`}>
                  <td className="depth-cell">
                    {depth.toFixed(1)}
                    {depth === slots[slots.length - 1] && (
                      <span className="bottom-tag">孔底</span>
                    )}
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={r.forward}
                      placeholder="下放读数"
                      onChange={(e) => onEdit(depth, "forward", e.target.value)}
                      aria-label={`${depth.toFixed(1)}米正行程读数`}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={r.reverse}
                      placeholder="提升读数"
                      onChange={(e) => onEdit(depth, "reverse", e.target.value)}
                      aria-label={`${depth.toFixed(1)}米反行程读数`}
                    />
                  </td>
                  <td className={over ? "cell-over" : "cell-ok"}>
                    {dev === null ? "—" : fmt(dev)}
                    {over && <span className="over-flag">超限</span>}
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={r.cumulative}
                      placeholder="誊自纸表"
                      onChange={(e) => onEdit(depth, "cumulative", e.target.value)}
                      aria-label={`${depth.toFixed(1)}米累计位移`}
                    />
                    {mismatch && <span className="mismatch-flag">与推算差 {fmt(paper! - calc)}</span>}
                  </td>
                  <td className={calc === null ? "cell-null" : "cell-ok"}>
                    {fmt(calc)}
                  </td>
                  <td>
                    <span className={`state-tag ${state}`}>{STATE_TEXT[state]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
