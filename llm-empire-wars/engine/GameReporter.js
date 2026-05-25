import { getEmpireTerritories, getEmpireArmies, getRelation } from './GameState.js';

/**
 * Extracts a structured game report from the final state + stats tracker.
 * Designed for cross-game aggregation and balance analysis.
 */
export class GameReporter {
  generate(gameState, statsTracker, winResult) {
    const empireIds = Object.keys(gameState.empires);
    const turnCount = gameState.meta.turn - 1;

    return {
      gameId: gameState.meta.gameId,
      presetKey: gameState.meta.presetKey || 'unknown',
      regions: gameState.meta.regions || [],
      turnCount,
      turnLimit: gameState.meta.turnLimit,
      startedAt: gameState.meta.createdAt,
      endedAt: gameState.meta.lastUpdatedAt,
      reportCreatedAt: new Date().toISOString(),

      winner: this._extractWinner(gameState, winResult),
      empireResults: empireIds.map(eid =>
        this._extractEmpireResult(gameState, statsTracker, eid, winResult, empireIds)
      ).sort((a, b) => a.finalRank - b.finalRank),

      turnSeries: this._extractTurnSeries(statsTracker, empireIds),
      territoryOwnership: this._extractTerritoryOwnership(gameState),
      keyEvents: this._extractKeyEvents(gameState),
      actionTotals: this._extractGlobalActionTotals(statsTracker, empireIds),
    };
  }

  _extractWinner(gameState, winResult) {
    if (!winResult || !winResult.winner) return null;
    const w = winResult.winner;
    return {
      empireId: w.id,
      empireName: w.name,
      personality: w.personality,
      model: w.model,
      reason: winResult.reason,
      finalTerritories: winResult.territories,
      totalTerritories: winResult.total,
    };
  }

  _extractEmpireResult(gameState, statsTracker, empireId, winResult, allEmpireIds) {
    const empire = gameState.empires[empireId];
    const territories = getEmpireTerritories(gameState, empireId);
    const armies = getEmpireArmies(gameState, empireId);
    const battle = statsTracker.getBattleStats(empireId);

    const finalTerritories = territories.length;
    const ranked = allEmpireIds
      .map(eid => ({
        eid,
        terr: getEmpireTerritories(gameState, eid).length,
        elim: gameState.empires[eid]?.isEliminated,
      }))
      .sort((a, b) => {
        if (a.elim && !b.elim) return 1;
        if (!a.elim && b.elim) return -1;
        return b.terr - a.terr;
      });
    const finalRank = ranked.findIndex(r => r.eid === empireId) + 1;

    const buildings = {};
    for (const t of territories) {
      for (const [bKey, bVal] of Object.entries(t.buildings || {})) {
        if (bVal) buildings[bKey] = (buildings[bKey] || 0) + 1;
      }
    }

    const actionCounts = this._aggregateActionCounts(statsTracker, empireId);

    const diplomacySummary = this._extractDiplomacySummary(gameState, empireId, allEmpireIds);

    const eliminatedOnTurn = this._findEliminationTurn(gameState, empireId);

    return {
      empireId,
      empireName: empire.name,
      personality: empire.personality,
      model: empire.model,
      finalRank,
      isWinner: winResult?.winner?.id === empireId,

      finalTerritories,
      peakTerritories: statsTracker.getPeakTerritory(empireId),
      finalUnits: armies.reduce((s, a) => s + a.size, 0),
      peakUnits: statsTracker.getPeakArmy(empireId),
      finalTreasury: empire.treasury,
      finalConfidence: empire.confidence,

      eliminated: empire.isEliminated,
      eliminatedOnTurn,

      actions: actionCounts,
      battlesWon: battle.won,
      battlesLost: battle.lost,
      battlesFought: battle.fought,

      buildings,
      diplomacy: diplomacySummary,

      resources: { ...empire.resources },
    };
  }

  _aggregateActionCounts(statsTracker, empireId) {
    const totals = {};
    for (const h of statsTracker.history) {
      const snap = h.empires[empireId];
      if (!snap || !snap.actionCounts) continue;
      for (const [aType, count] of Object.entries(snap.actionCounts)) {
        totals[aType] = (totals[aType] || 0) + count;
      }
    }
    return totals;
  }

  _extractGlobalActionTotals(statsTracker, empireIds) {
    const totals = {};
    for (const eid of empireIds) {
      const empTotals = this._aggregateActionCounts(statsTracker, eid);
      for (const [aType, count] of Object.entries(empTotals)) {
        totals[aType] = (totals[aType] || 0) + count;
      }
    }
    return totals;
  }

  _extractDiplomacySummary(gameState, empireId, allEmpireIds) {
    const summary = { wars: 0, alliances: 0, trades: 0, embargoes: 0 };
    for (const otherId of allEmpireIds) {
      if (otherId === empireId) continue;
      const rel = getRelation(gameState, empireId, otherId);
      if (!rel) continue;
      if (rel.status === 'war') summary.wars++;
      if (rel.status === 'alliance') summary.alliances++;
      if (rel.tradeValue > 0) summary.trades++;
      if (rel.embargo) summary.embargoes++;
    }
    return summary;
  }

  _findEliminationTurn(gameState, empireId) {
    if (!gameState.empires[empireId]?.isEliminated) return null;
    for (const entry of gameState.turnHistory || []) {
      for (const ev of entry.events || []) {
        if (ev.type === 'empire_eliminated' && ev.involvedEmpires?.includes(empireId)) {
          return entry.turn;
        }
      }
    }
    return null;
  }

  _extractTurnSeries(statsTracker, empireIds) {
    const series = { territories: {}, units: {}, treasury: {}, confidence: {} };
    for (const eid of empireIds) {
      series.territories[eid] = statsTracker.getSeries(eid, 'territories');
      series.units[eid] = statsTracker.getSeries(eid, 'units');
      series.treasury[eid] = statsTracker.getSeries(eid, 'treasury');
      series.confidence[eid] = statsTracker.getSeries(eid, 'confidence');
    }
    return series;
  }

  _extractTerritoryOwnership(gameState) {
    const ownership = {};
    for (const [tid, terr] of Object.entries(gameState.territories)) {
      ownership[tid] = terr.ownerId || null;
    }
    return ownership;
  }

  _extractKeyEvents(gameState) {
    const keyTypes = new Set([
      'war_declared', 'alliance_formed', 'alliance_broken',
      'empire_eliminated', 'elimination', 'territory_captured', 'trade_accepted',
      'embargo_imposed', 'building_constructed',
      'nuclear_impact', 'satellite_launched',
      'insurgency_detected', 'hack_detected', 'sabotage_detected',
      'bloc_formed', 'bloc_dissolved', 'bloc_embargo',
    ]);
    const events = [];
    for (const entry of gameState.turnHistory || []) {
      for (const ev of entry.events || []) {
        if (keyTypes.has(ev.type)) {
          events.push({
            turn: entry.turn,
            type: ev.type,
            involvedEmpires: ev.involvedEmpires || [],
            description: ev.description || '',
          });
        }
      }
    }
    return events;
  }
}
