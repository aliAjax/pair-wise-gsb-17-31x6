import { useEffect, useMemo, useState } from "react";
import type { Borehole, Reading, ReviewState, Survey } from "../domain/types";
import { isFormalPoint } from "../domain/rules";
import type { BenchStore } from "../state/store";
import { Badge, REVIEW_META } from "./ui";

/** 待复核页：偏差超限 / 缺测区间在此写明原因，采纳后方可进入正式曲线 */
export function ReviewTab({ hole, store }: { hole: Borehole; store: BenchStore }) {
  const surveys = useMemo(
    () => [...hole.surveys].sort((a, b) => b.date.localeCompare(a.date)),
    [hole.surveys]
  );
  const firstPending = surveys.find((s) => s.readings.some((r) => r.review === "pending"));
  const [surveyId, setSurveyId] = useState<string | null>(firstPending?.id ?? surveys[0]?.id ?? null);

  useEffect(() => {
    if (surveyId && surveys.some((s) => s.id === surveyId)) return;
    const pending = surveys.find((s) => s.readings.some((r) => r.review === "pending"));
    setSurveyId(pending?.id ?? surveys[0]?.id ?? null);
  }, [hole.id, surveys.map((s) => s.id).join(",")]);

  const baseline = hole.surveys.find((s) => s.kind === "baseline");
  if (!baseline) {
    return (
      <section className="panel notice-panel">
        <h2>暂无可复核数据</h2>
        <p>建立基准并录入读数后，偏差超限或缺测的测点会自动进入待复核区。</p>
      </section>
    );
  }

  const survey = surveys.find((s) => s.id === surveyId) ?? null;
  const pending = survey ? survey.readings.filter((r) => r.review === "pending") : [];
  const handled = survey
    ? survey.readings.filter((r) => r.review === "accepted" || r.review === "rejected")
    : [];

  return (
    <div className="tab-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p>数据复核</p>
            <h2>待复核区</h2>
          </div>
        </div>

        <div className="survey-tabs">
          {surveys.map((s) => {
            const n = s.readings.filter((r) => r.review === "pending").length;
            return (
              <button
                key={s.id}
                className={`survey-tab${s.id === surveyId ? " active" : ""}`}
                onClick={() => setSurveyId(s.id)}
              >
                {s.kind === "baseline" ? "基准" : "复测"} · {s.date}
                {n > 0 && <em className="tab-pending">{n}</em>}
              </button>
            );
          })}
        </div>

        {survey && (
          <>
            {survey.note && <p className="muted survey-note">观测说明：{survey.note}</p>}
            {pending.length === 0 ? (
              <div className="all-clear">
                <strong>本测次没有待复核测点</strong>
                <p>读数全部通过校验，或异常测点均已写明处理意见。</p>
              </div>
            ) : (
              <div className="review-list">
                {pending.map((r) => (
                  <ReviewCard key={r.id} hole={hole} survey={survey} reading={r} store={store} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {survey && handled.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p>处理留痕</p>
              <h2>已处理测点（{survey.date}）</h2>
            </div>
          </div>
          <div className="handled-list">
            {handled.map((r) => (
              <div key={r.id} className="handled-item">
                <div className="handled-head">
                  <strong>{r.depth} m</strong>
                  <Badge cls={REVIEW_META[r.review as ReviewState].cls} label={REVIEW_META[r.review as ReviewState].label} />
                  <span className={isFormalPoint(r) ? "in-curve" : "not-curve"}>
                    {isFormalPoint(r) ? "已进入正式曲线" : "不进入正式曲线"}
                  </span>
                </div>
                <p>{r.reviewReason}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ReviewCard({
  hole,
  survey,
  reading,
  store,
}: {
  hole: Borehole;
  survey: Survey;
  reading: Reading;
  store: BenchStore;
}) {
  const [reason, setReason] = useState(reading.reviewReason ?? "");
  const [error, setError] = useState("");

  const submit = (review: ReviewState) => {
    if (!reason.trim()) {
      setError(review === "accepted" ? "采纳前必须写明原因，方可进入正式曲线" : "退回时请写明原因留档");
      return;
    }
    store.resolveReading(hole.id, survey.id, reading.id, review, reason);
  };

  const sum =
    reading.forward !== null && reading.reverse !== null
      ? reading.forward + reading.reverse
      : null;

  return (
    <article className="review-card">
      <div className="review-head">
        <h3>{reading.depth} m 测点</h3>
        <div className="issue-stack">
          {reading.issues.map((i) => (
            <span key={i.type} className={`issue-tag issue-${i.type}`}>
              {i.message}
            </span>
          ))}
        </div>
      </div>
      <div className="review-readings">
        <div>
          <span>正行程</span>
          <strong>{reading.forward === null ? "缺测" : reading.forward}</strong>
        </div>
        <div>
          <span>反行程</span>
          <strong>{reading.reverse === null ? "缺测" : reading.reverse}</strong>
        </div>
        <div>
          <span>正反和</span>
          <strong>{sum === null ? "—" : sum.toFixed(1)}</strong>
        </div>
        <div>
          <span>累计位移(mm)</span>
          <strong>{reading.cumulative === null ? "缺测" : reading.cumulative}</strong>
        </div>
      </div>
      <label className="reason-box">
        <span>复核原因 / 处理说明（必填）</span>
        <textarea
          rows={2}
          value={reason}
          placeholder="如：复测确认读数可靠，相邻缺测为电缆故障，按单点参考保留……"
          onChange={(e) => {
            setReason(e.target.value);
            setError("");
          }}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="review-actions">
        <button className="reject-btn" onClick={() => submit("rejected")}>
          退回，不进入曲线
        </button>
        <button className="accept-btn" onClick={() => submit("accepted")}>
          写明原因并采纳
        </button>
      </div>
    </article>
  );
}
