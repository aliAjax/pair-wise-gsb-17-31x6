// 校验规则层：只做判异，不修改数据，不渲染界面。
// 两类现场问题在此判定：
//   deviation 正反行程偏差超限（正+反 不抵消零偏，超过允差）
//   missing   缺少相邻测点（正/反读数缺项，或相邻深度缺测点导致区间中断）
import type { HoleConfig, Round } from "./types";
import { depthKey, depthSlots, num, readingAt } from "./math";

export interface Issue {
  depth: number;
  kind: "deviation" | "missing";
  /** 待复核区展示的判异原因 */
  reason: string;
}

/** 单个测点的正反行程偏差；读数不全返回 null */
export function deviationOf(round: Round, depth: number): number | null {
  const r = readingAt(round, depth);
  const f = num(r.forward);
  const b = num(r.reverse);
  if (f === null || b === null) return null;
  return Math.abs(f + b);
}

/** 孔底点（最深处）是否已具备完整读数 */
export function bottomHasReading(config: HoleConfig, round: Round): boolean {
  const slots = depthSlots(config.depth, config.interval);
  if (slots.length === 0) return false;
  const r = readingAt(round, slots[slots.length - 1]);
  return num(r.forward) !== null && num(r.reverse) !== null;
}

/**
 * 扫描一轮观测，列出全部判异测点。
 * 判异点先进入待复核区，写明原因（adopted/excluded）后才进入正式曲线。
 */
export function scanIssues(config: HoleConfig, round: Round): Issue[] {
  const issues: Issue[] = [];
  const slots = depthSlots(config.depth, config.interval);
  if (slots.length === 0) return issues;
  const bottom = slots[slots.length - 1];

  for (const depth of slots) {
    const r = readingAt(round, depth);
    const f = num(r.forward);
    const b = num(r.reverse);

    // 缺测：正反行程读数不全
    if (f === null || b === null) {
      const parts: string[] = [];
      if (f === null) parts.push("缺正行程读数");
      if (b === null) parts.push("缺反行程读数");
      const tail = round2Eq(depth, bottom) ? "（孔底基准点，必须补测）" : "";
      issues.push({
        depth,
        kind: "missing",
        reason: `${parts.join("，")}，该测点不能计入累计位移${tail}`,
      });
      continue;
    }

    // 正反行程偏差超限：|正+反| > 允差
    const dev = Math.abs(f + b);
    if (dev > config.tolerance + 1e-9) {
      issues.push({
        depth,
        kind: "deviation",
        reason: `正+反=${(f + b).toFixed(2)}mm，绝对值 ${dev.toFixed(
          2
        )}mm 超过允差 ${config.tolerance.toFixed(2)}mm，可能存在重测误差或零偏异常`,
      });
    }
  }

  // 缺少相邻测点：相邻深度缺测导致的区间中断，给出受影响区间，便于现场判断曲线可用性
  for (let i = 0; i < slots.length; i++) {
    const depth = slots[i];
    if (!isMissing(round, depth)) continue;
    const prev = slots[i - 1];
    const next = slots[i + 1];
    const prevOk = prev !== undefined && !isMissing(round, prev);
    const nextOk = next !== undefined && !isMissing(round, next);
    if (prevOk && nextOk) {
      issues.push({
        depth,
        kind: "missing",
        reason: `缺少相邻测点，${prev.toFixed(1)}～${next.toFixed(
          1
        )}m 区间中断，累计位移链推算到此处断开`,
      });
    } else if (nextOk) {
      issues.push({
        depth,
        kind: "missing",
        reason: `缺少相邻测点，孔口至 ${next.toFixed(
          1
        )}m 无连续测点，区间无法推算`,
      });
    }
  }

  return dedupe(issues);
}

/** 测点状态：能否进入正式曲线
 *  - ok        无判异问题
 *  - adopted   判异后写明原因并复核采用
 *  - excluded  判异后弃用 / 登记缺测
 *  - pending   判异后尚未写明处理原因（停留在待复核区）
 */
export type PointState = "ok" | "adopted" | "excluded" | "pending";

export function pointState(
  config: HoleConfig,
  round: Round,
  depth: number
): PointState {
  const issues = scanIssues(config, round).filter((x) => x.depth === depth);
  if (issues.length === 0) return "ok";
  const d = round.decisions[depthKey(depth)];
  if (!d) return "pending";
  return d.resolution === "adopted" ? "adopted" : "excluded";
}

/** 该测点是否计入正式曲线 */
export function isIncluded(config: HoleConfig, round: Round, depth: number): boolean {
  return pointState(config, round, depth) === "ok" ||
    pointState(config, round, depth) === "adopted";
}

export function pendingIssues(config: HoleConfig, round: Round): Issue[] {
  return scanIssues(config, round).filter(
    (x) => !round.decisions[depthKey(x.depth)]
  );
}

export function resolvedIssues(config: HoleConfig, round: Round): Issue[] {
  return scanIssues(config, round).filter(
    (x) => !!round.decisions[depthKey(x.depth)]
  );
}

/** 基准是否可用：有基准轮、孔底点读数完整、且无未处理判异点 */
export function baselineReady(
  config: HoleConfig,
  rounds: Round[]
): Round | null {
  const baseline = rounds.find((r) => r.kind === "baseline");
  if (!baseline) return null;
  if (!bottomHasReading(config, baseline)) return null;
  if (pendingIssues(config, baseline).length > 0) return null;
  return baseline;
}

function isMissing(round: Round, depth: number): boolean {
  const r = readingAt(round, depth);
  return num(r.forward) === null || num(r.reverse) === null;
}

function round2Eq(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function dedupe(issues: Issue[]): Issue[] {
  const map = new Map<string, Issue>();
  for (const issue of issues) {
    const key = `${depthKey(issue.depth)}:${issue.kind}`;
    const prev = map.get(key);
    // 同一深度同类问题合并，保留信息更全的一条（区间提示优先于单纯缺读数）
    if (!prev || issue.reason.length > prev.reason.length) {
      map.set(key, issue);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.depth - b.depth);
}
