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
      this.container.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:8px;">No messages yet.</div>';
      return;
    }

    this.container.innerHTML = messages.map(m => {
      const from = gameState.empires[m.fromEmpireId];
      const to = gameState.empires[m.toEmpireId];
      if (!from || !to) return '';

      return `
        <div class="msg-entry" style="border-left-color:${from.color}">
          <div class="msg-header">
            <span style="color:${from.color}">${from.name}</span>
            <span>→</span>
            <span style="color:${to.color}">${to.name}</span>
            <span style="margin-left:auto;">T${m.turn}</span>
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
