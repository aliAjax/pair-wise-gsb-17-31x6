// 纯数值工具：深度序列生成、读数换算，不依赖任何业务状态。
import type { Reading, Round } from "./types";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 深度键，规避 0.1+0.2 一类浮点误差导致的查表失败 */
export function depthKey(depth: number): string {
  return String(round2(depth));
}

/** 按孔深/间距生成测点深度序列：0.5、1.0、…、孔底 */
export function depthSlots(depth: number, interval: number): number[] {
  const count = Math.max(0, Math.floor(round2(depth / interval)));
  return Array.from({ length: count }, (_, i) => round2((i + 1) * interval));
}

/** 誊抄字符串 → 有限数值；空白或非法一律按缺测处理 */
export function num(value: string): number | null {
  const s = value.trim();
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function readingAt(round: Round, depth: number): Reading {
  const found = round.readings.find((r) => round2(r.depth) === round2(depth));
  return found ?? { depth, forward: "", reverse: "", cumulative: "" };
}

/**
 * 单测点倾斜量：正反行程差的一半。
 * 正 = 倾斜 + 零偏，反 = -倾斜 + 零偏，故 (正-反)/2 消去零偏。
 */
export function tiltOf(reading: Reading): number | null {
  const f = num(reading.forward);
  const b = num(reading.reverse);
  if (f === null || b === null) return null;
  return (f - b) / 2;
}

export function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

/** 日期字符串相差天数（按本地日历日） */
export function daysBetween(a: string, b: string): number | null {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 86_400_000);
}
