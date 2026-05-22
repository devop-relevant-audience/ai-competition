export const MAP_PRESETS = {
  europe: {
    label: 'Europe',
    description: '40 territories, 3 empires',
    regions: ['europe'],
    mapCenter: [50, 15],
    mapZoom: 4,
    maxBounds: [[30, -25], [72, 55]],
  },
  europe_middle_east: {
    label: 'Europe + Middle East',
    description: '53 territories, 5 empires',
    regions: ['europe', 'middle_east'],
    mapCenter: [42, 30],
    mapZoom: 3,
    maxBounds: [[10, -25], [72, 65]],
  },
  full: {
    label: 'Full Map',
    description: '84 territories, 8 empires',
    regions: ['europe', 'middle_east', 'asia', 'russia'],
    mapCenter: [40, 65],
    mapZoom: 3,
    maxBounds: [[-15, -25], [75, 170]],
  },
};

export const DEFAULT_PRESET = 'full';
