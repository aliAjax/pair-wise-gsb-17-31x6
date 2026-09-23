// 孔位侧栏：切换孔号；每个孔显示基准状态与最近一轮稳定/关注/预警，处理结果随存储保留。
import type { ProjectStore } from "../inclino/types";
import { baselineReady, pendingIssues } from "../inclino/rules";
import { assessRound } from "../inclino/curves";

interface Props {
  store: ProjectStore;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export default function Sidebar({ store, onSelect, onAdd }: Props) {
  return (
    <aside className="panel sidebar">
      <div className="section-heading">
        <div>
          <p>测斜孔</p>
          <h2>孔号切换</h2>
        </div>
        <button className="primary-action" onClick={onAdd}>
          新增孔
        </button>
      </div>
      <div className="hole-list">
        {store.holes.map((hole) => {
          const baseline = baselineReady(hole.config, hole.rounds);
          const latest = [...hole.rounds]
            .filter((r) => r.kind === "observation")
            .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
          const status = latest
            ? assessRound(hole.config, hole.rounds, latest).status
            : null;
          const active = store.selectedId === hole.config.id;
          return (
            <button
              key={hole.config.id}
              className={`hole-card ${active ? "active" : ""}`}
              onClick={() => onSelect(hole.config.id)}
            >
              <div className="hole-card-head">
                <strong>{hole.config.name}</strong>
                {latest && <i className={`state-dot ${status}`} title={status ?? ""} />}
                {!latest && baseline && <i className="state-dot baseline" title="仅基准" />}
                {!baseline && <i className="state-dot none" title="无基准" />}
              </div>
              <span className="hole-loc">{hole.config.location}</span>
              <span className="hole-meta">
                孔深 {hole.config.depth}m · {hole.rounds.length} 轮记录
                {baseline ? " · 基准已设" : " · 未设基准"}
              </span>
              {hole.rounds.some((r) => pendingIssues(hole.config, r).length > 0) && (
                <span className="hole-flag">有待复核测点</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="sidebar-note">数据保存在本机浏览器，切换孔号后再回来，复核处理结果仍在。</p>
    </aside>
  );
}
