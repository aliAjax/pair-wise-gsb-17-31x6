// 待复核区：偏差超限或缺测/缺相邻测点先落入此处，写明原因后才能进入正式曲线。
import { useState } from "react";
import type { HoleConfig, Decision, Round } from "../inclino/types";
import {
  pendingIssues,
  resolvedIssues,
  pointState,
} from "../inclino/rules";
import { depthKey } from "../inclino/math";

interface Props {
  config: HoleConfig;
  round: Round;
  onResolve: (depth: number, decision: Omit<Decision, "decidedAt">) => void;
  onRevoke: (depth: number) => void;
}

const KIND_LABEL: Record<Decision["kind"], string> = {
  deviation: "正反偏差超限",
  missing: "缺测 / 区间中断",
};

export default function ReviewQueue({ config, round, onResolve, onRevoke }: Props) {
  const pending = pendingIssues(config, round);
  const resolved = resolvedIssues(config, round);
  const [draft, setDraft] = useState<Record<string, { note: string; resolution: Decision["resolution"] }>>(
    {}
  );

  const getDraft = (depth: number) =>
    draft[depthKey(depth)] ?? { note: "", resolution: "adopted" as const };

  const submit = (depth: number, kind: Decision["kind"], reason: string) => {
    const d = getDraft(depth);
    if (d.note.trim().length < 4) return;
    onResolve(depth, { kind, reason, note: d.note.trim(), resolution: d.resolution });
    setDraft((prev) => {
      const next = { ...prev };
      delete next[depthKey(depth)];
      return next;
    });
  };

  if (pending.length === 0 && resolved.length === 0) {
    return (
      <div className="review-empty">
        本轮全部测点通过正反行程偏差与相邻测点检查，可直接进入正式曲线。
      </div>
    );
  }

  return (
    <div className="review-list">
      {pending.map((issue) => {
        const d = getDraft(issue.depth);
        const state = pointState(config, round, issue.depth);
        return (
          <article
            key={`${issue.depth}-${issue.kind}`}
            className={`review-card pending state-${state}`}
          >
            <header>
              <span className="review-depth">{issue.depth.toFixed(1)}m</span>
              <span className={`badge ${issue.kind}`}>{KIND_LABEL[issue.kind]}</span>
              <span className="badge state-badge">待复核 · 暂不进入曲线</span>
            </header>
            <p className="review-reason">{issue.reason}</p>
            <label className="review-note-label">
              复核原因（写明后才能处理）
              <textarea
                rows={2}
                placeholder="如：已重测，读数在允差内，采用；或：探头受阻读数无效，按缺测弃用"
                value={d.note}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    [depthKey(issue.depth)]: { ...d, note: e.target.value },
                  }))
                }
              />
            </label>
            <div className="review-actions">
              <label className="radio-line">
                <input
                  type="radio"
                  name={`res-${issue.depth}`}
                  checked={d.resolution === "adopted"}
                  onChange={() =>
                    setDraft((prev) => ({
                      ...prev,
                      [depthKey(issue.depth)]: { ...d, resolution: "adopted" },
                    }))
                  }
                />
                复核采用，进入正式曲线
              </label>
              <label className="radio-line">
                <input
                  type="radio"
                  name={`res-${issue.depth}`}
                  checked={d.resolution === "excluded"}
                  onChange={() =>
                    setDraft((prev) => ({
                      ...prev,
                      [depthKey(issue.depth)]: { ...d, resolution: "excluded" },
                    }))
                  }
                />
                弃用 / 登记缺测
              </label>
              <button
                className="primary-action small"
                disabled={d.note.trim().length < 4}
                onClick={() => submit(issue.depth, issue.kind, issue.reason)}
              >
                写明原因并处理
              </button>
            </div>
          </article>
        );
      })}

      {resolved.map((issue) => {
        const decision = round.decisions[depthKey(issue.depth)]!;
        const state = pointState(config, round, issue.depth);
        return (
          <article
            key={`done-${issue.depth}-${issue.kind}`}
            className={`review-card resolved state-${state}`}
          >
            <header>
              <span className="review-depth">{issue.depth.toFixed(1)}m</span>
              <span className={`badge ${issue.kind}`}>{KIND_LABEL[issue.kind]}</span>
              <span className={`badge state-badge ${state}`}>
                {state === "adopted" ? "已复核采用" : "已弃用 / 缺测"}
              </span>
            </header>
            <p className="review-reason">判异：{issue.reason}</p>
            <p className="review-note">
              复核原因（{decision.decidedAt}）：{decision.note}
            </p>
            <button className="ghost small" onClick={() => onRevoke(issue.depth)}>
              撤回到待复核区
            </button>
          </article>
        );
      })}
    </div>
  );
}
