import { TERRITORY_CENTROIDS } from '../data/territories.js';

export class ArmyLayer {
  constructor(map) {
    this.map = map;
    this.markers = {};
    this.movementLines = [];
  }

  updateArmies(gameState) {
    Object.values(this.markers).forEach(m => this.map.removeLayer(m));
    this.markers = {};

    const armiesByLocation = {};
    Object.values(gameState.armies).forEach(army => {
      if (!armiesByLocation[army.locationId]) {
        armiesByLocation[army.locationId] = [];
      }
      armiesByLocation[army.locationId].push(army);
    });

    for (const [locId, armies] of Object.entries(armiesByLocation)) {
      const centroid = TERRITORY_CENTROIDS[locId];
      if (!centroid) continue;

      armies.forEach((army, idx) => {
        const empire = gameState.empires[army.empireId];
        const isNeutral = army.empireId === 'neutral';
        if (!empire && !isNeutral) return;

        const color = isNeutral ? '#666' : empire.color;
        const offset = armies.length > 1 ? (idx - (armies.length - 1) / 2) * 0.5 : 0;
        const pos = [centroid[0] + offset * 0.3, centroid[1] + offset * 0.5];

        const icon = L.divIcon({
          className: '',
          html: `<div class="army-marker${isNeutral ? ' neutral-garrison' : ''}" style="background: ${color}">${army.size}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker(pos, { icon, interactive: false }).addTo(this.map);
        this.markers[army.id] = marker;
      });
    }
  }

  animateMovements(movements, gameState) {
    this._clearMovementLines();

    movements.forEach(move => {
      const from = TERRITORY_CENTROIDS[move.from];
      const to = TERRITORY_CENTROIDS[move.to];
      if (!from || !to) return;

      const empire = gameState.empires[move.empireId];
      const line = L.polyline([from, to], {
        color: empire ? empire.color : '#fff',
        weight: 2,
        opacity: 0.7,
        dashArray: '8, 8',
        className: 'movement-line',
      }).addTo(this.map);

      this.movementLines.push(line);

      if (this.markers[move.armyId]) {
        this.markers[move.armyId].getElement()
          ?.querySelector('.army-marker')
          ?.classList.add('moving');
      }
    });

    setTimeout(() => this._clearMovementLines(), 2000);
  }

  _clearMovementLines() {
    this.movementLines.forEach(l => this.map.removeLayer(l));
    this.movementLines = [];
  }
}
