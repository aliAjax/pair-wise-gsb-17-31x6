// 数据整理层：对观测数据的增改操作（纯函数，返回新状态）与 localStorage 持久化。
// 校验规则在 rules.ts、推算在 curves.ts，本文件只负责数据组织与存取。
import type {
  Decision,
  HoleConfig,
  HoleData,
  ProjectStore,
  Reading,
  Round,
} from "./types";
import { depthKey, depthSlots, round2 } from "./math";
import { seedHoles } from "./seed";

const STORAGE_KEY = "hxwl03-inclino-store-v1";

export const DEFAULT_CONFIG: Omit<
  HoleConfig,
  "id" | "name" | "location"
> = {
  depth: 20,
  interval: 0.5,
  tolerance: 1.5,
  watchTotal: 20,
  warnTotal: 30,
  watchRate: 2,
  warnRate: 3,
};

// ---------- 读取 / 保存 ----------

export function loadStore(): ProjectStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectStore;
      if (parsed && Array.isArray(parsed.holes)) {
        return {
          holes: parsed.holes.map(normalizeHole),
          selectedId:
            parsed.selectedId &&
            parsed.holes.some((h) => h.config.id === parsed.selectedId)
              ? parsed.selectedId
              : parsed.holes[0]?.config.id ?? null,
        };
      }
    }
  } catch {
    // 存储损坏时回退到示例数据
  }
  const holes = seedHoles();
  return { holes, selectedId: holes[0]?.config.id ?? null };
}

export function saveStore(store: ProjectStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 隐私模式等场景静默失败，不影响现场录入
  }
}

function normalizeHole(hole: HoleData): HoleData {
  return {
    config: { ...DEFAULT_CONFIG, ...hole.config },
    rounds: (hole.rounds ?? []).map((r) => ({
      ...r,
      readings: (r.readings ?? []).map((x) => ({
        depth: round2(Number(x.depth) || 0),
        forward: String(x.forward ?? ""),
        reverse: String(x.reverse ?? ""),
        cumulative: String(x.cumulative ?? ""),
      })),
      decisions: r.decisions ?? {},
    })),
  };
}

// ---------- 纯操作：全部返回新的 store ----------

export function selectHole(store: ProjectStore, id: string): ProjectStore {
  return { ...store, selectedId: id };
}

export function getHole(store: ProjectStore, id: string | null): HoleData | null {
  return store.holes.find((h) => h.config.id === id) ?? null;
}

export function updateConfig(
  store: ProjectStore,
  id: string,
  patch: Partial<HoleConfig>
): ProjectStore {
  return {
    ...store,
    holes: store.holes.map((h) =>
      h.config.id === id ? { ...h, config: { ...h.config, ...patch } } : h
    ),
  };
}

export function addHole(store: ProjectStore, config: HoleConfig): ProjectStore {
  const hole: HoleData = {
    config,
    rounds: [],
  };
  return {
    ...store,
    holes: [...store.holes, hole],
    selectedId: config.id,
  };
}

/** 新增一轮观测：基准或复测，按孔深/间距预排全部空测点 */
export function addRound(
  store: ProjectStore,
  holeId: string,
  kind: Round["kind"],
  date: string,
  operator: string
): { store: ProjectStore; roundId: string } {
  const roundId = `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const round: Round = {
    id: roundId,
    kind,
    date,
    operator,
    readings: [],
    decisions: {},
  };
  const next: ProjectStore = {
    ...store,
    holes: store.holes.map((h) => {
      if (h.config.id !== holeId) return h;
      const slots = depthSlots(h.config.depth, h.config.interval);
      round.readings = slots.map((depth) => ({
        depth,
        forward: "",
        reverse: "",
        cumulative: "",
      }));
      return { ...h, rounds: [...h.rounds, round] };
    }),
  };
  return { store: next, roundId };
}

export function updateRoundMeta(
  store: ProjectStore,
  holeId: string,
  roundId: string,
  patch: Partial<Pick<Round, "date" | "operator">>
): ProjectStore {
  return mapRound(store, holeId, roundId, (r) => ({ ...r, ...patch }));
}

/** 录入某测点的正、反行程读数或纸表累计位移 */
export function setReadingField(
  store: ProjectStore,
  holeId: string,
  roundId: string,
  depth: number,
  field: keyof Omit<Reading, "depth">,
  value: string
): ProjectStore {
  return mapRound(store, holeId, roundId, (round, config) => {
    const readings = ensureReadings(round, config);
    return {
      ...round,
      readings: readings.map((r) =>
        round2(r.depth) === round2(depth) ? { ...r, [field]: value } : r
      ),
    };
  });
}

/** 一键誊填：把按基准推算的正式累计位移写入纸表累计位移列 */
export function fillCumulative(
  store: ProjectStore,
  holeId: string,
  roundId: string,
  series: Record<string, number | null>
): ProjectStore {
  return mapRound(store, holeId, roundId, (round) => ({
    ...round,
    readings: round.readings.map((r) => {
      const v = series[depthKey(r.depth)];
      return v === null || v === undefined
        ? r
        : { ...r, cumulative: v.toFixed(2) };
    }),
  }));
}

/** 写入复核结论（必须写明原因），进入或退出正式曲线 */
export function setDecision(
  store: ProjectStore,
  holeId: string,
  roundId: string,
  depth: number,
  decision: Omit<Decision, "decidedAt">
): ProjectStore {
  return mapRound(store, holeId, roundId, (round) => ({
    ...round,
    decisions: {
      ...round.decisions,
      [depthKey(depth)]: { ...decision, decidedAt: new Date().toISOString().slice(0, 10) },
    },
  }));
}

/** 撤回复核结论，测点退回待复核区 */
export function clearDecision(
  store: ProjectStore,
  holeId: string,
  roundId: string,
  depth: number
): ProjectStore {
  return mapRound(store, holeId, roundId, (round) => {
    const decisions = { ...round.decisions };
    delete decisions[depthKey(depth)];
    return { ...round, decisions };
  });
}

// ---------- 内部工具 ----------

function mapRound(
  store: ProjectStore,
  holeId: string,
  roundId: string,
  fn: (round: Round, config: HoleConfig) => Round
): ProjectStore {
  return {
    ...store,
    holes: store.holes.map((h) => {
      if (h.config.id !== holeId) return h;
      return {
        ...h,
        rounds: h.rounds.map((r) => (r.id === roundId ? fn(r, h.config) : r)),
      };
    }),
  };
}

function ensureReadings(round: Round, config: HoleConfig): Reading[] {
  if (round.readings.length > 0) return round.readings;
  return depthSlots(config.depth, config.interval).map((depth) => ({
    depth,
    forward: "",
    reverse: "",
    cumulative: "",
  }));
}
