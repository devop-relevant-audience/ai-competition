import { getTerritoryStyle, getHighlightStyle } from './MapTheme.js';
import { RUSSIA_SEGMENTS } from '../data/territories.js';

export class TerritoryLayer {
  constructor(map) {
    this.map = map;
    this.layer = null;
    this.gameState = null;
    this.tooltip = document.getElementById('territory-tooltip');
  }

  setData(geojson) {
    if (this.layer) {
      this.map.removeLayer(this.layer);
    }
    this.geojson = geojson;
    this.layer = L.geoJSON(geojson, {
      style: (feature) => this._getStyle(feature),
      onEachFeature: (feature, layer) => this._bindEvents(feature, layer),
    }).addTo(this.map);
  }

  updateOwnership(gameState) {
    this.gameState = gameState;
    if (!this.layer) return;
    this.layer.eachLayer((layer) => {
      const feature = layer.feature;
      const style = this._getStyle(feature);
      layer.setStyle(style);
    });
  }

  _getStyle(feature) {
    if (!this.gameState) return getTerritoryStyle(null);
    const tid = feature.properties.id;

    if (tid === 'russia') {
      return this._getRussiaStyle();
    }

    const territory = this.gameState.territories[tid];
    if (!territory || !territory.ownerId) return getTerritoryStyle(null);
    const empire = this.gameState.empires[territory.ownerId];
    return getTerritoryStyle(empire);
  }

  _getRussiaStyle() {
    const dominantEmpire = this._getRussiaDominantOwner();
    if (!dominantEmpire) return getTerritoryStyle(null);
    return getTerritoryStyle(dominantEmpire);
  }

  _getRussiaDominantOwner() {
    if (!this.gameState) return null;
    const ownerCounts = {};
    for (const segId of RUSSIA_SEGMENTS) {
      const seg = this.gameState.territories[segId];
      if (seg && seg.ownerId) {
        ownerCounts[seg.ownerId] = (ownerCounts[seg.ownerId] || 0) + 1;
      }
    }
    if (Object.keys(ownerCounts).length === 0) return null;
    const dominant = Object.entries(ownerCounts).sort((a, b) => b[1] - a[1])[0];
    return this.gameState.empires[dominant[0]];
  }

  _bindEvents(feature, layer) {
    layer.on('mouseover', (e) => {
      const tid = feature.properties.id;
      if (tid === 'russia') {
        const dominantEmpire = this._getRussiaDominantOwner();
        layer.setStyle(getHighlightStyle(dominantEmpire));
      } else {
        const empire = this._getEmpireForFeature(feature);
        layer.setStyle(getHighlightStyle(empire));
      }
      layer.bringToFront();
      this._showTooltip(e, feature);
    });

    layer.on('mouseout', () => {
      layer.setStyle(this._getStyle(feature));
      this._hideTooltip();
    });

    layer.on('mousemove', (e) => {
      this._moveTooltip(e);
    });

    layer.on('click', () => {
      const tid = feature.properties.id;
      document.dispatchEvent(new CustomEvent('empire-wars:territory-clicked', {
        detail: { territoryId: tid },
      }));
    });
  }

  _getEmpireForFeature(feature) {
    if (!this.gameState) return null;
    const tid = feature.properties.id;
    const territory = this.gameState.territories[tid];
    if (!territory || !territory.ownerId) return null;
    return this.gameState.empires[territory.ownerId];
  }

  _showTooltip(e, feature) {
    if (!this.gameState) return;
    const tid = feature.properties.id;

    if (tid === 'russia') {
      this._showRussiaTooltip(e);
      return;
    }

    const territory = this.gameState.territories[tid];
    if (!territory) return;

    const empire = territory.ownerId ? this.gameState.empires[territory.ownerId] : null;
    const armies = Object.values(this.gameState.armies).filter(a => a.locationId === tid);

    let html = `<div class="tooltip-name">${territory.name}</div>`;
    html += `<div class="tooltip-owner" style="color: ${empire ? empire.color : '#888'}">`;
    html += empire ? empire.name : 'Neutral';
    html += `</div>`;
    html += `<div class="tooltip-resources">`;
    html += `<span>Manpower: ${territory.resources.manpower}</span>`;
    html += `<span>Industry: ${territory.resources.industry}</span>`;
    html += `<span>Capital: ${territory.resources.capital}</span>`;
    html += `</div>`;
    if (territory.terrain) {
      html += `<div style="color: var(--ink-tertiary); font-size: 11px; margin-top: 4px;">Terrain: ${territory.terrain}</div>`;
    }
    const buildingNames = Object.keys(territory.buildings || {}).filter(b => territory.buildings[b]);
    if (buildingNames.length > 0) {
      html += `<div style="color: var(--ink-tertiary); font-size: 11px; margin-top: 4px;">Buildings: ${buildingNames.map(b => b.charAt(0).toUpperCase() + b.slice(1)).join(', ')}</div>`;
    }
    if (armies.length > 0) {
      html += `<div style="margin-top: 4px; font-size: 12px;">`;
      armies.forEach(a => {
        const ae = this.gameState.empires[a.empireId];
        html += `<span style="color: ${ae.color}">Army: ${a.size} units</span> `;
      });
      html += `</div>`;
    }

    this.tooltip.innerHTML = html;
    this.tooltip.classList.remove('hidden');
    this._moveTooltip(e);
  }

  _showRussiaTooltip(e) {
    let html = `<div class="tooltip-name">Russia</div>`;
    html += `<div style="color: var(--ink-tertiary); font-size: 11px; margin-bottom: 6px;">6 segments — control all for bonus resources</div>`;

    let totalManpower = 0, totalIndustry = 0, totalCapital = 0;

    for (const segId of RUSSIA_SEGMENTS) {
      const seg = this.gameState.territories[segId];
      if (!seg) continue;
      const owner = seg.ownerId ? this.gameState.empires[seg.ownerId] : null;
      const ownerColor = owner ? owner.color : '#888';
      const ownerName = owner ? owner.name : 'Neutral';
      totalManpower += seg.resources.manpower;
      totalIndustry += seg.resources.industry;
      totalCapital += seg.resources.capital;
      html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">`;
      html += `<span style="font-size: 11px;">${seg.name}</span>`;
      html += `<span style="font-size: 10px; color: ${ownerColor}; font-weight: 500;">${ownerName}</span>`;
      html += `</div>`;
    }

    html += `<div class="tooltip-resources" style="margin-top: 6px;">`;
    html += `<span>Total Manpower: ${totalManpower}</span>`;
    html += `<span>Total Industry: ${totalIndustry}</span>`;
    html += `<span>Total Capital: ${totalCapital}</span>`;
    html += `</div>`;

    const armies = Object.values(this.gameState.armies).filter(a =>
      RUSSIA_SEGMENTS.includes(a.locationId)
    );
    if (armies.length > 0) {
      html += `<div style="margin-top: 4px; font-size: 12px;">`;
      armies.forEach(a => {
        const ae = this.gameState.empires[a.empireId];
        const segName = this.gameState.territories[a.locationId]?.name || a.locationId;
        html += `<div style="color: ${ae.color}">${segName}: ${a.size} units (${ae.name})</div>`;
      });
      html += `</div>`;
    }

    this.tooltip.innerHTML = html;
    this.tooltip.classList.remove('hidden');
    this._moveTooltip(e);
  }

  _moveTooltip(e) {
    const container = this.map.getContainer();
    const rect = container.getBoundingClientRect();
    let x = e.originalEvent.clientX - rect.left + 15;
    let y = e.originalEvent.clientY - rect.top + 15;
    if (x + 260 > rect.width) x = x - 280;
    if (y + 150 > rect.height) y = y - 160;
    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  }

  _hideTooltip() {
    this.tooltip.classList.add('hidden');
  }
}
