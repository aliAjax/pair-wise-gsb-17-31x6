import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type { HoleConfig, ProjectStore } from "./inclino/types";
import {
  addHole,
  addRound,
  fillCumulative,
  getHole,
  loadStore,
  saveStore,
  selectHole,
  clearDecision,
  setDecision,
  setReadingField,
  updateConfig,
  updateRoundMeta,
} from "./inclino/store";
import { baselineReady, pendingIssues } from "./inclino/rules";
import { assessRound } from "./inclino/curves";
import Sidebar from "./components/Sidebar";
import RoundWorkspace from "./components/RoundWorkspace";
import NewHoleDialog from "./components/NewHoleDialog";
import { fmt } from "./inclino/math";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "stable" | "watch" | "warn" | "neutral";
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <em className="metric-sub">{sub}</em>}
      <i className={`metric-bar ${tone}`} />
    </article>
  );
}

function App() {
  const [store, setStore] = useState<ProjectStore>(() => loadStore());
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    saveStore(store);
  }, [store]);

  const hole = getHole(store, store.selectedId);

  const overview = useMemo(() => {
    let pendingTotal = 0;
    let watchHoles = 0;
    let warnHoles = 0;
    let worst: { name: string; value: number; depth: number } | null = null;
    for (const h of store.holes) {
      for (const r of h.rounds) pendingTotal += pendingIssues(h.config, r).length;
      const latest = [...h.rounds]
        .filter((r) => r.kind === "observation")
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
      if (latest && baselineReady(h.config, h.rounds)) {
        const a = assessRound(h.config, h.rounds, latest);
        if (a.status === "warn") warnHoles += 1;
        else if (a.status === "watch") watchHoles += 1;
        if (
          a.maxDepth !== null &&
          (!worst || Math.abs(a.maxCumulative) > Math.abs(worst.value))
        ) {
          worst = { name: h.config.name, value: a.maxCumulative, depth: a.maxDepth };
        }
      }
    }
    return { pendingTotal, watchHoles, warnHoles, worst };
  }, [store]);

  const latestAssessment = useMemo(() => {
    if (!hole) return null;
    const latest = [...hole.rounds]
      .filter((r) => r.kind === "observation")
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
    if (!latest) return null;
    return assessRound(hole.config, hole.rounds, latest);
  }, [hole]);

  const createHole = (config: HoleConfig) => {
    setStore((s) => addHole(s, config));
    setShowNew(false);
  };

  const newRound = (kind: "baseline" | "observation") => {
    if (!hole) return;
    const { store: next } = addRound(
      store,
      hole.config.id,
      kind,
      today(),
      ""
    );
    setStore(next);
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-03 · 岩土监测 · port 5103</p>
          <h1>测斜观测台</h1>
          <p className="subtitle">
            每孔先设基准，按深度录入正、反行程读数与累计位移；
            正反偏差超限或缺少相邻测点先入待复核区，写明原因后才进入正式曲线；
            复测对照基准与上次结果给出稳定、关注、预警。
          </p>
        </div>
        <div className="stack-card">
          <span>技术栈 / 数据边界</span>
          <strong>React + Vite + TypeScript</strong>
          <span>
            数据整理 · 校验规则 · 界面三层分离；localStorage 本地留存，零新增依赖
          </span>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard
          label="观测孔数"
          value={String(store.holes.length)}
          sub={`基准已设 ${store.holes.filter((h) => baselineReady(h.config, h.rounds)).length} 孔`}
          tone="neutral"
        />
        <MetricCard
          label="关注 / 预警孔"
          value={`${overview.watchHoles} / ${overview.warnHoles}`}
          sub="按各孔最近一次复测"
          tone={overview.warnHoles > 0 ? "warn" : overview.watchHoles > 0 ? "watch" : "stable"}
        />
        <MetricCard
          label="本孔最大累计位移"
          value={latestAssessment ? `${fmt(latestAssessment.maxCumulative)} mm` : "—"}
          sub={
            latestAssessment && latestAssessment.maxDepth !== null
              ? `${hole?.config.name} · ${latestAssessment.maxDepth.toFixed(1)}m 处`
              : hole ? "尚无复测" : ""
          }
          tone={
            latestAssessment?.status === "warn"
              ? "warn"
              : latestAssessment?.status === "watch"
                ? "watch"
                : "stable"
          }
        />
        <MetricCard
          label="待复核测点"
          value={String(overview.pendingTotal)}
          sub={overview.pendingTotal > 0 ? "写明原因后进入正式曲线" : "全部处理完毕"}
          tone={overview.pendingTotal > 0 ? "watch" : "stable"}
        />
      </section>

      <section className="workspace">
        <Sidebar
          store={store}
          onSelect={(id) => setStore((s) => selectHole(s, id))}
          onAdd={() => setShowNew(true)}
        />
        {hole ? (
          <RoundWorkspace
            key={hole.config.id}
            hole={hole}
            onConfigSave={(patch) =>
              setStore((s) => updateConfig(s, hole.config.id, patch))
            }
            onAddBaseline={() => newRound("baseline")}
            onAddObservation={() => newRound("observation")}
            onEditReading={(roundId, depth, field, value) =>
              setStore((s) =>
                setReadingField(s, hole.config.id, roundId, depth, field, value)
              )
            }
            onFillCumulative={(roundId, series) =>
              setStore((s) => fillCumulative(s, hole.config.id, roundId, series))
            }
            onResolve={(roundId, depth, decision) =>
              setStore((s) => setDecision(s, hole.config.id, roundId, depth, decision))
            }
            onRevoke={(roundId, depth) =>
              setStore((s) => clearDecision(s, hole.config.id, roundId, depth))
            }
            onRoundMeta={(roundId, patch) =>
              setStore((s) => updateRoundMeta(s, hole.config.id, roundId, patch))
            }
          />
        ) : (
          <section className="panel empty-baseline">
            <p className="eyebrow">建档</p>
            <h2>还没有测斜孔</h2>
            <div className="empty-actions">
              <button className="primary-action" onClick={() => setShowNew(true)}>
                新增第一个测斜孔
              </button>
            </div>
          </section>
        )}
      </section>

      {showNew && (
        <NewHoleDialog
          existing={store.holes.map((h) => h.config.name)}
          onCreate={createHole}
          onCancel={() => setShowNew(false)}
        />
      )}
    </main>
  );
}

export default App;
