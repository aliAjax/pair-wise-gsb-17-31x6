import { useMemo, useState } from "react";
import "./styles.css";
import { useBenchStore, useSelectedHole } from "./state/store";
import { assessHole } from "./domain/rules";
import { Sidebar } from "./components/Sidebar";
import { BaselineTab } from "./components/BaselineTab";
import { EntryTab } from "./components/EntryTab";
import { ReviewTab } from "./components/ReviewTab";
import { CurveTab } from "./components/CurveTab";

type TabKey = "baseline" | "entry" | "review" | "curve";

const TABS: { key: TabKey; label: string }[] = [
  { key: "baseline", label: "孔位基准" },
  { key: "entry", label: "观测录入" },
  { key: "review", label: "待复核区" },
  { key: "curve", label: "状态与曲线" },
];

function App() {
  const store = useBenchStore();
  const { data } = store;
  const { hole, assessment } = useSelectedHole(data);
  const [tab, setTab] = useState<TabKey>("curve");

  const metrics = useMemo(() => {
    const all = data.boreholes.map((h) => ({ h, a: assessHole(h) }));
    const pending = all.reduce((n, { a }) => n + a.pending, 0);
    const watch = all.filter(({ a }) => a.status === "watch").length;
    const alert = all.filter(({ a }) => a.status === "alert").length;
    return [
      { label: "测斜孔", value: String(all.length), cls: "status-ok" },
      { label: "待复核测点", value: String(pending), cls: pending > 0 ? "status-watch" : "status-ok" },
      { label: "关注孔", value: String(watch), cls: watch > 0 ? "status-watch" : "status-ok" },
      { label: "预警孔", value: String(alert), cls: alert > 0 ? "status-danger" : "status-ok" },
    ];
  }, [data]);

  const totalPending = hole ? hole.surveys.reduce((n, s) => n + s.readings.filter((r) => r.review === "pending").length, 0) : 0;

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-03 · 测斜观测台 · port 5103</p>
          <h1>岩土测斜现场观测台</h1>
          <p className="subtitle">
            每孔先设基准，再按深度录入正、反行程读数与累计位移；正反行程差异超限、缺测区间与相邻测点缺失自动分流到待复核区，
            写明原因后才进入正式曲线。复测对照基准与上次结果给出稳定、关注、预警提示。
          </p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>React + Vite + TypeScript + CSS</strong>
          <span>校验规则与界面分离 · 本地存储 · 无新增依赖</span>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={m.cls} />
          </article>
        ))}
      </section>

      <section className="workspace">
        <Sidebar
          data={data}
          selectedId={hole?.id ?? null}
          onSelect={store.selectHole}
          onAdd={store.addHole}
          onRestore={store.restoreDemo}
        />

        <section className="panel main-panel">
          <div className="tab-bar" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                className={`tab-btn${tab === t.key ? " active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {t.key === "review" && totalPending > 0 && <em className="tab-pending">{totalPending}</em>}
              </button>
            ))}
          </div>

          {!hole ? (
            <div className="notice-panel">
              <h2>还没有测斜孔</h2>
              <p>请在左侧建立第一个孔号并设置基准。</p>
            </div>
          ) : (
            <div key={hole.id} className="tab-content">
              {tab === "baseline" && (
                <BaselineTab hole={hole} onAddBaseline={(d) => {
                  store.addSurvey(hole.id, "baseline", d);
                  setTab("entry");
                }} onThresholds={(p) => store.updateThresholds(hole.id, p)} />
              )}
              {tab === "entry" && <EntryTab hole={hole} store={store} />}
              {tab === "review" && <ReviewTab hole={hole} store={store} />}
              {tab === "curve" && assessment && <CurveTab hole={hole} assessment={assessment} />}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
