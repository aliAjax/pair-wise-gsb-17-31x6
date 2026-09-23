// 状态提示：再次观测时对照基准和上次结果，给出稳定 / 关注 / 预警。
import type { HoleConfig, Round } from "../inclino/types";
import { assessRound } from "../inclino/curves";
import { baselineReady, pendingIssues } from "../inclino/rules";
import { fmt } from "../inclino/math";

interface Props {
  config: HoleConfig;
  rounds: Round[];
  round: Round;
}

const META: Record<
  string,
  { title: string; cls: string; hint: string }
> = {
  stable: {
    title: "稳定",
    cls: "stable",
    hint: "累计位移与变化速率均在关注值以内，可按正常频次观测。",
  },
  watch: {
    title: "关注",
    cls: "watch",
    hint: "累计位移或变化速率达到关注值，应加密观测并核查现场工况。",
  },
  warn: {
    title: "预警",
    cls: "warn",
    hint: "累计位移或变化速率达到预警值，立即上报并启动应急监测流程。",
  },
};

export default function StatusBanner({ config, rounds, round }: Props) {
  const baseline = baselineReady(config, rounds);
  const pending = pendingIssues(config, round).length;
  const assessment = assessRound(config, rounds, round);
  const meta = META[assessment.status];

  if (round.kind === "baseline") {
    return (
      <div className="banner banner-baseline">
        <strong>基准观测{pending > 0 ? "（尚未完成）" : ""}</strong>
        <span>
          {pending > 0
            ? `还有 ${pending} 个测点待复核，处理完成后基准方可用于后续复测对照。`
            : "基准已通过校验，复测时将以本轮各测点倾斜量为零点起算累计位移。"}
        </span>
      </div>
    );
  }

  if (!baseline) {
    return (
      <div className="banner banner-warn">
        <strong>尚无可用基准</strong>
        <span>
          需先完成基准观测（孔底测点读数完整、无待复核问题），复测数据才能对照基准判定。
        </span>
      </div>
    );
  }

  const banner = (
    <>
      <div className="banner-main">
        <strong>{meta.title}</strong>
        <span>{meta.hint}</span>
      </div>
      <div className="banner-stats">
        <div>
          <span>最大累计位移</span>
          <b>
            {fmt(assessment.maxCumulative)} mm
            {assessment.maxDepth !== null && (
              <em>（{assessment.maxDepth.toFixed(1)}m）</em>
            )}
          </b>
        </div>
        <div>
          <span>较上次最大速率</span>
          <b>
            {assessment.rateDepth === null
              ? "—"
              : `${fmt(assessment.maxRate)} mm/d`}
            {assessment.rateDepth !== null && (
              <em>（{assessment.rateDepth.toFixed(1)}m）</em>
            )}
          </b>
        </div>
        <div>
          <span>对照</span>
          <b className="threshold-line">
            关注 {config.watchTotal}mm / {config.watchRate}mm·d⁻¹
            <br />
            预警 {config.warnTotal}mm / {config.warnRate}mm·d⁻¹
          </b>
        </div>
        {pending > 0 && (
          <div className="banner-pending">
            <b>{pending}</b>
            <span>个测点待复核，曲线在该处断链</span>
          </div>
        )}
      </div>
      {assessment.isFirstObservation && (
        <span className="first-note">首次复测：累计位移对照基准判定，速率需待下次观测。</span>
      )}
    </>
  );

  return (
    <div className={`banner banner-${meta.cls} ${assessment.isFirstObservation ? "first" : ""}`}>
      {banner}
    </div>
  );
}
