import { useEffect, useState } from "react";
import type { Borehole, Survey } from "../domain/types";
import { isFormalPoint, isMissing, pendingCount } from "../domain/rules";
import type { BenchStore } from "../state/store";
import { Badge, NumberField, REVIEW_META, today } from "./ui";

/** 录入页：按深度录入正、反行程读数与累计位移；问题测点自动流入待复核区 */
export function EntryTab({ hole, store }: { hole: Borehole; store: BenchStore }) {
  const baseline = hole.surveys.find((s) => s.kind === "baseline") ?? null;
  const surveys = [...hole.surveys].sort((a, b) => a.date.localeCompare(b.date));
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [date, setDate] = useState(today());

  useEffect(() => {
    if (surveyId && surveys.some((s) => s.id === surveyId)) return;
    const last = surveys[surveys.length - 1];
    setSurveyId(last?.id ?? null);
  }, [hole.id, surveys.map((s) => s.id).join(",")]);

  const survey = surveys.find((s) => s.id === surveyId) ?? null;

  const addRoutine = () => {
    const id = store.addSurvey(hole.id, "routine", date);
    if (id) setSurveyId(id);
  };

  if (!baseline) {
    return (
      <section className="panel notice-panel">
        <h2>先设基准，再录读数</h2>
        <p>请在「孔位基准」页建立基准测次，测点序列（孔深、点距）确定后即可按深度录入复测数据。</p>
      </section>
    );
  }

  return (
    <div className="tab-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p>观测录入</p>
            <h2>按深度录入读数</h2>
          </div>
          <div className="survey-create">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="复测日期" />
            <button className="primary-action" onClick={addRoutine}>
              新增复测
            </button>
          </div>
        </div>

        <div className="survey-tabs" role="tablist">
          {surveys.map((s) => (
            <button
              key={s.id}
              role="tab"
              className={`survey-tab${s.id === surveyId ? " active" : ""}`}
              onClick={() => setSurveyId(s.id)}
            >
              {s.kind === "baseline" ? "基准" : "复测"} · {s.date}
              {pendingCount(s) > 0 && <em className="tab-pending">{pendingCount(s)}</em>}
            </button>
          ))}
        </div>

        {survey && <EntryGrid hole={hole} survey={survey} store={store} />}
      </section>
    </div>
  );
}

function EntryGrid({ hole, survey, store }: { hole: Borehole; survey: Survey; store: BenchStore }) {
  const refSum = typicalSum(survey);

  return (
    <div className="entry-body">
      <div className="entry-meta">
        <label className="meta-note">
          <span>观测说明</span>
          <input
            value={survey.note}
            placeholder="如：雨后复测，天气阴"
            onChange={(e) =>
              store.setSurveyMeta(hole.id, survey.id, { note: e.target.value })
            }
          />
        </label>
        <p className="rule-hint">
          校验规则：正/反行程任一缺测标记缺测区间；相邻测点缺测标记积分基准缺失；
          {refSum === null
            ? "正反和典型值需在录入有效读数后计算"
            : `正反和典型值 ${refSum.toFixed(1)}，|正程+反程 − 典型值| 超过限值 ${hole.thresholds.sumTol} 标记正反差异超限`}
          。有问题的测点自动进入待复核区。
        </p>
      </div>

      <div className="table-wrap">
        <table className="entry-table">
          <thead>
            <tr>
              <th>深度(m)</th>
              <th>正行程</th>
              <th>反行程</th>
              <th>正反和</th>
              <th>累计位移(mm)</th>
              <th>校验结果</th>
            </tr>
          </thead>
          <tbody>
            {survey.readings.map((r) => {
              const sum =
                isMissing(r.forward) || isMissing(r.reverse)
                  ? null
                  : ((r.forward as number) + (r.reverse as number));
              const meta = REVIEW_META[r.review];
              return (
                <tr key={r.id} className={r.issues.length > 0 ? "row-issue" : ""}>
                  <td className="depth-cell">{r.depth}</td>
                  <td>
                    <NumberField
                      value={r.forward}
                      ariaLabel={`${r.depth}m 正行程读数`}
                      onCommit={(v) =>
                        store.setReadingField(hole.id, survey.id, r.id, "forward", v)
                      }
                    />
                  </td>
                  <td>
                    <NumberField
                      value={r.reverse}
                      ariaLabel={`${r.depth}m 反行程读数`}
                      onCommit={(v) =>
                        store.setReadingField(hole.id, survey.id, r.id, "reverse", v)
                      }
                    />
                  </td>
                  <td className={`sum-cell${sum === null ? " missing" : ""}`}>
                    {sum === null ? "—" : sum.toFixed(1)}
                  </td>
                  <td>
                    <NumberField
                      value={r.cumulative}
                      ariaLabel={`${r.depth}m 累计位移`}
                      onCommit={(v) =>
                        store.setReadingField(hole.id, survey.id, r.id, "cumulative", v)
                      }
                    />
                  </td>
                  <td className="issue-cell">
                    {r.issues.length === 0 ? (
                      <Badge cls="badge-pass" label="通过" />
                    ) : (
                      <div className="issue-stack">
                        {r.issues.map((i) => (
                          <span key={i.type} className={`issue-tag issue-${i.type}`}>
                            {issueLabel(i.type)}
                          </span>
                        ))}
                        <Badge cls={meta.cls} label={meta.label} />
                        {!isFormalPoint(r) && <span className="not-curve">不入曲线</span>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function issueLabel(type: string): string {
  if (type === "sum") return "正反差异超限";
  if (type === "missing") return "缺测";
  return "相邻缺测";
}

function typicalSum(survey: Survey): number | null {
  const sums = survey.readings
    .filter((r) => !isMissing(r.forward) && !isMissing(r.reverse))
    .map((r) => (r.forward as number) + (r.reverse as number))
    .sort((a, b) => a - b);
  if (!sums.length) return null;
  const mid = Math.floor(sums.length / 2);
  return sums.length % 2 ? sums[mid] : (sums[mid - 1] + sums[mid]) / 2;
}
