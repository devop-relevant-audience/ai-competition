export const MAP_CONFIG = {
  baseTileUrl: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
  labelsTileUrl: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
  tileAttribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  minZoom: 2,
  maxZoom: 8,
};

export const NEUTRAL_COLOR = '#1a1b1e';
export const BORDER_COLOR = '#0a0a0c';

export function getTerritoryStyle(empire) {
  return {
    fillColor: empire ? empire.color : NEUTRAL_COLOR,
    fillOpacity: empire ? 0.38 : 0.20,
    color: empire ? empire.color : '#25262a',
    opacity: empire ? 0.65 : 0.35,
    weight: 1.2,
    dashArray: empire ? null : '2,2',
  };
}

export function getHighlightStyle(empire) {
  return {
    fillColor: empire ? empire.color : '#34363b',
    fillOpacity: empire ? 0.5 : 0.30,
    color: empire ? empire.color : '#f7f8f8',
    opacity: 0.85,
    weight: 1.5,
  };
}

function lighten(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
