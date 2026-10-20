import type { StoredDatasetRun } from '../../types';

interface StoredRunsProps {
  runs: StoredDatasetRun[];
  isLoading: boolean;
  error: string | null;
  onRestore: (datasetId: string) => void;
  onDelete: (datasetId: string) => void;
  onRefresh: () => void;
}

export function StoredRuns({ runs, isLoading, error, onRestore, onDelete, onRefresh }: StoredRunsProps) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="section-title">Recent Runs</p>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-surface-700 hover:text-slate-100"
          title="Refresh history"
          aria-label="Refresh history"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      {isLoading && <p className="text-sm text-slate-500">Loading history...</p>}
      {!isLoading && error && <p className="text-sm text-red-300">{error}</p>}
      {!isLoading && !error && runs.length === 0 && (
        <p className="text-sm text-slate-500">No saved runs yet.</p>
      )}
      {!isLoading && !error && runs.length > 0 && (
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.dataset_id} className="rounded-lg border border-surface-700 bg-surface-900 p-3">
              <p className="truncate text-sm font-medium text-slate-200" title={run.run_name}>{run.run_name}</p>
              <p className="mt-1 truncate text-xs text-slate-500" title={run.original_filename}>{run.original_filename}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">v{run.latest_version}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Restore "${run.run_name}"? This replaces the current dataset.`)) {
                        onRestore(run.dataset_id);
                      }
                    }}
                    className="rounded-md bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-400"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete "${run.run_name}" and all of its saved versions? This cannot be undone.`)) {
                        onDelete(run.dataset_id);
                      }
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-300 hover:bg-red-500/15 hover:text-red-200"
                    title="Delete run"
                    aria-label={`Delete ${run.run_name}`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-9 0h12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}