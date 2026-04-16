
/**
 * IndexedDB Utility for Inventory Data Caching
 * Optimized for large datasets (80,000+ SKUs)
 */

const DB_NAME = 'InventoryDB';
const DB_VERSION = 2;
const STORES = {
    MONTHLY_DATA: 'monthly_data',
    UPLOADED_DATA: 'uploaded_data',
    METADATA: 'metadata'
};

export const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            
            // Create stores if they don't exist
            if (!db.objectStoreNames.contains(STORES.MONTHLY_DATA)) {
                db.createObjectStore(STORES.MONTHLY_DATA);
            }
            if (!db.objectStoreNames.contains(STORES.UPLOADED_DATA)) {
                db.createObjectStore(STORES.UPLOADED_DATA);
            }
            if (!db.objectStoreNames.contains(STORES.METADATA)) {
                db.createObjectStore(STORES.METADATA);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const saveToDB = async (storeName: string, key: string, data: any) => {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data, key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getFromDB = async <T>(storeName: string, key: string): Promise<T | null> => {
    const db = await openDB();
    return new Promise<T | null>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve((request.result as T) || null);
        request.onerror = () => reject(request.error);
    });
};

export const clearDBStore = async (storeName: string) => {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// Typed helpers for specific data
export const cacheMonthlyData = async (data: any, date: string, updatedAt: string) => {
    await saveToDB(STORES.MONTHLY_DATA, 'latest', data);
    await saveToDB(STORES.METADATA, 'monthly_date', date);
    await saveToDB(STORES.METADATA, 'monthly_updated_at', updatedAt);
};

export const getCachedMonthlyData = async () => {
    const data = await getFromDB<any>(STORES.MONTHLY_DATA, 'latest');
    const date = await getFromDB<string>(STORES.METADATA, 'monthly_date');
    const updatedAt = await getFromDB<string>(STORES.METADATA, 'monthly_updated_at');
    if (data && date) return { data, date, updatedAt };
    return null;
};

export const cacheUploadedData = async (data: any[], initialParams: any) => {
    await saveToDB(STORES.UPLOADED_DATA, 'latest', data);
    await saveToDB(STORES.METADATA, 'upload_params', initialParams);
};

export const getCachedUploadedData = async () => {
    const data = await getFromDB<any[]>(STORES.UPLOADED_DATA, 'latest');
    const params = await getFromDB<any>(STORES.METADATA, 'upload_params');
    if (data && params) return { data, params };
    return null;
};

export const clearCachedUploadedData = async () => {
    await clearDBStore(STORES.UPLOADED_DATA);
    await saveToDB(STORES.METADATA, 'upload_params', null);
};

export const clearAllAppCache = async () => {
    await Promise.all([
        clearDBStore(STORES.MONTHLY_DATA),
        clearDBStore(STORES.UPLOADED_DATA),
        clearDBStore(STORES.METADATA)
    ]);
};
