// 单孔工作区：轮次页签 + 基准引导 + 录入表 + 待复核区 + 正式曲线。
import { useEffect, useMemo, useState } from "react";
import type { Decision, HoleData } from "../inclino/types";
import { baselineReady, pendingIssues } from "../inclino/rules";
import { cumulativeSeries } from "../inclino/curves";
import ReadingTable from "./ReadingTable";
import ReviewQueue from "./ReviewQueue";
import StatusBanner from "./StatusBanner";
import CurveChart from "./CurveChart";
import HoleSetup from "./HoleSetup";

interface Props {
  hole: HoleData;
  onConfigSave: (patch: Partial<HoleData["config"]>) => void;
  onAddBaseline: () => void;
  onAddObservation: () => void;
  onEditReading: (
    roundId: string,
    depth: number,
    field: "forward" | "reverse" | "cumulative",
    value: string
  ) => void;
  onFillCumulative: (roundId: string, series: Record<string, number | null>) => void;
  onResolve: (roundId: string, depth: number, decision: Omit<Decision, "decidedAt">) => void;
  onRevoke: (roundId: string, depth: number) => void;
  onRoundMeta: (roundId: string, patch: { date?: string; operator?: string }) => void;
}

type Tab = "entry" | "review" | "curve";

export default function RoundWorkspace(props: Props) {
  const { hole } = props;
  const baselineRound = hole.rounds.find((r) => r.kind === "baseline") ?? null;
  const baselineUsable = baselineReady(hole.config, hole.rounds);
  const [roundId, setRoundId] = useState<string | null>(
    hole.rounds[hole.rounds.length - 1]?.id ?? null
  );
  const [tab, setTab] = useState<Tab>("entry");
  const [showSetup, setShowSetup] = useState(false);

  const ordered = useMemo(
    () =>
      [...hole.rounds].sort((a, b) =>
        a.date === b.date
          ? a.id < b.id
            ? -1
            : 1
          : a.date < b.date
            ? -1
            : 1
      ),
    [hole.rounds]
  );

  // 新增基准/复测后自动切到最新一轮（孔切换时组件以 key 重新挂载）
  const lastRoundId = hole.rounds[hole.rounds.length - 1]?.id ?? null;
  useEffect(() => {
    if (lastRoundId) setRoundId(lastRoundId);
  }, [lastRoundId]);

  const activeRound = hole.rounds.find((r) => r.id === roundId) ?? null;

  if (showSetup) {
    return (
      <section className="panel">
        <div className="section-heading">
          <div>
            <p>每孔先设基准</p>
            <h2>{hole.config.name} 基准参数</h2>
          </div>
        </div>
        <HoleSetup
          config={hole.config}
          onSave={props.onConfigSave}
          onClose={() => setShowSetup(false)}
        />
      </section>
    );
  }

  if (!activeRound) {
    return (
      <section className="panel empty-baseline">
        <p className="eyebrow">每孔先设基准</p>
        <h2>{hole.config.name} 尚未建立基准观测</h2>
        <p className="subtitle">
          先确认孔深、测点间距与正反行程允差，再录入一轮基准观测；
          复测的累计位移与稳定/关注/预警判定全部对照该基准。
        </p>
        <div className="empty-actions">
          <button className="ghost" onClick={() => setShowSetup(true)}>
            修改基准参数（孔深 {hole.config.depth}m / 间距 {hole.config.interval}m）
          </button>
          <button className="primary-action" onClick={props.onAddBaseline}>
            新建基准观测
          </button>
        </div>
      </section>
    );
  }

  const pendingCount = pendingIssues(hole.config, activeRound).length;

  const tabItem = (key: Tab, label: string, badge?: number) => (
    <button
      key={key}
      className={`tab ${tab === key ? "active" : ""}`}
      onClick={() => setTab(key)}
    >
      {label}
      {badge !== undefined && badge > 0 && <span className="tab-badge">{badge}</span>}
    </button>
  );

  return (
    <section className="panel workspace-panel">
      <div className="rounds-strip">
        <div className="round-tabs">
          {ordered.map((r, i) => {
            const no = r.kind === "baseline"
              ? "基准"
              : `第${ordered.filter((x) => x.kind === "observation").indexOf(r) + 1}次`;
            const pending = pendingIssues(hole.config, r).length;
            return (
              <button
                key={r.id}
                className={`round-pill ${r.id === activeRound.id ? "active" : ""} ${r.kind}`}
                onClick={() => setRoundId(r.id)}
              >
                <span className="round-no">{no}</span>
                <span className="round-date">{r.date}</span>
                {pending > 0 && <i className="pill-flag">{pending}</i>}
              </button>
            );
          })}
        </div>
        <div className="round-ops">
          <button className="ghost small" onClick={() => setShowSetup(true)}>
            基准参数
          </button>
          <button
            className="primary-action small"
            onClick={props.onAddObservation}
            disabled={!baselineUsable}
            title={!baselineUsable ? "基准观测未完成（孔底缺测或有待复核测点）" : "新增一次复测"}
          >
            再次观测
          </button>
        </div>
      </div>

      <div className="round-meta">
        <label>
          <span>观测日期</span>
          <input
            type="date"
            value={activeRound.date}
            onChange={(e) => props.onRoundMeta(activeRound.id, { date: e.target.value })}
          />
        </label>
        <label>
          <span>观测人</span>
          <input
            value={activeRound.operator}
            onChange={(e) => props.onRoundMeta(activeRound.id, { operator: e.target.value })}
          />
        </label>
        <span className="round-kind-note">
          {activeRound.kind === "baseline"
            ? "基准轮：复测以此轮各测点倾斜量为零点"
            : "复测轮：累计位移对照基准，变化速率对照上次观测"}
        </span>
      </div>

      <StatusBanner
        config={hole.config}
        rounds={hole.rounds}
        round={activeRound}
      />

      <div className="tab-bar">
        {tabItem("entry", "深度录入")}
        {tabItem("review", "待复核区", pendingCount)}
        {tabItem("curve", "正式曲线")}
      </div>

      {tab === "entry" && (
        <ReadingTable
          config={hole.config}
          baseline={baselineUsable}
          round={activeRound}
          onEdit={(depth, field, value) =>
            props.onEditReading(activeRound.id, depth, field, value)
          }
          onFillCumulative={(series) => props.onFillCumulative(activeRound.id, series)}
        />
      )}

      {tab === "review" && (
        <ReviewQueue
          config={hole.config}
          round={activeRound}
          onResolve={(depth, decision) => props.onResolve(activeRound.id, depth, decision)}
          onRevoke={(depth) => props.onRevoke(activeRound.id, depth)}
        />
      )}

      {tab === "curve" && (
        <div className="curve-pane">
          <CurveChart
            config={hole.config}
            rounds={hole.rounds}
            current={activeRound}
          />
          <p className="curve-note">
            仅绘制无判异及复核采用的测点；红色虚线为缺测/弃用造成的断链区间，灰色细线为历次复测。
            {activeRound.kind === "baseline" && " 当前为基准轮，曲线为零位移基准线。"}
          </p>
        </div>
      )}
    </section>
  );
}
