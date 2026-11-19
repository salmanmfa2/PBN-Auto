import { useState, useEffect } from "react";

interface ColumnManagerProps {
  columns: string[];
  onApplyRemove: (columnsToKeep: string[]) => void;
  onApplyRename: (renameMap: Record<string, string>) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function ColumnManager({ columns, onApplyRemove, onApplyRename, isLoading, disabled = false }: ColumnManagerProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set(columns));
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    setChecked(new Set(columns));
    setRenames({});
  }, [columns.join('|')]);

  const toggle = (col: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(col) ? next.delete(col) : next.add(col);
      return next;
    });
  };

  const toggleAll = () => {
    setChecked(checked.size === columns.length ? new Set() : new Set(columns));
  };

  const setRename = (col: string, value: string) => {
    setRenames((prev) => ({ ...prev, [col]: value }));
  };

  const filteredCols = columns.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  );

  const handleApplyRemove = () => {
    const toKeep = columns.filter((c) => checked.has(c));
    onApplyRemove(toKeep);
  };

  const handleApplyRename = () => {
    const map: Record<string, string> = {};
    for (const [original, renamed] of Object.entries(renames)) {
      if (renamed.trim() && renamed.trim() !== original) {
        map[original] = renamed.trim();
      }
    }
    if (Object.keys(map).length === 0) return;
    onApplyRename(map);
    setRenames({});
  };

  const pendingRenames = Object.entries(renames).filter(
    ([orig, val]: [string, string]) => val.trim() && val.trim() !== orig
  ).length;

  const removedCount = columns.length - checked.size;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="section-title">Columns</span>
          <button disabled={disabled} onClick={toggleAll} className="text-xs text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50">
            {checked.size === columns.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <input disabled={disabled} className="input mb-2 text-xs" placeholder="Search columns…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="space-y-0.5 max-h-56 overflow-y-auto">
          {filteredCols.map((col) => (
            <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-700 cursor-pointer group">
              <input disabled={disabled} type="checkbox" checked={checked.has(col)} onChange={() => toggle(col)} className="w-3.5 h-3.5 accent-brand-500 shrink-0" />
              <span className={`text-xs font-mono truncate flex-1 ${checked.has(col) ? 'text-slate-200' : 'text-slate-500 line-through'}`}>{col}</span>
              <input
                type="text"
                disabled={disabled}
                placeholder="rename…"
                value={renames[col] ?? ''}
                onChange={(e) => setRename(col, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-20 px-1.5 py-0.5 bg-surface-900 border border-surface-600 rounded text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-brand-500 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </label>
          ))}
          {filteredCols.length === 0 && <p className="text-xs text-slate-500 px-2 py-2">No columns match.</p>}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleApplyRemove} disabled={disabled || isLoading || removedCount === 0} className="btn-secondary flex-1 text-xs justify-center">
            {removedCount > 0 ? `Remove ${removedCount} col${removedCount !== 1 ? 's' : ''}` : 'No changes'}
          </button>
        </div>
        {pendingRenames > 0 && (
          <button onClick={handleApplyRename} disabled={disabled || isLoading} className="btn-primary w-full mt-2 text-xs justify-center">
            Apply {pendingRenames} rename{pendingRenames !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}
