const SAVE_VERSION = 2;
const DB_NAME = 'lew_saves';
const DB_VERSION = 1;
const STORE_NAME = 'saves';
const KEY_AUTOSAVE = 'autosave';
const SLOT_PREFIX = 'slot_';
const MAX_SLOTS = 3;
const KEY_API = 'lew_api_key';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  }));
}

function idbPut(key, value) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  }));
}

function idbDelete(key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

function makeSaveRecord(gameState, label) {
  return {
    version: SAVE_VERSION,
    label,
    savedAt: new Date().toISOString(),
    gameState,
  };
}

function migrateState(record) {
  if (!record || !record.gameState) return record;
  const gs = record.gameState;

  if (!record.version || record.version < 2) {
    for (const t of Object.values(gs.territories || {})) {
      if (!t.buildings) t.buildings = {};
    }
    for (const a of Object.values(gs.armies || {})) {
      if (a.isMercenary === undefined) a.isMercenary = false;
    }
    record.version = SAVE_VERSION;
  }

  return record;
}

export class SaveManager {
  async autoSave(gameState) {
    const label = `Auto — Turn ${gameState.meta.turn}`;
    return idbPut(KEY_AUTOSAVE, makeSaveRecord(gameState, label));
  }

  async loadAutoSave() {
    const record = (await idbGet(KEY_AUTOSAVE)) ?? null;
    return migrateState(record);
  }

  async deleteAutoSave() {
    return idbDelete(KEY_AUTOSAVE);
  }

  async saveToSlot(slot, gameState, label) {
    if (slot < 1 || slot > MAX_SLOTS) return false;
    const finalLabel = label || `Slot ${slot} — Turn ${gameState.meta.turn}`;
    return idbPut(`${SLOT_PREFIX}${slot}`, makeSaveRecord(gameState, finalLabel));
  }

  async loadFromSlot(slot) {
    const record = (await idbGet(`${SLOT_PREFIX}${slot}`)) ?? null;
    return migrateState(record);
  }

  async deleteSlot(slot) {
    return idbDelete(`${SLOT_PREFIX}${slot}`);
  }

  async listSaves() {
    const saves = [];

    const auto = await this.loadAutoSave();
    if (auto) {
      saves.push({
        type: 'autosave',
        slot: 0,
        label: auto.label,
        turn: auto.gameState.meta.turn,
        savedAt: auto.savedAt,
      });
    }

    for (let i = 1; i <= MAX_SLOTS; i++) {
      const record = await this.loadFromSlot(i);
      if (record) {
        saves.push({
          type: 'slot',
          slot: i,
          label: record.label,
          turn: record.gameState.meta.turn,
          savedAt: record.savedAt,
        });
      } else {
        saves.push({ type: 'slot', slot: i, label: null, turn: null, savedAt: null });
      }
    }

    return saves;
  }

  async hasAnySave() {
    return (await this.loadAutoSave()) !== null;
  }

  exportToFile(gameState) {
    const record = makeSaveRecord(gameState, `Export — Turn ${gameState.meta.turn}`);
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `empire-wars-turn-${gameState.meta.turn}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const record = JSON.parse(reader.result);
          if (!record || !record.gameState || !record.gameState.meta) {
            reject(new Error('Invalid save file'));
            return;
          }
          resolve(migrateState(record));
        } catch {
          reject(new Error('Invalid save file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  saveApiKey(key) {
    localStorage.setItem(KEY_API, key);
  }

  loadApiKey() {
    return localStorage.getItem(KEY_API) || '';
  }
}
