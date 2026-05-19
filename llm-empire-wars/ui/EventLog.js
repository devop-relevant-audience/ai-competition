const EVENT_ICONS = {
  battle: '⚔️',
  territory_captured: '🏴',
  war_declared: '🔥',
  peace_declared: '🕊️',
  trade_established: '🤝',
  alliance_formed: '🛡️',
  alliance_broken: '💔',
  betrayal: '🗡️',
  recruitment: '🎯',
  army_moved: '➡️',
  attrition: '💀',
  elimination: '☠️',
  world_event: '🌍',
  message_sent: '💬',
  propose_trade: '📜',
  propose_alliance: '📜',
  propose_peace: '📜',
};

export class EventLog {
  constructor(container) {
    this.container = container;
    this.lastTurnShown = 0;
  }

  update(gameState) {
    const currentTurn = gameState.meta.turn;
    const recentEvents = gameState.eventLog
      .filter(e => e.turn >= currentTurn - 5)
      .sort((a, b) => b.turn - a.turn || gameState.eventLog.indexOf(b) - gameState.eventLog.indexOf(a));

    if (recentEvents.length === 0) {
      this.container.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;">No events yet.</div>';
      return;
    }

    this.container.innerHTML = recentEvents.map(e => {
      const icon = EVENT_ICONS[e.type] || '📌';
      const empireColors = (e.involvedEmpires || []).map(eid => {
        const emp = gameState.empires[eid];
        return emp ? emp.color : '#888';
      });
      const colorDots = empireColors.map(c => `<span style="color:${c}">●</span>`).join(' ');

      return `
        <div class="event-entry">
          <span class="event-turn-badge">T${e.turn}</span>
          <span class="event-icon">${icon}</span>
          <span class="event-text">${colorDots} ${this._escapeHtml(e.description)}</span>
        </div>`;
    }).join('');
  }

  addTurnEvents(events, gameState) {
    this.update(gameState);
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
