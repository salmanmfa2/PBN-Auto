import { useState, useEffect } from "react";

interface DuplicateRemoverProps {
  columns: string[];
  onApply: (columns: string[]) => void;
  isLoading: boolean;
  stats: { original: number; removed: number; remaining: number } | null;
  disabled?: boolean;
}

export function DuplicateRemover({
  columns,
  onApply,
  isLoading,
  stats,
  disabled = false,
}: DuplicateRemoverProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [columns.join('|')]);

  const toggle = (col: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(col) ? next.delete(col) : next.add(col);
      return next;
    });
  };

  const handleApply = () => {
    if (selected.size === 0) return;
    onApply([...selected]);
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="section-title">Remove Duplicates</span>

      <p className="text-xs text-slate-400">
        Select columns to define a unique key. Duplicate rows (keeping the first) will be removed.
      </p>

      <div className="space-y-0.5 max-h-40 overflow-y-auto">
        {columns.map((col) => (
          <label
            key={col}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-700 cursor-pointer"
          >
            <input
              type="checkbox"
              disabled={disabled}
              checked={selected.has(col)}
              onChange={() => toggle(col)}
              className="w-3.5 h-3.5 accent-brand-500"
            />
            <span className="text-xs font-mono text-slate-300 truncate">{col}</span>
          </label>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="text-xs text-slate-400 bg-surface-900 rounded-lg px-3 py-2">
          Key: <span className="text-brand-400 font-mono">{[...selected].join(' + ')}</span>
        </div>
      )}

      <button
        onClick={handleApply}
        disabled={disabled || isLoading || selected.size === 0}
        className="btn-danger text-xs justify-center"
      >
        Remove Duplicates
      </button>

      {stats && (
        <div className="grid grid-cols-3 gap-1 mt-1">
          <div className="bg-surface-900 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-slate-200">{stats.original.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Original</p>
          </div>
          <div className="bg-rose-900/30 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-rose-400">−{stats.removed.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Removed</p>
          </div>
          <div className="bg-emerald-900/30 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-emerald-400">{stats.remaining.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Remaining</p>
          </div>
        </div>
      )}
    </div>
  );
}
