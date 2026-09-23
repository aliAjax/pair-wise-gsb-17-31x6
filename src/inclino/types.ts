// 测斜观测台领域模型
// 数据结构只描述现场记录，不包含任何校验/显示逻辑。

/** 钻孔（测斜孔）配置：先设基准时一并确定的孔深、间距与判定阈值 */
export interface HoleConfig {
  id: string;
  /** 孔号，如 CX-08 */
  name: string;
  /** 孔位描述 */
  location: string;
  /** 孔深 m */
  depth: number;
  /** 测点间距 m，常规 0.5m */
  interval: number;
  /** 正反行程允许偏差 mm：|正行程读数 + 反行程读数| 限值 */
  tolerance: number;
  /** 累计位移关注阈值 mm */
  watchTotal: number;
  /** 累计位移预警阈值 mm */
  warnTotal: number;
  /** 变化速率关注阈值 mm/d */
  watchRate: number;
  /** 变化速率预警阈值 mm/d */
  warnRate: number;
}

/** 单一测点的现场读数（字符串保留誊抄原样，换算由数据层处理） */
export interface Reading {
  /** 测点深度 m，自孔口起算 */
  depth: number;
  /** 正行程（下放）读数 mm */
  forward: string;
  /** 反行程（提升、探头旋转180°）读数 mm */
  reverse: string;
  /** 纸表誊录的累计位移 mm */
  cumulative: string;
}

export type RoundKind = "baseline" | "observation";

export type IssueKind = "deviation" | "missing";
export type Resolution = "adopted" | "excluded";

/** 测点问题的复核处理结果；写明原因后才允许进入正式曲线 */
export interface Decision {
  /** 问题类别，决定该点能否被曲线采用 */
  kind: IssueKind;
  /** 系统给出的判异原因（处理时留痕） */
  reason: string;
  /** 现场写明的复核原因 */
  note: string;
  /** adopted=复核采用进入曲线；excluded=弃用该点 / 登记缺测 */
  resolution: Resolution;
  /** 处理日期 */
  decidedAt: string;
}

/** 一轮观测：基准观测或某次复测 */
export interface Round {
  id: string;
  kind: RoundKind;
  /** 观测日期 YYYY-MM-DD */
  date: string;
  operator: string;
  /** 按深度排列的全部测点读数 */
  readings: Reading[];
  /** 以测点深度为键的复核结论 */
  decisions: Record<string, Decision>;
}

export interface HoleData {
  config: HoleConfig;
  rounds: Round[];
}

export interface ProjectStore {
  holes: HoleData[];
  selectedId: string | null;
}
