import { useState } from "react";
import type { AppData } from "../domain/types";
import { assessHole, pendingCount } from "../domain/rules";
import { Badge, HOLE_STATUS_META } from "./ui";

/** 左侧孔号栏：切换孔号后，每个孔的录入与复核结论都随本地存储保留 */
export function Sidebar({
  data,
  selectedId,
  onSelect,
  onAdd,
  onRestore,
}: {
  data: AppData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (code: string, location: string, depth: number, spacing: number) => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [depth, setDepth] = useState("20");
  const [spacing, setSpacing] = useState("2");
  const [error, setError] = useState("");

  const submit = () => {
    const d = Number(depth);
    const sp = Number(spacing);
    if (!code.trim()) return setError("请填写孔号");
    if (data.boreholes.some((h) => h.code === code.trim())) return setError("孔号已存在");
    if (!Number.isFinite(d) || d <= 0) return setError("孔深需为正数");
    if (!Number.isFinite(sp) || sp <= 0 || sp > d) return setError("点距需为正数且不大于孔深");
    onAdd(code.trim(), location.trim() || "未填写位置", d, sp);
    setCode("");
    setLocation("");
    setDepth("20");
    setSpacing("2");
    setError("");
    setOpen(false);
  };

  return (
    <aside className="panel sidebar">
      <div className="sidebar-head">
        <h2>测斜孔</h2>
        <button className="mini-btn" onClick={() => setOpen((v) => !v)}>
          {open ? "取消" : "＋ 新孔"}
        </button>
      </div>

      {open && (
        <div className="add-hole">
          <label>
            <span>孔号</span>
            <input value={code} placeholder="CX-05" onChange={(e) => setCode(e.target.value)} />
          </label>
          <label>
            <span>位置</span>
            <input value={location} placeholder="基坑北侧" onChange={(e) => setLocation(e.target.value)} />
          </label>
          <div className="form-row">
            <label>
              <span>孔深(m)</span>
              <input value={depth} inputMode="decimal" onChange={(e) => setDepth(e.target.value)} />
            </label>
            <label>
              <span>点距(m)</span>
              <input value={spacing} inputMode="decimal" onChange={(e) => setSpacing(e.target.value)} />
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-action" onClick={submit}>
            建立孔号
          </button>
        </div>
      )}

      <div className="hole-list">
        {data.boreholes.map((h) => {
          const a = assessHole(h);
          const meta = HOLE_STATUS_META[a.status];
          const pending = h.surveys.reduce((n, s) => n + pendingCount(s), 0);
          return (
            <button
              key={h.id}
              className={`hole-item${h.id === selectedId ? " active" : ""}`}
              onClick={() => onSelect(h.id)}
            >
              <span className={`hole-dot ${meta.dot}`} />
              <span className="hole-main">
                <strong>{h.code}</strong>
                <small>
                  {h.location} · {h.totalDepth}m / {h.spacing}m
                </small>
              </span>
              <span className="hole-side">
                {pending > 0 && <em className="pending-pill">{pending} 待复核</em>}
                <Badge cls={meta.cls} label={meta.label} />
              </span>
            </button>
          );
        })}
      </div>

      <button className="ghost-btn sidebar-foot" onClick={onRestore}>
        恢复演示数据
      </button>
    </aside>
  );
}
