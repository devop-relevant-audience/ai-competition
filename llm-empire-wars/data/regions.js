export const MAP_PRESETS = {
  europe: {
    label: 'Europe + Russia',
    description: '46 territories, 3 empires',
    regions: ['europe'],
    mapCenter: [54, 40],
    mapZoom: 3,
    maxBounds: [[30, -25], [75, 170]],
  },
  europe_middle_east: {
    label: 'Europe + Middle East',
    description: '59 territories, 5 empires',
    regions: ['europe', 'middle_east'],
    mapCenter: [42, 40],
    mapZoom: 3,
    maxBounds: [[10, -25], [75, 170]],
  },
  full: {
    label: 'Full Map',
    description: '84 territories, 8 empires',
    regions: ['europe', 'middle_east', 'asia'],
    mapCenter: [40, 65],
    mapZoom: 3,
    maxBounds: [[-15, -25], [75, 170]],
  },
};

export const DEFAULT_PRESET = 'full';
