import type {
  AppData,
  Borehole,
  HoleStatus,
  PointStatus,
  ReadIssue,
  Reading,
  ReviewState,
  Survey,
  Thresholds,
} from "./types";

/* ----------------------------- 基础工具 ----------------------------- */

export const DEFAULT_THRESHOLDS: Thresholds = {
  // 正反行程之和相对典型值偏差超 4 个读数单位 → 超限
  sumTol: 4,
  // 较基准累计位移关注 / 预警（mm）
  watchMm: 10,
  alertMm: 30,
  // 位移速率关注 / 预警（mm/d）
  rateWatch: 1,
  rateAlert: 3,
};

export function uid(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rnd}`;
}

export function expectedDepths(totalDepth: number, spacing: number): number[] {
  const depths: number[] = [];
  for (let d = spacing; d <= totalDepth + 1e-6; d += spacing) {
    depths.push(Math.round(d * 100) / 100);
  }
  return depths;
}

export function isMissing(v: number | null | undefined): boolean {
  return v === null || v === undefined || Number.isNaN(v);
}

export function median(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function fmtDepth(d: number): string {
  return `${Math.round(d * 100) / 100} m`;
}

export function fmtMm(v: number | null): string {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
}

export function daysBetween(a: string, b: string): number {
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.max(1, Math.round((t2 - t1) / 86_400_000));
}

/* ------------------------- 测点问题判定（规则层） ------------------------- */

/**
 * 依据原始读数重新计算某测点的问题集合：
 * 1. 正 / 反行程任一缺测            → missing（缺测区间）
 * 2. 相邻测点读数缺失              → gap（缺少相邻测点，无法可靠积分）
 * 3. 正反行程之和偏离本测次典型值   → sum（正反行程差异超限）
 */
export function evaluateReading(
  index: number,
  rows: Array<Pick<Reading, "forward" | "reverse">>,
  sumTol: number,
  typicalSum: number | null
): ReadIssue[] {
  const issues: ReadIssue[] = [];
  const r = rows[index];
  const fMiss = isMissing(r.forward);
  const rMiss = isMissing(r.reverse);

  if (fMiss || rMiss) {
    issues.push({
      type: "missing",
      message: fMiss && rMiss ? "正、反行程读数均缺测" : fMiss ? "正行程读数缺测" : "反行程读数缺测",
    });
  }

  const prev = rows[index - 1];
  const next = rows[index + 1];
  if (!fMiss || !rMiss) {
    const neighborMiss =
      (prev && (isMissing(prev.forward) || isMissing(prev.reverse))) ||
      (next && (isMissing(next.forward) || isMissing(next.reverse)));
    if (neighborMiss) {
      issues.push({ type: "gap", message: "相邻测点缺测，缺少积分基准" });
    }
  }

  if (!fMiss && !rMiss && typicalSum !== null) {
    const diff = Math.abs((r.forward as number) + (r.reverse as number) - typicalSum);
    if (diff > sumTol) {
      issues.push({
        type: "sum",
        message: `正反行程之和偏离典型值 ${diff.toFixed(1)}（限值 ${sumTol}）`,
      });
    }
  }
  return issues;
}

function typicalSum(readings: Reading[]): number | null {
  return median(
    readings
      .filter((r) => !isMissing(r.forward) && !isMissing(r.reverse))
      .map((r) => (r.forward as number) + (r.reverse as number))
  );
}

/**
 * 重新评估整个测次：更新每个测点的 issues，并保留仍然成立的复核结论。
 * 规则：无问题 → none；有问题但问题集合与原先一致 → 保留原结论；否则回到 pending。
 */
export function applyEvaluation(survey: Survey, sumTol: number): Survey {
  const base = survey.readings.map((r) => ({ forward: r.forward, reverse: r.reverse }));
  const ref = typicalSum(survey.readings);
  const readings = survey.readings.map((r, i) => {
    const issues = evaluateReading(i, base, sumTol, ref);
    let review: ReviewState = "none";
    let reviewReason = "";
    let reviewedAt: string | null = null;
    if (issues.length > 0) {
      const sameIssues =
        r.issues.length === issues.length &&
        issues.every((a) => r.issues.some((b) => a.type === b.type));
      if (sameIssues && (r.review === "accepted" || r.review === "rejected")) {
        review = r.review;
        reviewReason = r.reviewReason;
        reviewedAt = r.reviewedAt;
      } else {
        review = "pending";
      }
    }
    return { ...r, issues, review, reviewReason, reviewedAt };
  });
  return { ...survey, readings };
}

/* --------------------------- 正式曲线准入规则 --------------------------- */

/**
 * 进入正式曲线的条件：
 * - 无问题的测点自动进入；
 * - 有问题的测点必须复核「采纳」且写明原因，且累计位移不缺测。
 */
export function isFormalPoint(r: Reading): boolean {
  if (r.issues.length === 0) return !isMissing(r.cumulative);
  return r.review === "accepted" && r.reviewReason.trim().length > 0 && !isMissing(r.cumulative);
}

export function formalReadings(survey: Survey): Reading[] {
  return survey.readings.filter(isFormalPoint);
}

export function pendingCount(survey: Survey): number {
  return survey.readings.filter((r) => r.review === "pending").length;
}

/* ----------------------------- 测次 / 孔状态 ----------------------------- */

export function baselineOf(hole: Borehole): Survey | null {
  return hole.surveys.find((s) => s.kind === "baseline") ?? null;
}

export function routineSurveys(hole: Borehole): Survey[] {
  return hole.surveys.filter((s) => s.kind === "routine");
}

export function latestRoutine(hole: Borehole): Survey | null {
  const list = routineSurveys(hole);
  return list.length ? list.reduce((a, b) => (a.date >= b.date ? a : b)) : null;
}

function worse(a: PointStatus, b: PointStatus): PointStatus {
  const rank: Record<PointStatus, number> = { stable: 0, watch: 1, alert: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function statusOf(delta: number, rate: number | null, t: Thresholds): PointStatus {
  let s: PointStatus = "stable";
  if (Math.abs(delta) >= t.watchMm) s = "watch";
  if (Math.abs(delta) >= t.alertMm) s = "alert";
  if (rate !== null) {
    if (Math.abs(rate) >= t.rateWatch) s = worse(s, "watch");
    if (Math.abs(rate) >= t.rateAlert) s = worse(s, "alert");
  }
  return s;
}

export interface PointAssessment {
  depth: number;
  cumulative: number;
  baseline: number;
  previous: number | null;
  delta: number;
  rate: number | null;
  status: PointStatus;
  reasons: string[];
}

/**
 * 对最近一次复测逐点判定稳定 / 关注 / 预警。
 * 对照基准（位移）与上次复测（速率），基准点缺失或非准入时跳过该点。
 */
export function assessSurvey(
  latest: Survey,
  prev: Survey | null,
  baseline: Survey,
  t: Thresholds
): PointAssessment[] {
  const out: PointAssessment[] = [];
  for (const r of latest.readings) {
    if (!isFormalPoint(r) || isMissing(r.cumulative)) continue;
    const b = baseline.readings.find((x) => x.depth === r.depth);
    if (!b || !isFormalPoint(b) || isMissing(b.cumulative)) continue;
    const cumulative = r.cumulative as number;
    const baseVal = b.cumulative as number;
    const delta = cumulative - baseVal;

    const p = prev ? prev.readings.find((x) => x.depth === r.depth) : null;
    let previous: number | null = null;
    let rate: number | null = null;
    if (p && isFormalPoint(p) && !isMissing(p.cumulative)) {
      previous = p.cumulative as number;
      rate = (cumulative - previous) / daysBetween(prev!.date, latest.date);
    }

    const reasons: string[] = [];
    const status = statusOf(delta, rate, t);
    if (Math.abs(delta) >= t.alertMm) reasons.push(`位移 ${fmtMm(delta)} mm ≥ 预警 ${t.alertMm} mm`);
    else if (Math.abs(delta) >= t.watchMm) reasons.push(`位移 ${fmtMm(delta)} mm ≥ 关注 ${t.watchMm} mm`);
    if (rate !== null) {
      if (Math.abs(rate) >= t.rateAlert)
        reasons.push(`速率 ${rate.toFixed(2)} mm/d ≥ 预警 ${t.rateAlert} mm/d`);
      else if (Math.abs(rate) >= t.rateWatch)
        reasons.push(`速率 ${rate.toFixed(2)} mm/d ≥ 关注 ${t.rateWatch} mm/d`);
    }
    if (reasons.length === 0) reasons.push("位移与速率均在限值内");
    out.push({ depth: r.depth, cumulative, baseline: baseVal, previous, delta, rate, status, reasons });
  }
  return out;
}

export interface HoleAssessment {
  status: HoleStatus;
  latest: Survey | null;
  previous: Survey | null;
  points: PointAssessment[];
  pending: number;
}

export function assessHole(hole: Borehole): HoleAssessment {
  const baseline = baselineOf(hole);
  const latest = latestRoutine(hole);
  const pending = hole.surveys.reduce((n, s) => n + pendingCount(s), 0);
  if (!baseline) return { status: "idle", latest: null, previous: null, points: [], pending };
  if (!latest) return { status: "baseline", latest: null, previous: null, points: [], pending };

  const sorted = routineSurveys(hole).sort((a, b) => a.date.localeCompare(b.date));
  const idx = sorted.findIndex((s) => s.id === latest.id);
  const previous = idx > 0 ? sorted[idx - 1] : null;
  const points = assessSurvey(latest, previous, baseline, hole.thresholds);
  const status = points.length
    ? points.reduce((m, p) => worse(m, p.status), "stable" as PointStatus)
    : "stable";
  return { status, latest, previous, points, pending };
}

/* ------------------------------- 曲线数据 ------------------------------- */

export interface CurvePoint {
  depth: number;
  /** 距基准位移（mm），无基准对照时为原始累计位移 */
  value: number;
}

export function surveyCurve(survey: Survey, baseline: Survey | null): CurvePoint[] {
  return survey.readings
    .filter(isFormalPoint)
    .map((r) => {
      const b = baseline ? baseline.readings.find((x) => x.depth === r.depth) : null;
      const raw = r.cumulative as number;
      const value =
        b && isFormalPoint(b) && !isMissing(b.cumulative) ? raw - (b.cumulative as number) : raw;
      return { depth: r.depth, value };
    });
}

/* ------------------------------- 初始数据 ------------------------------- */

export function emptyReading(depth: number): Reading {
  return {
    id: uid("rd"),
    depth,
    forward: null,
    reverse: null,
    cumulative: null,
    issues: [{ type: "missing", message: "正、反行程读数均缺测" }],
    review: "pending",
    reviewReason: "",
    reviewedAt: null,
  };
}

export function createEmptySurvey(
  kind: Survey["kind"],
  date: string,
  totalDepth: number,
  spacing: number
): Survey {
  return {
    id: uid("sv"),
    kind,
    date,
    note: "",
    readings: expectedDepths(totalDepth, spacing).map(emptyReading),
  };
}

export function createBorehole(code: string, location: string, totalDepth: number, spacing: number): Borehole {
  return {
    id: uid("hole"),
    code,
    location,
    totalDepth,
    spacing,
    thresholds: { ...DEFAULT_THRESHOLDS },
    surveys: [],
    createdAt: new Date().toISOString(),
  };
}

export function findHole(data: AppData, id: string | null): Borehole | null {
  return data.boreholes.find((h) => h.id === id) ?? null;
}
