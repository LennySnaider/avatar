
import { AvatarPreset, FaceIdentityData } from '../types';

const DB_NAME = 'AvatarForgeDB';
const STORE_NAME = 'presets';
const FACE_BANK_STORE = 'faceIdentityBank'; // NEW: Face Identity Bank store
const DB_VERSION = 2; // Bumped version for migration

// Face Bank Entry - Links face identity to an avatar
export interface FaceBankEntry {
  id: string; // Same as avatar preset ID
  avatarName: string;
  identityData: FaceIdentityData;
  thumbnailUrl?: string; // Optional face thumbnail
  createdAt: number;
  lastUsedAt: number;
}

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create presets store if not exists
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }

      // NEW: Create Face Identity Bank store
      if (!db.objectStoreNames.contains(FACE_BANK_STORE)) {
        const faceStore = db.createObjectStore(FACE_BANK_STORE, { keyPath: 'id' });
        faceStore.createIndex('avatarName', 'avatarName', { unique: false });
        faceStore.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const savePresetToDB = async (preset: AvatarPreset): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(preset);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllPresetsFromDB = async (): Promise<AvatarPreset[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
        // Sort by creation date descending
        const results = request.result as AvatarPreset[];
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
};

export const deletePresetFromDB = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// ============================================================================
// FACE IDENTITY BANK - Persistent storage for facial identity data
// Enables consistency across multiple generation sessions
// ============================================================================

/**
 * Save face identity to the Face Bank
 * Call this after analyzing a face to persist the identity data
 */
export const saveFaceIdentityToDB = async (entry: FaceBankEntry): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FACE_BANK_STORE, 'readwrite');
    const store = transaction.objectStore(FACE_BANK_STORE);
    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get face identity from the Face Bank by avatar ID
 */
export const getFaceIdentityFromDB = async (avatarId: string): Promise<FaceBankEntry | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FACE_BANK_STORE, 'readonly');
    const store = transaction.objectStore(FACE_BANK_STORE);
    const request = store.get(avatarId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get all face identities from the Face Bank
 */
export const getAllFaceIdentitiesFromDB = async (): Promise<FaceBankEntry[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FACE_BANK_STORE, 'readonly');
    const store = transaction.objectStore(FACE_BANK_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result as FaceBankEntry[];
      // Sort by last used (most recent first)
      results.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Delete face identity from the Face Bank
 */
export const deleteFaceIdentityFromDB = async (avatarId: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FACE_BANK_STORE, 'readwrite');
    const store = transaction.objectStore(FACE_BANK_STORE);
    const request = store.delete(avatarId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Update the lastUsedAt timestamp when generating with this identity
 */
export const touchFaceIdentity = async (avatarId: string): Promise<void> => {
  const db = await openDB();
  return new Promise(async (resolve, reject) => {
    try {
      const entry = await getFaceIdentityFromDB(avatarId);
      if (entry) {
        entry.lastUsedAt = Date.now();
        await saveFaceIdentityToDB(entry);
      }
      resolve();
    } catch (e) {
      reject(e);
    }
  });
};

/**
 * Sync face identity data from an AvatarPreset
 * Call this when saving a preset that has faceIdentityData
 */
export const syncFaceIdentityFromPreset = async (preset: AvatarPreset): Promise<void> => {
  if (!preset.faceIdentityData) return;

  const entry: FaceBankEntry = {
    id: preset.id,
    avatarName: preset.name,
    identityData: preset.faceIdentityData,
    thumbnailUrl: preset.faceRefImage?.url || preset.images[0]?.url,
    createdAt: preset.createdAt,
    lastUsedAt: Date.now()
  };

  await saveFaceIdentityToDB(entry);
};
