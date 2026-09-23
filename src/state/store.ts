import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppData, Borehole, Reading, ReviewState, Survey, Thresholds } from "../domain/types";
import { loadData, resetData, saveData } from "../domain/storage";
import {
  applyEvaluation,
  assessHole,
  baselineOf,
  createBorehole,
  createEmptySurvey,
  latestRoutine,
} from "../domain/rules";

/** 状态层：只负责数据变更与持久化，不含任何界面逻辑 */
export function useBenchStore() {
  const [data, setData] = useState<AppData>(loadData);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveData(data), 200);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [data]);

  const updateHole = useCallback((holeId: string, fn: (h: Borehole) => Borehole) => {
    setData((d) => ({
      ...d,
      boreholes: d.boreholes.map((h) => (h.id === holeId ? fn(h) : h)),
    }));
  }, []);

  const updateSurvey = useCallback(
    (holeId: string, surveyId: string, fn: (s: Survey) => Survey) => {
      updateHole(holeId, (h) => ({
        ...h,
        surveys: h.surveys.map((s) => (s.id === surveyId ? fn(s) : s)),
      }));
    },
    [updateHole]
  );

  const selectHole = useCallback((id: string) => {
    setData((d) => ({ ...d, selectedId: id }));
  }, []);

  const addHole = useCallback((code: string, location: string, totalDepth: number, spacing: number) => {
    const hole = createBorehole(code, location, totalDepth, spacing);
    setData((d) => ({ ...d, boreholes: [...d.boreholes, hole], selectedId: hole.id }));
  }, []);

  const restoreDemo = useCallback(() => setData(resetData()), []);

  const updateThresholds = useCallback(
    (holeId: string, patch: Partial<Thresholds>) => {
      updateHole(holeId, (h) => {
        const thresholds = { ...h.thresholds, ...patch };
        // 正反和限值变化会影响问题判定，全部测次重算
        const surveys = h.surveys.map((s) => applyEvaluation(s, thresholds.sumTol));
        return { ...h, thresholds, surveys };
      });
    },
    [updateHole]
  );

  const addSurvey = useCallback(
    (holeId: string, kind: "baseline" | "routine", date: string) => {
      let newId: string | null = null;
      updateHole(holeId, (h) => {
        const survey = createEmptySurvey(kind, date, h.totalDepth, h.spacing);
        newId = survey.id;
        return { ...h, surveys: [...h.surveys, survey] };
      });
      return newId;
    },
    [updateHole]
  );

  /** 录入 / 修改单个测点读数后重算该测次的校验结果 */
  const setReadingField = useCallback(
    (
      holeId: string,
      surveyId: string,
      readingId: string,
      field: "forward" | "reverse" | "cumulative",
      value: number | null
    ) => {
      updateHole(holeId, (h) => {
        const surveys = h.surveys.map((s) => {
          if (s.id !== surveyId) return s;
          const readings = s.readings.map((r) =>
            r.id === readingId ? { ...r, [field]: value } : r
          );
          return applyEvaluation({ ...s, readings }, h.thresholds.sumTol);
        });
        return { ...h, surveys };
      });
    },
    [updateHole]
  );

  const setSurveyMeta = useCallback(
    (holeId: string, surveyId: string, patch: { date?: string; note?: string }) => {
      updateSurvey(holeId, surveyId, (s) => ({ ...s, ...patch }));
    },
    [updateSurvey]
  );

  /** 待复核区处理：写明原因后采纳 / 退回 */
  const resolveReading = useCallback(
    (holeId: string, surveyId: string, readingId: string, review: ReviewState, reason: string) => {
      updateSurvey(holeId, surveyId, (s) => ({
        ...s,
        readings: s.readings.map((r) =>
          r.id === readingId
            ? { ...r, review, reviewReason: reason.trim(), reviewedAt: new Date().toISOString() }
            : r
        ),
      }));
    },
    [updateSurvey]
  );

  return {
    data,
    selectHole,
    addHole,
    restoreDemo,
    updateThresholds,
    addSurvey,
    setReadingField,
    setSurveyMeta,
    resolveReading,
  };
}

export type BenchStore = ReturnType<typeof useBenchStore>;

/** 派生数据：当前孔 + 评估结果集中在此计算，组件只做展示 */
export function useSelectedHole(data: AppData) {
  const hole = useMemo(
    () => data.boreholes.find((h) => h.id === data.selectedId) ?? data.boreholes[0] ?? null,
    [data]
  );
  const assessment = useMemo(() => (hole ? assessHole(hole) : null), [hole]);
  const baseline = useMemo(() => (hole ? baselineOf(hole) : null), [hole]);
  const latest = useMemo(() => (hole ? latestRoutine(hole) : null), [hole]);
  return { hole, assessment, baseline, latest };
}

export type { Reading };
