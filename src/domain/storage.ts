import type { AppData, Borehole } from "./types";
import { seedData } from "./seed";

const STORAGE_KEY = "inclinometer-bench-v1";

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.boreholes)) {
        return parsed;
      }
    }
  } catch {
    // 存储损坏时回落到演示数据
  }
  const boreholes = seedData();
  return { version: 1, boreholes, selectedId: boreholes[0]?.id ?? null };
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 隐私模式等场景下静默失败，不影响当前会话
  }
}

export function resetData(): AppData {
  const boreholes: Borehole[] = seedData();
  const data: AppData = { version: 1, boreholes, selectedId: boreholes[0]?.id ?? null };
  saveData(data);
  return data;
}
