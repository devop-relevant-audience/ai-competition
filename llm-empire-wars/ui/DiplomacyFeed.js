export class DiplomacyFeed {
  constructor(container) {
    this.container = container;
    this.maxMessages = 30;
  }

  update(gameState) {
    const messages = gameState.diplomacyQueue
      .filter(m => m.type !== 'send_message' && m.turn >= gameState.meta.turn - 5)
      .sort((a, b) => b.turn - a.turn)
      .slice(0, this.maxMessages);

    if (messages.length === 0) {
      this.container.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:8px;">No diplomatic activity yet.</div>';
      return;
    }

    this.container.innerHTML = messages.map(m => {
      const from = gameState.empires[m.fromEmpireId];
      const to = gameState.empires[m.toEmpireId];
      if (!from || !to) return '';

      const typeClass = this._getTypeClass(m.type);
      const typeLabel = this._getTypeLabel(m.type);
      const statusStr = m.status !== 'delivered' && m.status !== 'pending' ? ` [${m.status}]` : '';

      return `
        <div class="diplo-message">
          <div class="diplo-header">
            <span class="diplo-dot" style="background:${from.color}"></span>
            <span style="color:${from.color}">${from.name}</span>
            <span>→</span>
            <span style="color:${to.color}">${to.name}</span>
            <span class="diplo-type ${typeClass}">${typeLabel}${statusStr}</span>
          </div>
          <div style="color:var(--text-secondary)">[Turn ${m.turn}] ${this._escapeHtml(m.message || '')}</div>
        </div>`;
    }).join('');
  }

  _getTypeClass(type) {
    if (type.includes('war') || type === 'declare_war') return 'war';
    if (type.includes('peace')) return 'peace';
    if (type.includes('trade')) return 'trade';
    if (type.includes('alliance')) return 'alliance';
    if (type.includes('break') || type.includes('betray')) return 'betray';
    return 'message';
  }

  _getTypeLabel(type) {
    const labels = {
      propose_trade: 'TRADE',
      propose_alliance: 'ALLIANCE',
      propose_peace: 'PEACE',
      declare_war: 'WAR',
      break_alliance: 'BROKEN',
      send_message: 'MSG',
    };
    return labels[type] || type.toUpperCase();
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
