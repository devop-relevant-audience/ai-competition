const SAVE_VERSION = 1;
const KEY_AUTOSAVE = 'lew_autosave';
const KEY_API = 'lew_api_key';
const SLOT_PREFIX = 'lew_save_';
const MAX_SLOTS = 3;

function makeSaveRecord(gameState, label) {
  return {
    version: SAVE_VERSION,
    label,
    savedAt: new Date().toISOString(),
    gameState,
  };
}

function tryParse(json) {
  try {
    const record = JSON.parse(json);
    if (!record || !record.gameState || !record.gameState.meta) return null;
    return record;
  } catch {
    return null;
  }
}

function writeToStorage(key, record) {
  try {
    localStorage.setItem(key, JSON.stringify(record));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      const trimmed = { ...record, gameState: { ...record.gameState, turnHistory: record.gameState.turnHistory.slice(-10) } };
      try {
        localStorage.setItem(key, JSON.stringify(trimmed));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export class SaveManager {
  autoSave(gameState) {
    const label = `Auto — Turn ${gameState.meta.turn}`;
    return writeToStorage(KEY_AUTOSAVE, makeSaveRecord(gameState, label));
  }

  loadAutoSave() {
    const raw = localStorage.getItem(KEY_AUTOSAVE);
    if (!raw) return null;
    return tryParse(raw);
  }

  deleteAutoSave() {
    localStorage.removeItem(KEY_AUTOSAVE);
  }

  saveToSlot(slot, gameState, label) {
    if (slot < 1 || slot > MAX_SLOTS) return false;
    const finalLabel = label || `Slot ${slot} — Turn ${gameState.meta.turn}`;
    return writeToStorage(`${SLOT_PREFIX}${slot}`, makeSaveRecord(gameState, finalLabel));
  }

  loadFromSlot(slot) {
    const raw = localStorage.getItem(`${SLOT_PREFIX}${slot}`);
    if (!raw) return null;
    return tryParse(raw);
  }

  deleteSlot(slot) {
    localStorage.removeItem(`${SLOT_PREFIX}${slot}`);
  }

  listSaves() {
    const saves = [];

    const auto = this.loadAutoSave();
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
      const record = this.loadFromSlot(i);
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

  hasAnySave() {
    return localStorage.getItem(KEY_AUTOSAVE) !== null;
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
        const record = tryParse(reader.result);
        if (!record) {
          reject(new Error('Invalid save file'));
          return;
        }
        resolve(record);
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
