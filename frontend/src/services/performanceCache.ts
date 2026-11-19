const DATABASE_NAME = 'pbncleaner-performance-cache';
const DATABASE_VERSION = 1;
const CACHE_STORE = 'entries';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES_PER_USER = 60;

interface CacheEntry {
  key: string;
  userKey: string;
  savedAt: number;
  value: unknown;
}

export interface PerformanceRecordsViewState {
  activeTab: 'overview' | 'units' | 'employees';
  isRecordsLiteView: boolean;
  recordPage: number;
  recordSearch: string;
  recordFilterDrafts: Record<string, string>;
  recordFilters: Record<string, string>;
  recordSortKey: string;
  recordSortDirection: 'asc' | 'desc';
  selectedPeriod: string | null;
}

export interface PerformanceRecordsViewStateRead {
  value: PerformanceRecordsViewState | null;
  error: string | null;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }
  if (databasePromise) return databasePromise;

  const pendingDatabase = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CACHE_STORE)) {
        const store = database.createObjectStore(CACHE_STORE, { keyPath: 'key' });
        store.createIndex('by-user', 'userKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error('Could not open the performance browser cache.'));
    };
    request.onblocked = () => {
      reject(new Error('The performance browser cache is blocked by another tab.'));
    };
  });
  databasePromise = pendingDatabase;
  void pendingDatabase.catch(() => {
    if (databasePromise === pendingDatabase) databasePromise = null;
  });
  return pendingDatabase;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error('Could not access the performance browser cache.'));
    };
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('The performance browser cache transaction failed.'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('The performance browser cache transaction was aborted.'));
    };
  });
}

export async function readPerformanceCache<T>(
  userKey: string,
  key: string,
): Promise<T | null> {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, 'readonly');
  const transactionDone = transactionResult(transaction);
  const request = transaction.objectStore(CACHE_STORE).get(key) as IDBRequest<
    CacheEntry | undefined
  >;
  const entry = await requestResult(request);
  await transactionDone;
  if (!entry || entry.userKey !== userKey) return null;
  if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
    await deletePerformanceCacheEntry(key);
    return null;
  }
  return entry.value as T;
}

export async function writePerformanceCache(
  userKey: string,
  key: string,
  value: unknown,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, 'readwrite');
  const transactionDone = transactionResult(transaction);
  const store = transaction.objectStore(CACHE_STORE);
  store.put({ key, userKey, savedAt: Date.now(), value } satisfies CacheEntry);
  const entriesRequest = store.index('by-user').getAll(
    IDBKeyRange.only(userKey),
  ) as IDBRequest<CacheEntry[]>;
  entriesRequest.onsuccess = () => {
    const entries = entriesRequest.result
      .filter((entry) => Date.now() - entry.savedAt <= CACHE_TTL_MS)
      .sort((left, right) => right.savedAt - left.savedAt);
    for (const expiredEntry of entriesRequest.result) {
      if (Date.now() - expiredEntry.savedAt > CACHE_TTL_MS) {
        store.delete(expiredEntry.key);
      }
    }
    for (const excessEntry of entries.slice(MAX_CACHE_ENTRIES_PER_USER)) {
      store.delete(excessEntry.key);
    }
  };
  await transactionDone;
}

export async function clearPerformanceCache(userKey: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, 'readwrite');
  const transactionDone = transactionResult(transaction);
  const request = transaction
    .objectStore(CACHE_STORE)
    .index('by-user')
    .openKeyCursor(IDBKeyRange.only(userKey));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    transaction.objectStore(CACHE_STORE).delete(cursor.primaryKey);
    cursor.continue();
  };
  request.onerror = () => {
    transaction.abort();
  };
  await transactionDone;
}

function deletePerformanceCacheEntry(key: string): Promise<void> {
  return openDatabase().then((database) => {
    const transaction = database.transaction(CACHE_STORE, 'readwrite');
    const transactionDone = transactionResult(transaction);
    transaction.objectStore(CACHE_STORE).delete(key);
    return transactionDone;
  });
}

function isStringMap(value: unknown): value is Record<string, string> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === 'string');
}

function makeViewStateStorageKey(userKey: string): string {
  return `pbncleaner.performance.records-view.v1.${encodeURIComponent(userKey)}`;
}

export function readPerformanceRecordsViewState(
  userKey: string,
): PerformanceRecordsViewStateRead {
  if (typeof window === 'undefined') return { value: null, error: null };
  try {
    const serialized = window.localStorage.getItem(makeViewStateStorageKey(userKey));
    if (serialized === null) return { value: null, error: null };
    const parsed: unknown = JSON.parse(serialized);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        value: null,
        error: 'Saved employee-table settings are invalid and were ignored.',
      };
    }
    const state = parsed as Record<string, unknown>;
    const direction = state.recordSortDirection === 'desc' ? 'desc' : 'asc';
    const activeTab = state.activeTab === 'units' || state.activeTab === 'employees'
      ? state.activeTab
      : 'overview';
    return {
      value: {
        activeTab,
        isRecordsLiteView: typeof state.isRecordsLiteView === 'boolean'
          ? state.isRecordsLiteView
          : false,
        recordPage: typeof state.recordPage === 'number'
          && Number.isInteger(state.recordPage)
          && state.recordPage > 0
          ? state.recordPage
          : 1,
        recordSearch: typeof state.recordSearch === 'string' ? state.recordSearch : '',
        recordFilterDrafts: isStringMap(state.recordFilterDrafts)
          ? state.recordFilterDrafts
          : {},
        recordFilters: isStringMap(state.recordFilters) ? state.recordFilters : {},
        recordSortKey: typeof state.recordSortKey === 'string'
          ? state.recordSortKey
          : 'nama',
        recordSortDirection: direction,
        selectedPeriod: typeof state.selectedPeriod === 'string'
          ? state.selectedPeriod
          : null,
      },
      error: null,
    };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error
        ? `Could not read saved employee-table settings: ${error.message}`
        : 'Could not read saved employee-table settings.',
    };
  }
}

export function writePerformanceRecordsViewState(
  userKey: string,
  state: PerformanceRecordsViewState,
): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    makeViewStateStorageKey(userKey),
    JSON.stringify(state),
  );
}
