// 测斜观测台领域模型：孔 / 测次 / 测点三层结构

export type IssueType = "sum" | "missing" | "gap";

/** 测点校验问题（纯规则计算产生，见 rules.ts） */
export interface ReadIssue {
  type: IssueType;
  message: string;
}

/** none=无需复核；pending=待复核；accepted/rejected=已写明处理意见 */
export type ReviewState = "none" | "pending" | "accepted" | "rejected";

export interface Reading {
  id: string;
  /** 测点深度（自孔口向下，m） */
  depth: number;
  /** 正行程读数，缺测为 null */
  forward: number | null;
  /** 反行程读数，缺测为 null */
  reverse: number | null;
  /** 累计位移（mm，现场计算/录入），缺测为 null */
  cumulative: number | null;
  issues: ReadIssue[];
  review: ReviewState;
  reviewReason: string;
  reviewedAt: string | null;
}

export type SurveyKind = "baseline" | "routine";

export interface Survey {
  id: string;
  kind: SurveyKind;
  /** 观测日期 YYYY-MM-DD */
  date: string;
  note: string;
  readings: Reading[];
}

/** 现场可调整的校验与预警阈值 */
export interface Thresholds {
  /** 正反行程之和相对典型值的容许偏差（读数单位） */
  sumTol: number;
  /** 较基准累计位移关注值（mm） */
  watchMm: number;
  /** 较基准累计位移预警值（mm） */
  alertMm: number;
  /** 位移速率关注值（mm/d） */
  rateWatch: number;
  /** 位移速率预警值（mm/d） */
  rateAlert: number;
}

export interface Borehole {
  id: string;
  /** 孔号，如 CX-01 */
  code: string;
  location: string;
  totalDepth: number;
  spacing: number;
  thresholds: Thresholds;
  /** surveys[0] 概念上为基准测次，其余为复测 */
  surveys: Survey[];
  createdAt: string;
}

export interface AppData {
  version: 1;
  boreholes: Borehole[];
  selectedId: string | null;
}

export type PointStatus = "stable" | "watch" | "alert";
/** idle=未设基准；baseline=仅有基准；其余为最近复测判定 */
export type HoleStatus = "idle" | "baseline" | PointStatus;
