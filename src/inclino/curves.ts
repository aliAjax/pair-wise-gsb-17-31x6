// 数据整理层：由校验后的测点读数推算正式曲线，并对照基准/上次结果给出状态判定。
// 本文件只做计算，不读写存储、不依赖界面。
import type { HoleConfig, Round } from "./types";
import { daysBetween, depthKey, depthSlots, tiltOf } from "./math";
import { isIncluded } from "./rules";

export type Status = "stable" | "watch" | "warn";

export interface CurvePoint {
  depth: number;
  /** 相对基准的累计位移（自孔底不动点起算），无法推算为 null */
  cumulative: number | null;
  /** 是否与相邻点连续；false 表示越过缺测区间（绘制虚线） */
  connected: boolean;
  included: boolean;
}

/**
 * 推算一轮的正式累计位移曲线（孔底不动点起算，逐测段累加）：
 *   位移增量 = 本次测段倾斜量 - 基准测段倾斜量（读数单位 mm，已是 0.5m 测段位移）
 *   S(自下而上) = S(下一测点) + 位移增量
 * 基准轮自身无对照基准，各测点累计位移恒为 0（零位移基准线）。
 * 仅采用无判异或复核采用的测点；遇到弃用/待复核测点则断链，上方为 null。
 */
export function buildCurve(
  config: HoleConfig,
  baseline: Round | null,
  round: Round
): CurvePoint[] {
  const slots = depthSlots(config.depth, config.interval);

  // 基准轮：零位移基准线，未纳入正式曲线的测点（判异）仍为 null
  if (round.kind === "baseline" || !baseline) {
    return [...slots].reverse().map((depth, i) => {
      const included = isIncluded(config, round, depth);
      const prevIncluded =
        i > 0 && isIncluded(config, round, slots[slots.length - i]);
      return {
        depth,
        cumulative: included ? 0 : null,
        connected: included && i > 0 && prevIncluded,
        included,
      };
    }).reverse();
  }
  // 自下而上推算
  const ascending = [...slots].reverse();
  let cum = 0;
  let chained = false;

  const points = ascending.map<CurvePoint>((depth, i) => {
    const included = isIncluded(config, round, depth);
    const baseIncluded = baseline
      ? isIncluded(config, baseline, depth)
      : true;
    const tilt = tiltOfRaw(round, depth);
    const baseTilt = baseline ? tiltOfRaw(baseline, depth) : 0;

    if (!included || !baseIncluded || tilt === null) {
      chained = false;
      return { depth, cumulative: null, connected: false, included: false };
    }

    if (!chained) {
      // 链条起点：孔底点取 0（不动点假设）；非孔底点只能断链
      const isBottom = i === 0;
      if (!isBottom) {
        return { depth, cumulative: null, connected: false, included: false };
      }
      cum = 0;
      chained = true;
      return { depth, cumulative: 0, connected: false, included: true };
    }

    const delta = tilt - (baseline ? (baseTilt ?? 0) : 0);
    cum = cum + delta;
    return {
      depth,
      cumulative: round2(cum),
      connected: true,
      included: true,
    };
  });

  // 返回按深度升序（孔口在上）
  return points.reverse();
}

/** 自动推算的各测点累计位移，供录入区一键誊填 */
export function cumulativeSeries(
  config: HoleConfig,
  baseline: Round | null,
  round: Round
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const p of buildCurve(config, baseline, round)) {
    out[depthKey(p.depth)] = p.cumulative;
  }
  return out;
}

export interface PointAssessment {
  depth: number;
  cumulative: number | null;
  previous: number | null;
  rate: number | null;
  status: Status;
}

export interface RoundAssessment {
  baselineReady: boolean;
  /** 本轮整体状态（取各测点最差） */
  status: Status;
  /** 最大累计位移及所在深度 */
  maxCumulative: number;
  maxDepth: number | null;
  /** 最大变化速率及所在深度 */
  maxRate: number;
  rateDepth: number | null;
  daysSincePrev: number | null;
  points: PointAssessment[];
  /** 无可比的上次观测 */
  isFirstObservation: boolean;
}

function classify(value: number, rate: number | null, config: HoleConfig): Status {
  if (
    Math.abs(value) >= config.warnTotal ||
    (rate !== null && Math.abs(rate) >= config.warnRate)
  ) {
    return "warn";
  }
  if (
    Math.abs(value) >= config.watchTotal ||
    (rate !== null && Math.abs(rate) >= config.watchRate)
  ) {
    return "watch";
  }
  return "stable";
}

/**
 * 对照基准和上一次结果给出稳定 / 关注 / 预警。
 * 累计位移对照基准，变化速率对照上一轮（mm/d，按日历日）。
 */
export function assessRound(
  config: HoleConfig,
  rounds: Round[],
  round: Round
): RoundAssessment {
  const ordered = [...rounds].sort((a, b) =>
    a.date === b.date
      ? a.id < b.id
        ? -1
        : 1
      : a.date < b.date
        ? -1
        : 1
  );
  const baseline = ordered.find((r) => r.kind === "baseline") ?? null;
  const idx = ordered.findIndex((r) => r.id === round.id);
  const previous =
    round.kind === "baseline"
      ? null
      : [...ordered.slice(0, idx)].reverse().find((r) => r.kind !== "baseline") ??
        null;

  const curve = buildCurve(config, baseline, round);
  const prevCurve = previous ? buildCurve(config, baseline, previous) : null;
  const days =
    previous && baseline ? daysBetween(previous.date, round.date) : null;
  const isFirstObservation = round.kind !== "baseline" && !previous;

  let status: Status = "stable";
  let maxCumulative = 0;
  let maxDepth: number | null = null;
  let maxRate = 0;
  let rateDepth: number | null = null;

  const points: PointAssessment[] = curve.map((p) => {
    const prev =
      prevCurve?.find((q) => q.depth === p.depth)?.cumulative ?? null;
    let rate: number | null = null;
    if (p.cumulative !== null && prev !== null && days && days > 0) {
      rate = (p.cumulative - prev) / days;
    }
    const pointStatus =
      p.cumulative === null
        ? "stable"
        : classify(p.cumulative, rate, config);
    if (p.cumulative !== null) {
      if (Math.abs(p.cumulative) > Math.abs(maxCumulative)) {
        maxCumulative = p.cumulative;
        maxDepth = p.depth;
      }
      if (rate !== null && Math.abs(rate) > Math.abs(maxRate)) {
        maxRate = rate;
        rateDepth = p.depth;
      }
    }
    if (pointStatus === "warn") status = "warn";
    else if (pointStatus === "watch" && status !== "warn") status = "watch";
    return { depth: p.depth, cumulative: p.cumulative, previous: prev, rate, status: pointStatus };
  });

  return {
    baselineReady: !!baseline,
    status,
    maxCumulative,
    maxDepth,
    maxRate,
    rateDepth,
    daysSincePrev: days,
    points,
    isFirstObservation,
  };
}

function tiltOfRaw(round: Round, depth: number): number | null {
  const r = round.readings.find((x) => x.depth === depth);
  return r ? tiltOf(r) : null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
