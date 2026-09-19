/**
 * Local-first storage: every measurement the engine takes stays on the user's device in
 * IndexedDB. Nothing is uploaded anywhere.
 */

export type LocalIncident = {
  externalId: string;
  kind: 'incident' | 'maintenance';
  title: string;
  status: string;
  statusRaw: string;
  impact: string;
  startedAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
  endsAt?: string | null;
  description: string | null;
  url: string | null;
  components: string[];
};

export type LocalServicePayload = {
  slug: string;
  officialStatus: string;
  officialStatusRaw: string | null;
  officialSourceKind: string;
  officialSourceUrl: string | null;
  officialCheckedAt: string | null;
  officialConfidence: string;
  officialErrorMessage: string | null;
  connectivityStatus: string;
  connectivityCheckedAt: string | null;
  latency: { http: number | null; https: number | null; dns: number | null; tcp: number | null; icmp: number | null };
  components: {
    externalId: string;
    name: string;
    group: string | null;
    status: string;
    statusRaw: string;
    position: number;
  }[];
  incidents: LocalIncident[];
  maintenances: LocalIncident[];
  history: { checkedAt: string; status: string; latencyMs: number | null }[];
  notes: string[];
  error: string | null;
  latencySource: 'device' | 'server';
};

export type LocalServiceRecord = {
  slug: string;
  updatedAt: number;
  payload: LocalServicePayload;
};

export type LocalEvent = {
  at: string;
  slug: string;
  kind: string;
  message: string;
  from: string | null;
  to: string | null;
};

const DB_NAME = 'wakz-local';
const DB_VERSION = 1;
const SERVICES = 'services';
const META = 'meta';
const EVENTS = 'events';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SERVICES)) db.createObjectStore(SERVICES, { keyPath: 'slug' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, action: (objectStore: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = action(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function putServiceRecord(record: LocalServiceRecord): Promise<void> {
  await run<void>(SERVICES, 'readwrite', (store) => store.put(record));
}

export async function getServiceRecord(slug: string): Promise<LocalServiceRecord | null> {
  const record = await run<LocalServiceRecord | undefined>(SERVICES, 'readonly', (store) => store.get(slug));
  return record ?? null;
}

export async function getAllServiceRecords(): Promise<LocalServiceRecord[]> {
  return (await run<LocalServiceRecord[]>(SERVICES, 'readonly', (store) => store.getAll())) ?? [];
}

export async function putMeta(key: string, value: unknown): Promise<void> {
  await run<void>(META, 'readwrite', (store) => store.put({ key, value }));
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const row = await run<{ key: string; value: T } | undefined>(META, 'readonly', (store) => store.get(key));
  return row ? row.value : null;
}

export async function addEvent(event: LocalEvent): Promise<void> {
  await run<void>(EVENTS, 'readwrite', (store) => store.add(event));
}

export async function listEvents(limit = 50): Promise<LocalEvent[]> {
  const all = (await run<LocalEvent[]>(EVENTS, 'readonly', (store) => store.getAll())) ?? [];
  return all.slice(-limit).reverse();
}

export async function clearLocalData(): Promise<void> {
  await run<void>(SERVICES, 'readwrite', (store) => store.clear());
  await run<void>(EVENTS, 'readwrite', (store) => store.clear());
  await putMeta('lastRun', null);
}
