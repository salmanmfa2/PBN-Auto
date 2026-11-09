import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as apiClient from '../services/api';
import type {
  PbnDashboardCount,
  PbnDashboardFilters,
  PbnDashboardPeopleResponse,
  PbnDashboardResponse,
} from '../types';

interface NumericRange {
  min: number;
  max: number;
}

interface RangeFilterProps {
  title: string;
  value: NumericRange;
  bounds: NumericRange;
  onChange: (range: NumericRange) => void;
}

function RangeFilter({ title, value, bounds, onChange }: RangeFilterProps) {
  return (
    <section className="rounded-lg border border-surface-700 bg-surface-900 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
        <span className="text-xs tabular-nums text-brand-300">{value.min} – {value.max}</span>
      </div>
      <label className="mb-1 block text-[11px] text-slate-500">
        Minimum: {value.min}
        <input
          type="range"
          min={bounds.min}
          max={bounds.max}
          value={value.min}
          disabled={bounds.min === bounds.max}
          onChange={(event) => onChange({
            min: Math.min(Number(event.target.value), value.max),
            max: value.max,
          })}
          className="mt-1 block w-full accent-sky-400 disabled:opacity-40"
          aria-label={`${title} minimum`}
        />
      </label>
      <label className="block text-[11px] text-slate-500">
        Maximum: {value.max}
        <input
          type="range"
          min={bounds.min}
          max={bounds.max}
          value={value.max}
          disabled={bounds.min === bounds.max}
          onChange={(event) => onChange({
            min: value.min,
            max: Math.max(Number(event.target.value), value.min),
          })}
          className="mt-1 block w-full accent-sky-400 disabled:opacity-40"
          aria-label={`${title} maximum`}
        />
      </label>
    </section>
  );
}

interface CheckboxFilterProps {
  title: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function CheckboxFilter({ title, options, selected, onChange }: CheckboxFilterProps) {
  const toggle = (option: string, checked: boolean) => {
    const next = checked
      ? [...selected, option]
      : selected.filter((item) => item !== option);
    onChange(next.length === options.length ? [] : next);
  };

  return (
    <section className="rounded-lg border border-surface-700 bg-surface-900 p-3">
      <h3 className="mb-2 text-sm font-medium text-slate-200">{title}</h3>
      <div className="max-h-40 space-y-1 overflow-y-auto">
        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-300 hover:bg-surface-800">
          <input
            type="checkbox"
            checked={selected.length === 0}
            onChange={() => onChange([])}
            className="accent-sky-400"
          />
          All
        </label>
        {options.map((option) => (
          <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-300 hover:bg-surface-800">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={(event) => toggle(option, event.target.checked)}
              className="accent-sky-400"
            />
            <span className="break-words">{option}</span>
          </label>
        ))}
        {options.length === 0 && <p className="px-1 py-1 text-xs text-slate-500">No values available.</p>}
      </div>
    </section>
  );
}

interface DistributionChartProps {
  title: string;
  items: PbnDashboardCount[];
}

function DistributionChart({ title, items }: DistributionChartProps) {
  const largestCount = Math.max(1, ...items.map((item) => item.count));

  return (
    <section className="card flex min-h-72 flex-col p-4">
      <h2 className="mb-4 text-sm font-semibold text-slate-200">{title}</h2>
      {items.length === 0 || items.every((item) => item.count === 0) ? (
        <p className="text-sm text-slate-500">No data for the current filters.</p>
      ) : (
        <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {items.map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 break-words text-slate-300">{item.label}</span>
                <span className="shrink-0 tabular-nums text-slate-400">
                  {item.count.toLocaleString()} <span className="text-slate-600">({item.percentage}%)</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-900">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-200"
                  style={{ width: `${(item.count / largestCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface InsightHubPageProps {
  source?: 'dataset' | 'database';
}

export default function InsightHubPage({ source = 'dataset' }: InsightHubPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDatabaseSource = source === 'database';
  const datasetId = isDatabaseSource ? 'pbncleaner.fetch_pbnopen' : searchParams.get('dataset_id');
  const sheetName = isDatabaseSource ? 'fetch_pbnopen' : searchParams.get('sheet_name') ?? 'Sheet1';
  const [dashboard, setDashboard] = useState<PbnDashboardResponse | null>(null);
  const [ageRange, setAgeRange] = useState<NumericRange | null>(null);
  const [tenureRange, setTenureRange] = useState<NumericRange | null>(null);
  const [selectedEselon, setSelectedEselon] = useState<string[]>([]);
  const [selectedEducation, setSelectedEducation] = useState<string[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string[]>([]);
  const [selectedRumpun, setSelectedRumpun] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const [people, setPeople] = useState<PbnDashboardPeopleResponse['people']>([]);
  const [isPeopleLoading, setIsPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);

  useEffect(() => {
    setDashboard(null);
    setAgeRange(null);
    setTenureRange(null);
    setSelectedEselon([]);
    setSelectedEducation([]);
    setSelectedRegion([]);
    setSelectedUnit([]);
    setSelectedRumpun([]);
    setError(null);
    setShowPeople(false);
    setPeople([]);
  }, [datasetId, sheetName]);

  useEffect(() => {
    if (!datasetId) {
      setDashboard(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      const filters: PbnDashboardFilters = {
        eselon: selectedEselon,
        education: selectedEducation,
        region: selectedRegion,
        unit: selectedUnit,
        rumpun: selectedRumpun,
      };
      if (ageRange) {
        filters.age_min = ageRange.min;
        filters.age_max = ageRange.max;
      }
      if (tenureRange) {
        filters.tenure_min = tenureRange.min;
        filters.tenure_max = tenureRange.max;
      }

      setIsLoading(true);
      setError(null);
      const request = isDatabaseSource
        ? apiClient.getPbnOpenDatabaseDashboard(filters)
        : apiClient.getPbnDashboard(datasetId, sheetName, filters);
      void request
        .then((result) => {
          if (active) setDashboard(result);
        })
        .catch((requestError: Error) => {
          if (active) setError(requestError.message);
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    datasetId,
    sheetName,
    isDatabaseSource,
    ageRange,
    tenureRange,
    selectedEselon,
    selectedEducation,
    selectedRegion,
    selectedUnit,
    selectedRumpun,
  ]);

  useEffect(() => {
    if (!datasetId || !showPeople) return;

    let active = true;
    const filters: PbnDashboardFilters = {
      eselon: selectedEselon,
      education: selectedEducation,
      region: selectedRegion,
      unit: selectedUnit,
      rumpun: selectedRumpun,
    };
    if (ageRange) {
      filters.age_min = ageRange.min;
      filters.age_max = ageRange.max;
    }
    if (tenureRange) {
      filters.tenure_min = tenureRange.min;
      filters.tenure_max = tenureRange.max;
    }

    setIsPeopleLoading(true);
    setPeopleError(null);
    const request = isDatabaseSource
      ? apiClient.getPbnOpenDatabaseDashboardPeople(filters)
      : apiClient.getPbnDashboardPeople(datasetId, sheetName, filters);
    void request
      .then((result) => {
        if (active) setPeople(result.people);
      })
      .catch((requestError: Error) => {
        if (active) setPeopleError(requestError.message);
      })
      .finally(() => {
        if (active) setIsPeopleLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    datasetId,
    sheetName,
    isDatabaseSource,
    showPeople,
    ageRange,
    tenureRange,
    selectedEselon,
    selectedEducation,
    selectedRegion,
    selectedUnit,
    selectedRumpun,
  ]);

  const ageBounds = dashboard?.available_filters.age;
  const tenureBounds = dashboard?.available_filters.tenure;
  const effectiveAgeRange = ageRange ?? ageBounds;
  const effectiveTenureRange = tenureRange ?? tenureBounds;

  return (
    <div className="min-h-screen bg-surface-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-700 bg-surface-800 px-5 pb-4 pt-[4.5rem] xl:pr-[360px] xl:pt-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(isDatabaseSource ? '/' : '/pbn-analytics')}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            {isDatabaseSource ? 'Back to menu' : 'Back to PBN Analytics'}
          </button>
          <div>
            <h1 className="text-lg font-semibold">
              {isDatabaseSource ? 'Insight Hub Beta' : 'PBN Open + Edu + HB Dashboard'}
            </h1>
            {dashboard && <p className="text-xs text-slate-500">{dashboard.sheet_name}</p>}
          </div>
        </div>
        {isLoading && <span className="text-xs text-sky-300">Updating dashboard…</span>}
      </header>

      <main className="mx-auto max-w-screen-2xl space-y-5 p-4 md:p-6">
        {!isDatabaseSource && !datasetId && (
          <section className="card mx-auto max-w-xl p-6 text-center">
            <h2 className="text-lg font-semibold">No cleaned dataset selected</h2>
            <p className="mt-2 text-sm text-slate-400">
              Open PBN Analytics, upload a file, and apply the PBN Open + Edu + HB cleaning method to view its dashboard.
            </p>
            <button
              type="button"
              onClick={() => navigate('/pbn-analytics')}
              className="btn-primary mt-4 justify-center"
            >
              Go to PBN Analytics
            </button>
          </section>
        )}

        {error && (
          <div role="alert" className="rounded-lg border border-rose-700/60 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
            Could not update the dashboard: {error}
          </div>
        )}

        {datasetId && !dashboard && isLoading && (
          <div className="card p-6 text-sm text-slate-400">Loading dashboard data…</div>
        )}

        {dashboard && (
          <>
            <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="card h-fit space-y-3 p-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Filters</h2>
                  <p className="mt-1 text-xs text-slate-500">All charts update when a filter changes.</p>
                </div>
                {ageBounds && effectiveAgeRange && (
                  <RangeFilter
                    title="Age"
                    value={effectiveAgeRange}
                    bounds={ageBounds}
                    onChange={setAgeRange}
                  />
                )}
                {tenureBounds && effectiveTenureRange && (
                  <RangeFilter
                    title="Lama Menjabat (Tahun)"
                    value={effectiveTenureRange}
                    bounds={tenureBounds}
                    onChange={setTenureRange}
                  />
                )}
                <CheckboxFilter
                  title="Eselon"
                  options={dashboard.available_filters.eselon}
                  selected={selectedEselon}
                  onChange={setSelectedEselon}
                />
                <CheckboxFilter
                  title="Pendidikan"
                  options={dashboard.available_filters.education}
                  selected={selectedEducation}
                  onChange={setSelectedEducation}
                />
                <CheckboxFilter
                  title="Region"
                  options={dashboard.available_filters.region}
                  selected={selectedRegion}
                  onChange={setSelectedRegion}
                />
                <CheckboxFilter
                  title="Unit Eselon II"
                  options={dashboard.available_filters.unit}
                  selected={selectedUnit}
                  onChange={setSelectedUnit}
                />
                <CheckboxFilter
                  title="Rumpun"
                  options={dashboard.available_filters.rumpun}
                  selected={selectedRumpun}
                  onChange={setSelectedRumpun}
                />
              </aside>

              <div className="space-y-5">
                <section className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_repeat(auto-fit,minmax(140px,1fr))]">
                  <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-sky-200">Jumlah Pegawai</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-white">
                      {dashboard.total_employees.toLocaleString()}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-400">pegawai sesuai filter</p>
                      <button
                        type="button"
                        onClick={() => setShowPeople(true)}
                        disabled={dashboard.total_employees === 0}
                        className="rounded-md border border-sky-400/40 px-2 py-1 text-xs font-medium text-sky-200 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        View table
                      </button>
                    </div>
                  </div>
                  {dashboard.sex_distribution.map((item) => (
                    <div key={item.label} className="card p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Sex · {item.label}</p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">{item.count.toLocaleString()}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.percentage}% dari hasil filter</p>
                    </div>
                  ))}
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <DistributionChart title="Distribusi Kelompok Usia" items={dashboard.age_group_distribution} />
                  <DistributionChart title="Distribusi per Region" items={dashboard.region_distribution} />
                  <DistributionChart title="Distribusi Tingkat Pendidikan" items={dashboard.education_level_distribution} />
                  <DistributionChart title="Distribusi Rumpun Pendidikan" items={dashboard.education_group_distribution} />
                  <DistributionChart title="Distribusi per Unit Eselon II" items={dashboard.unit_distribution} />
                  <DistributionChart title="Distribusi Agama" items={dashboard.religion_distribution} />
                </section>
              </div>
            </div>
            <p className="text-right text-[11px] text-slate-600">
              {isDatabaseSource
                ? `Dashboard source: ${dashboard.dataset_id}`
                : `Dashboard aggregates the full cleaned dataset. Dataset ID: ${dashboard.dataset_id.slice(0, 8)}…`}
            </p>
          </>
        )}
      </main>
      {showPeople && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowPeople(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-people-title"
            className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-surface-700 bg-surface-800 shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-surface-700 px-4 py-3 sm:px-6">
              <div>
                <h2 id="dashboard-people-title" className="text-base font-semibold text-slate-100">
                  Employees included in dashboard
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {isPeopleLoading ? 'Updating list…' : `${people.length.toLocaleString()} employees match the active filters`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPeople(false)}
                aria-label="Close employee table"
                className="rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-surface-700"
              >
                Close
              </button>
            </header>
            {peopleError && (
              <p role="alert" className="px-4 py-3 text-sm text-rose-300 sm:px-6">
                Could not load employees: {peopleError}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-surface-900 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    {[
                      'index',
                      'Nama',
                      'Eselon',
                      'Jabatan',
                      'Pendidikan Terakhir (Th.)',
                      'Jurusan',
                      'Universitas/Sekolah Tinggi',
                    ].map((column) => (
                      <th key={column} className="border-b border-surface-700 px-3 py-3 font-medium">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={`${person.index}-${person.Nama ?? ''}`} className="border-b border-surface-700/60 even:bg-surface-900/40">
                      <td className="px-3 py-2.5 tabular-nums text-slate-500">{person.index}</td>
                      <td className="px-3 py-2.5 text-slate-200">{person.Nama ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-300">{person.Eselon ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-300">{person.Jabatan ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-300">{person['Pendidikan Terakhir (Th.)'] ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-300">{person.Jurusan ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-300">{person['Universitas/Sekolah Tinggi'] ?? '—'}</td>
                    </tr>
                  ))}
                  {!isPeopleLoading && people.length === 0 && !peopleError && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                        No employees match the active filters.
                      </td>
                    </tr>
                  )}
                  {isPeopleLoading && people.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                        Loading employees…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
