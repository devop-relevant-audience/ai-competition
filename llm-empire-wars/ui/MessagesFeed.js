export class MessagesFeed {
  constructor(container) {
    this.container = container;
    this.maxMessages = 20;
  }

  update(gameState) {
    const messages = gameState.diplomacyQueue
      .filter(m => m.type === 'send_message' && m.turn >= gameState.meta.turn - 8)
      .sort((a, b) => b.turn - a.turn)
      .slice(0, this.maxMessages);

    if (messages.length === 0) {
      this.container.innerHTML = '<div class="empty-state">No messages yet.</div>';
      return;
    }

    this.container.innerHTML = messages.map(m => {
      const from = gameState.empires[m.fromEmpireId];
      const to = gameState.empires[m.toEmpireId];
      if (!from || !to) return '';

      return `
        <div class="msg-entry" style="border-left-color:${from.color}">
          <div class="msg-header">
            <span style="color:${from.color};font-weight:500">${this._escapeHtml(from.name)}</span>
            <span style="color:var(--ink-tertiary)">→</span>
            <span style="color:${to.color};font-weight:500">${this._escapeHtml(to.name)}</span>
            <span style="margin-left:auto;font-family:var(--font-mono)">T${m.turn}</span>
          </div>
          <div class="msg-body">"${this._escapeHtml(m.message || '')}"</div>
        </div>`;
    }).join('');
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
