// 示例数据：演示基准、复测、待复核（正反偏差超限 / 缺测 / 区间中断）与稳定-关注-预警全流程。
// 读数合成规则与规则层一致：正 = 倾斜 + 零偏 + 抖动，反 = -倾斜 + 零偏 - 抖动。
import type {
  Decision,
  HoleData,
  Reading,
  Round,
  RoundKind,
} from "./types";
import { buildCurve } from "./curves";
import { depthKey, depthSlots, round2 } from "./math";

interface Tamper {
  round: number; // 0=基准 1/2/3=复测
  depth: number;
  type: "deviation" | "missing";
  decision?: Pick<Decision, "resolution" | "note">;
}

interface SeedSpec {
  id: string;
  name: string;
  location: string;
  depth: number;
  tolerance: number;
  watchTotal: number;
  warnTotal: number;
  watchRate: number;
  warnRate: number;
  baselineDate: string;
  dates: string[];
  operator: string;
  // 合成参数
  tiltAmp: number;
  tiltK: number;
  extraTop: (round: number) => number;
  biasBase: number;
  biasAmp: number;
  tamps: Tamper[];
  /** 哪几轮的纸表累计位移已誊录（演示自动推算一致） */
  prefilledCumulative: number[];
}

function pseudoNoise(seed: number): number {
  // 确定性伪随机，避免每次刷新示例都变
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.08;
}

function makeRound(
  spec: SeedSpec,
  kind: RoundKind,
  roundNo: number,
  date: string
): Round {
  const slots = depthSlots(spec.depth, 0.5);
  const extraTop = kind === "baseline" ? 0 : spec.extraTop(roundNo);
  const readings: Reading[] = slots.map((depth, i) => {
    const u = depth / spec.depth; // 0=孔口 1=孔底
    // 基岩方向的自然倾斜（孔底趋于 0）；额外位移自孔口向下线性衰减
    const tilt =
      spec.tiltAmp * Math.pow(1 - u, spec.tiltK) + extraTop * (1 - u) * 0.55;
    const bias = spec.biasBase + spec.biasAmp * Math.pow(1 - u, 1.6);
    const noise = pseudoNoise(spec.id.charCodeAt(3) * 100 + roundNo * 37 + i);

    const tamper = spec.tamps.find(
      (t) => t.round === roundNo && round2(t.depth) === round2(depth)
    );

    if (tamper?.type === "missing") {
      // 只抄到正行程，反行程缺项
      return { depth, forward: (tilt + bias + noise).toFixed(2), reverse: "", cumulative: "" };
    }

    let f = tilt + bias + noise;
    let b = -tilt + bias - noise;
    if (tamper?.type === "deviation") {
      // 正行程多记了数，正+反远超允差
      f += spec.tolerance * 4.2;
    }
    return {
      depth,
      forward: f.toFixed(2),
      reverse: b.toFixed(2),
      cumulative: "",
    };
  });

  const round: Round = {
    id: `${spec.id}-r${roundNo}`,
    kind,
    date,
    operator: spec.operator,
    readings,
    decisions: {},
  };

  // 已写明原因的复核结论
  for (const t of spec.tamps) {
    if (t.round === roundNo && t.decision) {
      const issueKind = t.type;
      round.decisions[depthKey(t.depth)] = {
        kind: issueKind,
        reason:
          issueKind === "deviation"
            ? "正反行程偏差超限，待现场确认"
            : "缺少相邻测点，待现场确认",
        note: t.decision.note,
        resolution: t.decision.resolution,
        decidedAt: date,
      };
    }
  }

  return round;
}

function build(spec: SeedSpec): HoleData {
  const rounds: Round[] = [];
  const baseline = makeRound(spec, "baseline", 0, spec.baselineDate);
  rounds.push(baseline);
  spec.dates.forEach((date, i) => {
    rounds.push(makeRound(spec, "observation", i + 1, date));
  });

  const config: HoleData["config"] = {
    id: spec.id,
    name: spec.name,
    location: spec.location,
    depth: spec.depth,
    interval: 0.5,
    tolerance: spec.tolerance,
    watchTotal: spec.watchTotal,
    warnTotal: spec.warnTotal,
    watchRate: spec.watchRate,
    warnRate: spec.warnRate,
  };

  // 按正式曲线誊录纸表累计位移（验证自动推算与手算一致）
  for (const no of spec.prefilledCumulative) {
    const round = rounds[no];
    if (!round) continue;
    const series = buildCurve(config, baseline, round);
    for (const p of series) {
      const r = round.readings.find((x) => round2(x.depth) === round2(p.depth));
      if (r && p.cumulative !== null) r.cumulative = p.cumulative.toFixed(2);
    }
  }

  return { config, rounds };
}

const specs: SeedSpec[] = [
  {
    id: "cx08",
    name: "CX-08",
    location: "基坑北侧 桩顶冠梁后 2m",
    depth: 18,
    tolerance: 1.5,
    watchTotal: 20,
    warnTotal: 30,
    watchRate: 2,
    warnRate: 3,
    baselineDate: "2026-09-05",
    dates: ["2026-09-12", "2026-09-19", "2026-09-23"],
    operator: "李岩",
    tiltAmp: 0.35,
    tiltK: 1.4,
    extraTop: (r) => [0, 1.4, 2.4, 3.5][r] ?? 0,
    biasBase: 0.62,
    biasAmp: 0.08,
    prefilledCumulative: [1],
    tamps: [
      {
        round: 1,
        depth: 14,
        type: "deviation",
        decision: {
          resolution: "adopted",
          note: "已重测，原读数因电缆记号错位，重测正反差在允差内，采用重测值",
        },
      },
      { round: 2, depth: 0.5, type: "deviation" },
      {
        round: 3,
        depth: 0.5,
        type: "deviation",
        decision: {
          resolution: "excluded",
          note: "孔口管处探头碰撞受阻，读数无效，按缺测弃用，下次观测前检查孔口导管",
        },
      },
    ],
  },
  {
    id: "cx11",
    name: "CX-11",
    location: "基坑东侧 阳角位置",
    depth: 21,
    tolerance: 2,
    watchTotal: 25,
    warnTotal: 35,
    watchRate: 2,
    warnRate: 3,
    baselineDate: "2026-09-08",
    dates: ["2026-09-15", "2026-09-23"],
    operator: "王工",
    tiltAmp: 0.5,
    tiltK: 1.2,
    extraTop: (r) => [0, 0.3, 0.55][r] ?? 0,
    biasBase: 0.8,
    biasAmp: 0.18,
    prefilledCumulative: [],
    tamps: [
      {
        round: 2,
        depth: 2,
        type: "missing",
      },
    ],
  },
  {
    id: "cx16",
    name: "CX-16",
    location: "基坑南侧 邻近管线",
    depth: 15,
    tolerance: 1.5,
    watchTotal: 20,
    warnTotal: 30,
    watchRate: 2,
    warnRate: 3,
    baselineDate: "2026-09-23",
    dates: [],
    operator: "赵磊",
    tiltAmp: 0.25,
    tiltK: 1.6,
    extraTop: () => 0,
    biasBase: 0.55,
    biasAmp: 0.1,
    prefilledCumulative: [],
    tamps: [],
  },
];

export function seedHoles(): HoleData[] {
  // CX-16 尚未完成基准观测，只保留配置（由界面引导“先设基准”）
  return [build(specs[0]), build(specs[1]), { config: cfgOf(specs[2]), rounds: [] }];
}

function cfgOf(spec: SeedSpec): HoleData["config"] {
  return {
    id: spec.id,
    name: spec.name,
    location: spec.location,
    depth: spec.depth,
    interval: 0.5,
    tolerance: spec.tolerance,
    watchTotal: spec.watchTotal,
    warnTotal: spec.warnTotal,
    watchRate: spec.watchRate,
    warnRate: spec.warnRate,
  };
}
