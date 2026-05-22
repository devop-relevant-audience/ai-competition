const DB_NAME = 'lew_analytics';
const DB_VERSION = 1;
const STORE_REPORTS = 'game_reports';

function openAnalyticsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_REPORTS)) {
        const store = db.createObjectStore(STORE_REPORTS, { keyPath: 'gameId' });
        store.createIndex('presetKey', 'presetKey', { unique: false });
        store.createIndex('reportCreatedAt', 'reportCreatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbTx(storeName, mode, fn) {
  return openAnalyticsDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);
    if (result && typeof result.onsuccess !== 'undefined') {
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    } else {
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    }
  }));
}

export class MetaStatsStore {
  async saveReport(report) {
    return idbTx(STORE_REPORTS, 'readwrite', store => store.put(report));
  }

  async getReport(gameId) {
    return idbTx(STORE_REPORTS, 'readonly', store => store.get(gameId));
  }

  async getAllReports() {
    return idbTx(STORE_REPORTS, 'readonly', store => store.getAll());
  }

  async getReportCount() {
    return idbTx(STORE_REPORTS, 'readonly', store => store.count());
  }

  async deleteReport(gameId) {
    return idbTx(STORE_REPORTS, 'readwrite', store => store.delete(gameId));
  }

  async clearAll() {
    return idbTx(STORE_REPORTS, 'readwrite', store => store.clear());
  }

  /**
   * Returns aggregate stats computed from all stored game reports.
   * Optionally filter by presetKey to compare apples-to-apples.
   */
  async computeAggregates(filterPreset = null) {
    const allReports = await this.getAllReports();
    const reports = filterPreset
      ? allReports.filter(r => r.presetKey === filterPreset)
      : allReports;

    if (reports.length === 0) {
      return { gameCount: 0, empires: {}, actionTotals: {}, presets: [] };
    }

    const presets = [...new Set(allReports.map(r => r.presetKey))];
    const empireAgg = {};
    const globalActionTotals = {};

    for (const report of reports) {
      for (const er of report.empireResults || []) {
        if (!empireAgg[er.empireId]) {
          empireAgg[er.empireId] = {
            empireId: er.empireId,
            empireName: er.empireName,
            personality: er.personality,
            model: er.model,
            gamesPlayed: 0,
            wins: 0,
            eliminations: 0,
            ranks: [],
            finalTerritories: [],
            peakTerritories: [],
            finalUnits: [],
            peakUnits: [],
            finalTreasury: [],
            eliminationTurns: [],
            battlesWon: 0,
            battlesLost: 0,
            battlesFought: 0,
            actionTotals: {},
            buildingTotals: {},
          };
        }
        const agg = empireAgg[er.empireId];
        agg.gamesPlayed++;
        if (er.isWinner) agg.wins++;
        if (er.eliminated) {
          agg.eliminations++;
          if (er.eliminatedOnTurn != null) agg.eliminationTurns.push(er.eliminatedOnTurn);
        }
        agg.ranks.push(er.finalRank);
        agg.finalTerritories.push(er.finalTerritories);
        agg.peakTerritories.push(er.peakTerritories);
        agg.finalUnits.push(er.finalUnits);
        agg.peakUnits.push(er.peakUnits);
        agg.finalTreasury.push(er.finalTreasury);
        agg.battlesWon += er.battlesWon || 0;
        agg.battlesLost += er.battlesLost || 0;
        agg.battlesFought += er.battlesFought || 0;

        for (const [aType, count] of Object.entries(er.actions || {})) {
          agg.actionTotals[aType] = (agg.actionTotals[aType] || 0) + count;
        }
        for (const [bType, count] of Object.entries(er.buildings || {})) {
          agg.buildingTotals[bType] = (agg.buildingTotals[bType] || 0) + count;
        }
      }

      for (const [aType, count] of Object.entries(report.actionTotals || {})) {
        globalActionTotals[aType] = (globalActionTotals[aType] || 0) + count;
      }
    }

    for (const agg of Object.values(empireAgg)) {
      agg.winRate = agg.gamesPlayed > 0 ? agg.wins / agg.gamesPlayed : 0;
      agg.eliminationRate = agg.gamesPlayed > 0 ? agg.eliminations / agg.gamesPlayed : 0;
      agg.avgRank = avg(agg.ranks);
      agg.avgFinalTerritories = avg(agg.finalTerritories);
      agg.avgPeakTerritories = avg(agg.peakTerritories);
      agg.avgFinalUnits = avg(agg.finalUnits);
      agg.avgPeakUnits = avg(agg.peakUnits);
      agg.avgFinalTreasury = avg(agg.finalTreasury);
      agg.avgEliminationTurn = agg.eliminationTurns.length > 0 ? avg(agg.eliminationTurns) : null;
      agg.battleWinRate = agg.battlesFought > 0 ? agg.battlesWon / agg.battlesFought : 0;
    }

    return {
      gameCount: reports.length,
      empires: empireAgg,
      actionTotals: globalActionTotals,
      presets,
    };
  }

  /**
   * Export all reports as a JSON blob for external analysis.
   */
  async exportJSON() {
    const reports = await this.getAllReports();
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), reports }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `empire-wars-analytics-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Export a flat CSV with one row per empire per game — easy to open in
   * spreadsheets or feed into pandas/R.
   */
  async exportCSV() {
    const reports = await this.getAllReports();
    if (reports.length === 0) return;

    const headers = [
      'gameId', 'presetKey', 'turnCount', 'reportDate',
      'empireId', 'empireName', 'personality', 'model',
      'isWinner', 'finalRank', 'eliminated', 'eliminatedOnTurn',
      'finalTerritories', 'peakTerritories', 'finalUnits', 'peakUnits',
      'finalTreasury', 'finalConfidence',
      'battlesWon', 'battlesLost', 'battlesFought',
      'action_move_army', 'action_recruit_units', 'action_build',
      'action_declare_war', 'action_propose_alliance', 'action_propose_trade',
      'action_propose_peace', 'action_break_alliance', 'action_send_message',
      'action_impose_embargo', 'action_research',
    ];

    const rows = [headers.join(',')];

    for (const report of reports) {
      for (const er of report.empireResults || []) {
        const row = [
          report.gameId, report.presetKey, report.turnCount,
          report.reportCreatedAt,
          er.empireId, `"${er.empireName}"`, er.personality, er.model,
          er.isWinner, er.finalRank, er.eliminated, er.eliminatedOnTurn ?? '',
          er.finalTerritories, er.peakTerritories, er.finalUnits, er.peakUnits,
          er.finalTreasury, er.finalConfidence ?? '',
          er.battlesWon, er.battlesLost, er.battlesFought,
          er.actions?.move_army ?? 0, er.actions?.recruit_units ?? 0,
          er.actions?.build ?? 0, er.actions?.declare_war ?? 0,
          er.actions?.propose_alliance ?? 0, er.actions?.propose_trade ?? 0,
          er.actions?.propose_peace ?? 0, er.actions?.break_alliance ?? 0,
          er.actions?.send_message ?? 0, er.actions?.impose_embargo ?? 0,
          er.actions?.research ?? 0,
        ];
        rows.push(row.join(','));
      }
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `empire-wars-analytics-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function avg(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
