export type FilterOperator = 'contains' | 'equals';

export type TableFilterMap = Record<string, string | string[] | undefined>;

export function filterTableRows<T extends Record<string, unknown>>(
  rows: T[],
  filters: TableFilterMap,
  operator: FilterOperator = 'contains'
): T[] {
  const activeFilters = Object.entries(filters).filter(([, value]) =>
    Array.isArray(value) || (typeof value === 'string' && value.trim() !== '')
  );

  if (activeFilters.length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    activeFilters.every(([column, rawValue]) => {
      const actualValue = row[column];
      const cellText = actualValue == null ? '' : String(actualValue).trim();
      if (Array.isArray(rawValue)) {
        if (rawValue.length === 0) return false;
        return rawValue.some((value) => cellText.toLowerCase() === value.trim().toLowerCase());
      }

      const targetText = String(rawValue ?? '').trim().toLowerCase();
      const normalized = cellText.toLowerCase();

      if (operator === 'equals') {
        return normalized === targetText;
      }

      return normalized.includes(targetText);
    })
  );
}
