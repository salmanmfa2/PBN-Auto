import { useCallback, useEffect, useRef, useState } from 'react';
import {
  countMutationTalentFinderEmployees,
  getMutationTalentFinderFilterOptions,
  searchMutationTalentFinderEmployees,
} from '../services/api';
import type {
  MutationTalentFinderFilterOptions,
  MutationTalentFinderOption,
  MutationTalentFinderSortField,
  MutationTalentFinderSearchResponse,
} from '../types';

const PAGE_SIZE = 50;
const TALENT_FINDER_COLUMNS: { id: MutationTalentFinderSortField; label: string }[] = [
  { id: 'nama', label: 'Nama' },
  { id: 'eselon', label: 'Eselon' },
  { id: 'usia', label: 'Usia' },
  { id: 'jabatan', label: 'Jabatan' },
  { id: 'pendidikan', label: 'Pendidikan' },
  { id: 'jurusan', label: 'Jurusan' },
  { id: 'universitas', label: 'Universitas/Sekolah Tinggi' },
  { id: 'lama_eselon', label: 'Lama Eselon' },
  { id: 'lama_jabatan', label: 'Lama Jabatan' },
  { id: 'homebase', label: 'Homebase' },
];

function CheckboxFilter({
  title,
  options,
  selectedIds,
  loading,
  onChange,
}: {
  title: string;
  options: MutationTalentFinderOption[];
  selectedIds: number[];
  loading: boolean;
  onChange: (ids: number[]) => void;
}) {
  const toggleOption = (id: number, checked: boolean) => {
    onChange(
      checked
        ? [...new Set([...selectedIds, id])]
        : selectedIds.filter((selectedId) => selectedId !== id),
    );
  };

  return (
    <details className="relative min-w-52">
      <summary className="cursor-pointer list-none rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-slate-200">
        {title}
        {selectedIds.length > 0 && (
          <span className="ml-2 rounded-full bg-brand-500/20 px-2 py-0.5 text-xs text-brand-200">
            {selectedIds.length}
          </span>
        )}
      </summary>
      <div className="absolute z-20 mt-2 max-h-72 w-full min-w-64 overflow-y-auto rounded-lg border border-surface-700 bg-surface-900 p-2 shadow-xl">
        {loading ? (
          <p className="px-2 py-2 text-xs text-slate-400">Memuat opsi…</p>
        ) : options.length === 0 ? (
          <p className="px-2 py-2 text-xs text-slate-400">Opsi tidak tersedia.</p>
        ) : (
          options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-300 hover:bg-surface-800"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(option.id)}
                onChange={(event) => toggleOption(option.id, event.target.checked)}
                className="accent-brand-400"
              />
              <span>{option.label}</span>
            </label>
          ))
        )}
      </div>
    </details>
  );
}

export default function MutationTalentFinder() {
  const [filterOptions, setFilterOptions] = useState<MutationTalentFinderFilterOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [eselonIds, setEselonIds] = useState<number[]>([]);
  const [rumpunIds, setRumpunIds] = useState<number[]>([]);
  const [matchedCount, setMatchedCount] = useState<number | null>(null);
  const [results, setResults] = useState<MutationTalentFinderSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [countLoading, setCountLoading] = useState(false);
  const [sortBy, setSortBy] = useState<MutationTalentFinderSortField>('nama');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchError, setSearchError] = useState<string | null>(null);
  const countRequestId = useRef(0);
  const searchRequestId = useRef(0);

  useEffect(() => {
    let active = true;
    setOptionsLoading(true);
    setOptionsError(null);
    void getMutationTalentFinderFilterOptions()
      .then((options) => {
        if (active) setFilterOptions(options);
      })
      .catch((error: unknown) => {
        if (active) {
          setOptionsError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const resetQuery = useCallback(() => {
    countRequestId.current += 1;
    searchRequestId.current += 1;
    setMatchedCount(null);
    setResults(null);
    setCountLoading(false);
    setLoading(false);
    setSearchError(null);
  }, []);

  const countMatches = useCallback(async () => {
    const requestId = ++countRequestId.current;
    searchRequestId.current += 1;
    setCountLoading(true);
    setMatchedCount(null);
    setResults(null);
    setSearchError(null);
    try {
      const response = await countMutationTalentFinderEmployees({
        eselon_ids: eselonIds,
        name: name.trim(),
        rumpun_ids: rumpunIds,
        page: 1,
        page_size: PAGE_SIZE,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (requestId === countRequestId.current) setMatchedCount(response.total);
    } catch (error) {
      if (requestId === countRequestId.current) {
        setSearchError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (requestId === countRequestId.current) setCountLoading(false);
    }
  }, [eselonIds, name, rumpunIds, sortBy, sortOrder]);

  const loadResults = useCallback(async (
    page: number,
    requestedSortBy = sortBy,
    requestedSortOrder = sortOrder,
  ) => {
    const requestId = ++searchRequestId.current;
    setLoading(true);
    setSearchError(null);
    try {
      const response = await searchMutationTalentFinderEmployees({
        eselon_ids: eselonIds,
        name: name.trim(),
        rumpun_ids: rumpunIds,
        page,
        page_size: PAGE_SIZE,
        sort_by: requestedSortBy,
        sort_order: requestedSortOrder,
      });
      if (requestId === searchRequestId.current) {
        setResults(response);
        setMatchedCount(response.total);
      }
    } catch (error) {
      if (requestId === searchRequestId.current) {
        setResults(null);
        setSearchError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (requestId === searchRequestId.current) setLoading(false);
    }
  }, [eselonIds, name, rumpunIds, sortBy, sortOrder]);

  const changeSort = (field: MutationTalentFinderSortField) => {
    const nextOrder = field === sortBy
      ? sortOrder === 'asc' ? 'desc' : 'asc'
      : 'asc';
    setSortBy(field);
    setSortOrder(nextOrder);
    if (results) void loadResults(results.page, field, nextOrder);
  };

  const pageCount = results
    ? Math.max(1, Math.ceil(results.total / results.page_size))
    : 1;

  return (
    <section className="space-y-4 rounded-xl border border-surface-700 bg-surface-900 p-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-100">Talent Finder</h3>
        <p className="mt-1 text-sm text-slate-400">
          Cari pegawai langsung dari database. Hasil hanya dimuat setelah pencarian.
        </p>
      </div>

      {optionsError && (
        <div role="alert" className="rounded-lg border border-rose-700/50 bg-rose-950/20 p-3 text-sm text-rose-200">
          {optionsError}
        </div>
      )}
      {searchError && (
        <div role="alert" className="rounded-lg border border-rose-700/50 bg-rose-950/20 p-3 text-sm text-rose-200">
          {searchError}
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void countMatches();
        }}
      >
        <label className="min-w-60 flex-1 text-sm text-slate-300">
          Nama
          <input
            type="search"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              resetQuery();
            }}
            maxLength={100}
            placeholder="Cari nama pegawai"
            className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </label>
        <CheckboxFilter
          title="Eselon"
          options={filterOptions?.eselon ?? []}
          selectedIds={eselonIds}
          loading={optionsLoading}
          onChange={(ids) => {
            setEselonIds(ids);
            resetQuery();
          }}
        />
        <CheckboxFilter
          title="Rumpun"
          options={filterOptions?.rumpun ?? []}
          selectedIds={rumpunIds}
          loading={optionsLoading}
          onChange={(ids) => {
            setRumpunIds(ids);
            resetQuery();
          }}
        />
        <button
          type="submit"
          disabled={loading || countLoading || optionsLoading}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {countLoading ? 'Menghitung…' : 'Hitung pegawai cocok'}
        </button>
      </form>

      {countLoading ? (
        <p role="status" className="text-sm text-slate-400">Menghitung pegawai yang cocok…</p>
      ) : loading ? (
        <p role="status" className="text-sm text-slate-400">Memuat pegawai yang cocok…</p>
      ) : matchedCount === null ? (
        <p className="rounded-lg border border-surface-700 bg-surface-950 p-4 text-sm text-slate-400">
          Atur filter, lalu hitung jumlah pegawai yang cocok.
        </p>
      ) : matchedCount === 0 ? (
        <p className="rounded-lg border border-surface-700 bg-surface-950 p-4 text-sm text-slate-400">
          Tidak ada pegawai yang cocok dengan filter.
        </p>
      ) : !results ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-500/30 bg-brand-500/10 p-4">
          <p className="text-sm text-slate-200">
            {matchedCount.toLocaleString('id-ID')} pegawai cocok.
          </p>
          <button
            type="button"
            onClick={() => void loadResults(1)}
            disabled={loading}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Muat hasil
          </button>
        </section>
      ) : results.employees.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
            <p>{results.total.toLocaleString('id-ID')} pegawai ditemukan</p>
            <p>Halaman {results.page} dari {pageCount}</p>
          </div>
          <div className="max-h-[560px] overflow-auto rounded-lg border border-surface-700">
            <table className="min-w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-surface-800">
                <tr>
                  {TALENT_FINDER_COLUMNS.map((column) => (
                    <th
                      key={column.id}
                      aria-sort={sortBy === column.id
                        ? sortOrder === 'asc' ? 'ascending' : 'descending'
                        : 'none'}
                      className="whitespace-nowrap border-b border-r border-surface-700 px-3 py-2 text-left font-semibold text-slate-300 last:border-r-0"
                    >
                      <button
                        type="button"
                        onClick={() => changeSort(column.id)}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        {column.label}
                        <span aria-hidden="true" className="text-brand-300">
                          {sortBy === column.id ? sortOrder === 'asc' ? '↑' : '↓' : '↕'}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.employees.map((employee) => (
                  <tr key={employee.employee_id} className="odd:bg-surface-900 even:bg-surface-950/40">
                    <td className="min-w-56 border-b border-r border-surface-700 px-3 py-2 text-slate-200">
                      {employee.nama || '—'}
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-surface-700 px-3 py-2 text-slate-300">
                      {employee.eselon || '—'}
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-surface-700 px-3 py-2 text-slate-300">
                      {employee.usia ?? '—'}
                    </td>
                    <td className="min-w-56 border-b border-r border-surface-700 px-3 py-2 text-slate-300">
                      {employee.jabatan || '—'}
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-surface-700 px-3 py-2 text-slate-300">
                      {employee.pendidikan || '—'}
                    </td>
                    <td className="min-w-48 border-b border-r border-surface-700 px-3 py-2 text-slate-300">
                      {employee.jurusan || '—'}
                    </td>
                    <td className="min-w-56 border-b border-r border-surface-700 px-3 py-2 text-slate-300">
                      {employee.universitas || '—'}
                    </td>
                    <td className="whitespace-nowrap border-b border-surface-700 px-3 py-2 text-slate-300">
                      {employee.lama_eselon || '—'}
                    </td>
                    <td className="whitespace-nowrap border-b border-surface-700 px-3 py-2 text-slate-300">
                      {employee.lama_jabatan || '—'}
                    </td>
                    <td className="whitespace-nowrap border-b border-surface-700 px-3 py-2 text-slate-300">
                      {employee.homebase || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void loadResults(results.page - 1)}
              disabled={loading || results.page <= 1}
              className="rounded-lg border border-surface-700 px-3 py-2 text-sm text-slate-300 hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              onClick={() => void loadResults(results.page + 1)}
              disabled={loading || results.page >= pageCount}
              className="rounded-lg border border-surface-700 px-3 py-2 text-sm text-slate-300 hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-surface-700 bg-surface-950 p-4 text-sm text-slate-400">
          Tidak ada pegawai yang cocok dengan filter.
        </p>
      )}
    </section>
  );
}
