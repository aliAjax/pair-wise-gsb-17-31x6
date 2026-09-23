import type { Borehole, Reading, Survey, SurveyKind } from "./types";
import { applyEvaluation, expectedDepths, uid, DEFAULT_THRESHOLDS } from "./rules";

/**
 * 演示数据（确定性伪随机，无需后端）。
 * 构造了正反行程差异超限、缺测区间（含相邻测点标记）等现场常见情形，
 * 并预置了部分复核结论，便于直接看到待复核区与正式曲线的分流效果。
 */

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GenOpts {
  /** 深度 → 篡改：sum=正反和差异超限；miss=缺测 */
  tamper?: Record<number, "sum" | "miss">;
  /** 深度 → 累计位移基线（mm） */
  base?: (depth: number) => number;
  /** 整体位移偏移（mm，随深度线性放大） */
  shift?: number;
  /** 读数噪声种子 */
  seed: number;
}

function genReadings(
  totalDepth: number,
  spacing: number,
  { tamper = {}, base = () => 0, shift = 0, seed }: GenOpts
): Reading[] {
  const rnd = mulberry(seed);
  return expectedDepths(totalDepth, spacing).map((depth) => {
    let forward: number | null = +(8 + rnd() * 1.4 - 0.7).toFixed(1);
    let reverse: number | null = +(-8 + rnd() * 1.4 - 0.7).toFixed(1);
    if (tamper[depth] === "sum") {
      forward = +(forward + 6).toFixed(1); // 正行程异常 → 正反和超限
    }
    if (tamper[depth] === "miss") {
      forward = null;
      reverse = null;
    }
    const cumulative =
      forward === null || reverse === null
        ? null
        : +(base(depth) + shift * (depth / totalDepth) + (rnd() * 0.6 - 0.3)).toFixed(1);
    return {
      id: uid("rd"),
      depth,
      forward,
      reverse,
      cumulative,
      issues: [],
      review: "none",
      reviewReason: "",
      reviewedAt: null,
    };
  });
}

function makeSurvey(
  kind: SurveyKind,
  date: string,
  note: string,
  totalDepth: number,
  spacing: number,
  opts: GenOpts
): Survey {
  const raw: Survey = {
    id: uid("sv"),
    kind,
    date,
    note,
    readings: genReadings(totalDepth, spacing, opts),
  };
  return applyEvaluation(raw, DEFAULT_THRESHOLDS.sumTol);
}

/** 对指定深度的测点预置复核结论 */
function decide(survey: Survey, decisions: Record<number, { review: Reading["review"]; reason: string }>): Survey {
  const when = "2026-09-22T16:40:00.000Z";
  return {
    ...survey,
    readings: survey.readings.map((r) => {
      const d = decisions[r.depth];
      if (!d) return r;
      return { ...r, review: d.review, reviewReason: d.reason, reviewedAt: when };
    }),
  };
}

function holes(): Borehole[] {
  /* CX-01：完整历史；最近复测含 1 处正反差异超限待复核、1 处缺测区间已处理；位移预警 */
  const td1 = 20;
  const sp1 = 2;
  const cx01Base = makeSurvey("baseline", "2026-09-01", "初值观测，双程稳定", td1, sp1, { seed: 101 });
  const cx01R1 = decide(
    makeSurvey(
      "routine",
      "2026-09-08",
      "第一周复测；8m 处探头卡顿，12m 电缆接头故障缺测",
      td1,
      sp1,
      { seed: 201, shift: 6, tamper: { 8: "sum", 12: "miss" } }
    ),
    {
      8: { review: "rejected", reason: "复测确认探头滑轮卡滞，该点作废，按插值参考不入曲线" },
      10: { review: "accepted", reason: "相邻 12m 缺测，提升重测确认读数可靠，保留使用" },
      14: { review: "accepted", reason: "相邻 12m 缺测，复测一致，保留使用" },
    }
  );
  const cx01R2 = makeSurvey(
    "routine",
    "2026-09-15",
    "第二周复测，测管恢复正常",
    td1,
    sp1,
    { seed: 301, shift: 14 }
  );
  const cx01R3 = makeSurvey(
    "routine",
    "2026-09-22",
    "第三周复测；10m 正反差异超限待复核",
    td1,
    sp1,
    { seed: 401, shift: 33, tamper: { 10: "sum" } }
  );

  /* CX-02：仅有基准 + 一次复测，小幅位移，稳定 */
  const td2 = 24;
  const sp2 = 2;
  const cx02Base = makeSurvey("baseline", "2026-09-05", "初值观测", td2, sp2, { seed: 501 });
  const cx02R1 = makeSurvey(
    "routine",
    "2026-09-20",
    "雨后复测，变化正常",
    td2,
    sp2,
    { seed: 601, shift: 4 }
  );

  /* CX-03：只有基准，尚无复测 */
  const cx03Base = makeSurvey("baseline", "2026-09-18", "初值观测，待首次复测", 16, 2, {
    seed: 701,
  });

  /* CX-04：新孔，尚未建立基准 */
  const cx04: Borehole = {
    id: uid("hole"),
    code: "CX-04",
    location: "基坑北侧中段",
    totalDepth: 18,
    spacing: 2,
    thresholds: { ...DEFAULT_THRESHOLDS },
    surveys: [],
    createdAt: "2026-09-23T02:00:00.000Z",
  };

  return [
    {
      id: uid("hole"),
      code: "CX-01",
      location: "基坑西侧阳角",
      totalDepth: td1,
      spacing: sp1,
      thresholds: { ...DEFAULT_THRESHOLDS },
      surveys: [cx01Base, cx01R1, cx01R2, cx01R3],
      createdAt: "2026-09-01T02:00:00.000Z",
    },
    {
      id: uid("hole"),
      code: "CX-02",
      location: "基坑南侧支撑轴",
      totalDepth: td2,
      spacing: sp2,
      thresholds: { ...DEFAULT_THRESHOLDS },
      surveys: [cx02Base, cx02R1],
      createdAt: "2026-09-05T02:00:00.000Z",
    },
    {
      id: uid("hole"),
      code: "CX-03",
      location: "基坑东侧坡顶",
      totalDepth: 16,
      spacing: 2,
      thresholds: { ...DEFAULT_THRESHOLDS },
      surveys: [cx03Base],
      createdAt: "2026-09-18T02:00:00.000Z",
    },
    cx04,
  ];
}

export function seedData(): Borehole[] {
  return holes();
}
