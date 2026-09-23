// 新增测斜孔：给定孔号孔深即建档，之后引导“先设基准”。
import { useState } from "react";
import type { HoleConfig } from "../inclino/types";
import { DEFAULT_CONFIG } from "../inclino/store";

interface Props {
  existing: string[];
  onCreate: (config: HoleConfig) => void;
  onCancel: () => void;
}

export default function NewHoleDialog({ existing, onCreate, onCancel }: Props) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [depth, setDepth] = useState(DEFAULT_CONFIG.depth);

  const dup = existing.includes(name.trim());
  const valid = name.trim() !== "" && !dup && depth > 0;

  const submit = () => {
    if (!valid) return;
    onCreate({
      ...DEFAULT_CONFIG,
      id: `h-${Date.now().toString(36)}`,
      name: name.trim(),
      location: location.trim() || "未填写孔位",
      depth,
    });
  };

  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="section-heading">
          <div>
            <p>建档</p>
            <h2>新增测斜孔</h2>
          </div>
        </div>
        <div className="setup-grid">
          <label>
            <span>孔号</span>
            <input
              value={name}
              placeholder="如 CX-27"
              onChange={(e) => setName(e.target.value)}
            />
            {dup && <span className="form-error">该孔号已存在</span>}
          </label>
          <label>
            <span>孔位描述</span>
            <input
              value={location}
              placeholder="如 基坑西侧 邻近道路"
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label>
            <span>孔深（m）</span>
            <input
              type="number"
              step={0.5}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value) || 0)}
            />
          </label>
          <p className="form-hint">
            测点间距默认 0.5m，允差与关注/预警阈值取现场常用值，建档后可在“基准参数”中按孔修改。
          </p>
        </div>
        <div className="setup-actions">
          <button className="ghost" onClick={onCancel}>
            取消
          </button>
          <button className="primary-action" disabled={!valid} onClick={submit}>
            建档并进入
          </button>
        </div>
      </div>
    </div>
  );
}
