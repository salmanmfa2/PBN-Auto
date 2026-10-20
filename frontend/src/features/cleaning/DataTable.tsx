import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import type { DatasetPreview } from '../../types';
import { filterTableRows } from './filterUtils';

interface DataTableProps {
  preview: DatasetPreview;
  filters?: Record<string, string[]>;
  onFilterChange?: (column: string, values: string[]) => void;
  onClearFilter?: (column: string) => void;
  onResetFilters?: () => void;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export function DataTable({ preview, filters = {}, onFilterChange, onClearFilter, onResetFilters }: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(0);
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');

  const columnHelper = createColumnHelper<Record<string, unknown>>();

  const filterValuesByColumn = useMemo(() => {
    const map = new Map<string, string[]>();
    preview.rows.forEach((row) => {
      Object.entries(row).forEach(([key, value]) => {
        const text = value == null ? '' : String(value).trim();
        const values = map.get(key) ?? [];
        if (!values.includes(text)) {
          values.push(text);
          map.set(key, values);
        }
      });
    });
    return map;
  }, [preview.rows]);

  const columns = useMemo(
    () =>
      preview.columns.map((col) =>
        columnHelper.accessor((row) => row[col], {
          id: col,
          header: ({ column }) => (
            <div className="relative flex flex-col gap-2">
              <button
                type="button"
                className="flex items-center gap-1 font-mono text-xs font-medium text-slate-300 hover:text-slate-100 group"
                onClick={() => column.toggleSorting()}
              >
                <span className="truncate max-w-32">{col}</span>
                <span className="text-slate-600 group-hover:text-slate-400 shrink-0">
                  {column.getIsSorted() === 'asc'
                    ? '↑'
                    : column.getIsSorted() === 'desc'
                    ? '↓'
                    : '⇅'}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Filter ${col}`}
                aria-expanded={openFilterColumn === col}
                onClick={() => {
                  setOpenFilterColumn((current) => current === col ? null : col);
                  setFilterSearch('');
                }}
                className={`inline-flex w-fit items-center gap-1 rounded border px-1.5 py-1 text-[10px] ${filters[col] ? 'border-brand-400 text-brand-300' : 'border-surface-600 text-slate-400 hover:text-slate-200'}`}
              >
                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M3 4.75A.75.75 0 013.75 4h12.5a.75.75 0 01.6 1.2L12 11.5v4.75a.75.75 0 01-1.12.65l-2-1.15a.75.75 0 01-.38-.65V11.5L3.15 5.2A.75.75 0 013 4.75z" />
                </svg>
                {filters[col] ? `${filters[col].length} selected` : 'Filter'}
              </button>
              {openFilterColumn === col && (() => {
                const values = filterValuesByColumn.get(col) ?? [];
                const selected = filters[col] ?? values;
                const matchingValues = values.filter((value) =>
                  (value || '(Blanks)').toLocaleLowerCase().includes(filterSearch.trim().toLocaleLowerCase())
                );
                const changeSelection = (next: string[]) => {
                  setPageIndex(0);
                  if (next.length === values.length) {
                    onClearFilter?.(col);
                  } else {
                    onFilterChange?.(col, next);
                  }
                };

                return (
                  <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-md border border-surface-600 bg-surface-800 p-3 text-left shadow-xl" onClick={(event) => event.stopPropagation()}>
                    <input
                      autoFocus
                      type="search"
                      value={filterSearch}
                      onChange={(event) => setFilterSearch(event.target.value)}
                      placeholder={`Search ${col}`}
                      aria-label={`Search filter values for ${col}`}
                      className="mb-2 w-full rounded border border-surface-600 bg-surface-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-brand-400"
                    />
                    <div className="mb-2 flex items-center justify-between border-b border-surface-700 pb-2 text-[11px]">
                      <button
                        type="button"
                        className="text-brand-300 hover:text-brand-200"
                        onClick={() => changeSelection([...new Set([...selected, ...matchingValues])])}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-200"
                        onClick={() => changeSelection(selected.filter((value) => !matchingValues.includes(value)))}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      {matchingValues.map((value) => (
                        <label key={`${col}-${value}`} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-xs text-slate-200 hover:bg-surface-700">
                          <input
                            type="checkbox"
                            checked={selected.includes(value)}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...selected, value]
                                : selected.filter((item) => item !== value);
                              changeSelection(next);
                            }}
                            className="mt-0.5 accent-brand-400"
                          />
                          <span className="break-all">{value || '(Blanks)'}</span>
                        </label>
                      ))}
                      {matchingValues.length === 0 && <p className="px-1 py-3 text-center text-xs text-slate-500">No matching values</p>}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-surface-700 pt-2">
                      <span className="text-[10px] text-slate-500">{selected.length} selected</span>
                      <button
                        type="button"
                        onClick={() => setOpenFilterColumn(null)}
                        className="rounded bg-brand-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-400"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          ),
          cell: (info) => {
            const val = info.getValue();
            if (val == null) return <span className="text-slate-600 italic">null</span>;
            return (
              <span className="font-mono text-xs text-slate-300 truncate block max-w-48">
                {String(val)}
              </span>
            );
          },
        })
      ),
    [preview.columns, filterValuesByColumn, filters, onFilterChange, onClearFilter, openFilterColumn, filterSearch]
  );

  const filteredData = useMemo(() => {
    return filterTableRows(preview.rows, filters, 'contains');
  }, [preview.rows, filters]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter, pagination: { pageIndex, pageSize } },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: (updater) => {
      const newPagination = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(newPagination.pageIndex);
      setPageSize(newPagination.pageSize);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <svg className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="input pl-8 text-xs"
            placeholder="Search all columns…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Rows per page:</span>
          <select
            className="bg-surface-700 border border-surface-600 rounded px-2 py-1 text-slate-300 text-xs"
            value={pageSize}
            onChange={(e) => {
              table.setPageSize(Number(e.target.value));
            }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        {onResetFilters && Object.keys(filters).length > 0 && (
          <button
            type="button"
            onClick={onResetFilters}
            className="btn-ghost text-xs"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-slate-500">
          {table.getFilteredRowModel().rows.length.toLocaleString()} rows
          {globalFilter && ` matching "${globalFilter}"`}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-surface-700">
        <table className="w-full text-left border-collapse min-w-max">
          <thead className="sticky top-0 z-10 bg-surface-800 border-b border-surface-700">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="px-3 py-2.5 text-xs text-slate-500 font-medium w-12 shrink-0">#</th>
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2.5 whitespace-nowrap">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className={`border-b border-surface-700/50 hover:bg-surface-700/30 transition-colors ${
                  i % 2 === 0 ? '' : 'bg-surface-800/30'
                }`}
              >
                <td className="px-3 py-2 text-xs text-slate-600 font-mono">
                  {table.getState().pagination.pageIndex * pageSize + i + 1}
                </td>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 max-w-xs">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={preview.columns.length + 1}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  No rows match your current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <button
            className="btn-ghost text-xs px-2 py-1"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            «
          </button>
          <button
            className="btn-ghost text-xs px-2 py-1"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            ‹ Prev
          </button>
          <span className="px-3">
            Page{' '}
            <strong className="text-slate-200">
              {table.getState().pagination.pageIndex + 1}
            </strong>{' '}
            of{' '}
            <strong className="text-slate-200">{table.getPageCount()}</strong>
          </span>
          <button
            className="btn-ghost text-xs px-2 py-1"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next ›
          </button>
          <button
            className="btn-ghost text-xs px-2 py-1"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            »
          </button>
        </div>
        <span className="text-slate-500">
          Showing preview of first 500 rows
        </span>
      </div>
    </div>
  );
}
