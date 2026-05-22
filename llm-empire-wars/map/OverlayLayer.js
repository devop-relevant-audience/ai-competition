import { TERRITORY_CENTROIDS } from '../data/territories.js';
import { findTradeRoute, getRelation } from '../engine/GameState.js';

export class OverlayLayer {
  constructor(map) {
    this.map = map;
    this.warZoneGroup = L.layerGroup().addTo(map);
    this.tradeLineGroup = L.layerGroup().addTo(map);
    this.heatOverlayGroup = L.layerGroup().addTo(map);
    this.geojsonFeatures = null;
  }

  setGeoJSON(geojson) {
    this.geojsonFeatures = {};
    for (const feature of geojson.features) {
      const id = feature.properties.id;
      if (id) this.geojsonFeatures[id] = feature;
    }
  }

  update(state) {
    this._buildWarZones(state);
    this._buildTradeLines(state);
    this._buildHeatOverlays(state);
  }

  // ── War Zone Borders ──────────────────────────────────
  // Territories with enemy troops inside get a pulsing red outline.

  _buildWarZones(state) {
    this.warZoneGroup.clearLayers();
    if (!this.geojsonFeatures) return;

    const contestedTids = this._findContestedTerritories(state);

    for (const tid of contestedTids) {
      const feature = this.geojsonFeatures[tid];
      if (!feature) continue;

      L.geoJSON(feature, {
        style: {
          fill: false,
          color: '#e5484d',
          weight: 3,
          opacity: 0.7,
          className: 'war-zone-border',
        },
        interactive: false,
      }).addTo(this.warZoneGroup);
    }
  }

  _findContestedTerritories(state) {
    const byLocation = {};
    for (const army of Object.values(state.armies)) {
      if (!byLocation[army.locationId]) byLocation[army.locationId] = [];
      byLocation[army.locationId].push(army.empireId);
    }

    const contested = [];
    for (const [tid, empireIds] of Object.entries(byLocation)) {
      const unique = [...new Set(empireIds)];
      if (unique.length < 2) continue;
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const a = unique[i];
          const b = unique[j];
          if (a === 'neutral' || b === 'neutral') {
            contested.push(tid);
            break;
          }
          const rel = getRelation(state, a, b);
          if (rel && rel.status === 'war') {
            contested.push(tid);
            break;
          }
        }
        if (contested[contested.length - 1] === tid) break;
      }
    }
    return contested;
  }

  // ── Trade Route Lines ─────────────────────────────────
  // BFS path through adjacency graph, rendered as smooth curves.

  _buildTradeLines(state) {
    this.tradeLineGroup.clearLayers();

    const drawn = new Set();

    for (const [key, rel] of Object.entries(state.relations)) {
      if (rel.status !== 'trade' && rel.status !== 'alliance') continue;
      if (drawn.has(key)) continue;
      drawn.add(key);

      const [a, b] = key.split('__');
      const route = findTradeRoute(state, a, b);

      if (route && route.length >= 2) {
        const waypoints = route
          .map(tid => TERRITORY_CENTROIDS[tid])
          .filter(Boolean);
        if (waypoints.length < 2) continue;

        const smoothed = this._catmullRomSpline(waypoints, 8);

        const empireColor = state.empires[a]?.color || '#d4a942';

        L.polyline(smoothed, {
          color: empireColor,
          weight: 1.5,
          dashArray: '6,6',
          opacity: 0.55,
          interactive: false,
        }).addTo(this.tradeLineGroup);
      } else {
        const capA = this._findCapital(state, a);
        const capB = this._findCapital(state, b);
        if (!capA || !capB) continue;
        const c1 = TERRITORY_CENTROIDS[capA];
        const c2 = TERRITORY_CENTROIDS[capB];
        if (!c1 || !c2) continue;

        L.polyline([c1, c2], {
          color: '#888',
          weight: 1,
          dashArray: '3,5',
          opacity: 0.3,
          className: 'trade-route-blocked',
          interactive: false,
        }).addTo(this.tradeLineGroup);
      }
    }
  }

  _findCapital(state, empireId) {
    for (const [tid, terr] of Object.entries(state.territories)) {
      if (terr.capital && terr.ownerId === empireId) return tid;
    }
    return null;
  }

  _catmullRomSpline(points, segments) {
    if (points.length === 2) {
      return this._singleCurve(points[0], points[1], segments);
    }
    const result = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || points[i + 1];

      for (let t = 0; t <= 1; t += 1 / segments) {
        const t2 = t * t;
        const t3 = t2 * t;
        const lat = 0.5 * (
          (2 * p1[0]) +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
        );
        const lng = 0.5 * (
          (2 * p1[1]) +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
        );
        result.push([lat, lng]);
      }
    }
    result.push(points[points.length - 1]);
    return result;
  }

  _singleCurve(a, b, segments) {
    const midLat = (a[0] + b[0]) / 2;
    const midLng = (a[1] + b[1]) / 2;
    const dx = b[1] - a[1];
    const dy = b[0] - a[0];
    const dist = Math.sqrt(dx * dx + dy * dy);
    const offset = dist * 0.15;
    const ctrl = [midLat + (dx / dist) * offset, midLng - (dy / dist) * offset];

    const result = [];
    for (let t = 0; t <= 1; t += 1 / segments) {
      const u = 1 - t;
      const lat = u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0];
      const lng = u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1];
      result.push([lat, lng]);
    }
    result.push(b);
    return result;
  }

  // ── Heat Overlays ─────────────────────────────────────
  // Full-territory pulse for zones with 3+ battles,
  // active for 2 turns after the last battle.

  _buildHeatOverlays(state) {
    this.heatOverlayGroup.clearLayers();
    if (!this.geojsonFeatures) return;

    const hotTerritories = this._computeBattleHeat(state);

    for (const tid of hotTerritories) {
      const feature = this.geojsonFeatures[tid];
      if (!feature) continue;

      L.geoJSON(feature, {
        style: {
          fillColor: '#e5484d',
          fillOpacity: 0.18,
          color: '#e5484d',
          opacity: 0.4,
          weight: 2,
          className: 'heat-territory',
        },
        interactive: false,
      }).addTo(this.heatOverlayGroup);
    }
  }

  _computeBattleHeat(state) {
    const currentTurn = state.meta?.turn || 0;
    const battleData = {};
    for (const event of (state.eventLog || [])) {
      if (event.type !== 'battle' || !event.territoryId) continue;
      const tid = event.territoryId;
      if (!battleData[tid]) battleData[tid] = { count: 0, lastTurn: -Infinity };
      battleData[tid].count++;
      if (event.turn > battleData[tid].lastTurn) battleData[tid].lastTurn = event.turn;
    }
    const hot = [];
    for (const [tid, data] of Object.entries(battleData)) {
      if (data.count >= 3 && currentTurn - data.lastTurn <= 2) {
        hot.push(tid);
      }
    }
    return hot;
  }

  // ── Floating Combat Text ──────────────────────────────

  showCombatText(territoryId, losses, state) {
    const centroid = TERRITORY_CENTROIDS[territoryId];
    if (!centroid) return;

    const containerPoint = this.map.latLngToContainerPoint(centroid);
    const mapContainer = this.map.getContainer();

    losses.forEach((entry, i) => {
      const empire = state.empires[entry.empireId];
      const color = empire?.color || '#fff';

      const el = document.createElement('span');
      el.className = 'fct';
      el.textContent = `-${entry.amount}`;
      el.style.color = color;
      el.style.left = `${containerPoint.x + i * 20 - ((losses.length - 1) * 10)}px`;
      el.style.top = `${containerPoint.y}px`;

      mapContainer.appendChild(el);

      el.addEventListener('animationend', () => el.remove());
    });
  }
}
