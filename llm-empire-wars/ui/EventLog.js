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
  proposal_rejected: '❌',
};

const FILTER_CATEGORIES = {
  all: { label: 'All Events', types: null },
  combat: { label: 'Combat', types: ['battle', 'territory_captured', 'elimination'] },
  diplomacy: { label: 'Diplomacy', types: ['war_declared', 'peace_declared', 'trade_established', 'alliance_formed', 'alliance_broken', 'betrayal', 'propose_trade', 'propose_alliance', 'propose_peace', 'proposal_rejected'] },
  military: { label: 'Military', types: ['recruitment', 'army_moved', 'attrition'] },
  world: { label: 'World Events', types: ['world_event'] },
  messages: { label: 'Messages', types: ['message_sent'] },
};

export class EventLog {
  constructor(container) {
    this.container = container;
    this.lastTurnShown = 0;
    this.activeFilter = 'all';
    this._injectFilterUI();
  }

  _injectFilterUI() {
    const titleEl = this.container.parentElement.querySelector('.event-log-title');
    if (!titleEl) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'event-log-header';

    const title = document.createElement('h3');
    title.className = 'event-log-title';
    title.textContent = 'Event Log';

    const filterBtn = document.createElement('button');
    filterBtn.className = 'event-filter-btn';
    filterBtn.textContent = 'All';
    filterBtn.id = 'event-filter-btn';

    const dropdown = document.createElement('div');
    dropdown.className = 'event-filter-dropdown hidden';
    dropdown.id = 'event-filter-dropdown';
    dropdown.innerHTML = Object.entries(FILTER_CATEGORIES).map(([key, cat]) =>
      `<div class="event-filter-option${key === 'all' ? ' active' : ''}" data-filter="${key}">${cat.label}</div>`
    ).join('');

    wrapper.appendChild(title);
    wrapper.appendChild(filterBtn);
    wrapper.appendChild(dropdown);

    titleEl.replaceWith(wrapper);

    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    dropdown.addEventListener('click', (e) => {
      const option = e.target.closest('.event-filter-option');
      if (!option) return;
      this.activeFilter = option.dataset.filter;
      const label = FILTER_CATEGORIES[this.activeFilter]?.label || 'All';
      filterBtn.textContent = label;
      dropdown.querySelectorAll('.event-filter-option').forEach(o => o.classList.remove('active'));
      option.classList.add('active');
      dropdown.classList.add('hidden');
      if (this._lastGameState) this.update(this._lastGameState);
    });

    document.addEventListener('click', () => {
      dropdown.classList.add('hidden');
    });
  }

  update(gameState) {
    this._lastGameState = gameState;
    const currentTurn = gameState.meta.turn;
    const allowedTypes = FILTER_CATEGORIES[this.activeFilter]?.types;

    const recentEvents = gameState.eventLog
      .filter(e => e.turn >= currentTurn - 5)
      .filter(e => !allowedTypes || allowedTypes.includes(e.type))
      .sort((a, b) => b.turn - a.turn || gameState.eventLog.indexOf(b) - gameState.eventLog.indexOf(a));

    if (recentEvents.length === 0) {
      const msg = this.activeFilter === 'all'
        ? 'No events yet.'
        : `No ${FILTER_CATEGORIES[this.activeFilter]?.label || ''} events in the last 5 turns.`;
      this.container.innerHTML = `<div class="empty-state">${msg}</div>`;
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
