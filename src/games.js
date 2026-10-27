// Every game in the hub, in display order. Plain data, no DOM.
//
// To add a game: build it as a module with open() and close() (and best() if
// it keeps a high score), register it in src/main.js, then set its status
// here to 'playable'. The id is also its URL hash (#color-chaos).

export const GAMES = [
  { id: 'color-chaos', icon: '🌈', title: 'Color Chaos', tagline: '60 Second Challenge', status: 'playable', accent: 'cyan' },
  { id: 'neon-reflex', icon: '⚡', title: 'Neon Reflex', tagline: 'How fast are you?', status: 'next', accent: 'blue' },
  { id: 'memory-matrix', icon: '🧠', title: 'Memory Matrix', tagline: 'Remember the light', status: 'soon', accent: 'purple' },
  { id: 'laser-dodge', icon: '💥', title: 'Laser Dodge', tagline: 'Survive the beam', status: 'soon', accent: 'magenta' },
  { id: 'space-tap', icon: '🚀', title: 'Space Tap', tagline: 'How fast can you tap?', status: 'soon', accent: 'lime' },
];

export const STATUS_LABELS = { playable: 'Playable', next: 'Coming Next', soon: 'Coming Soon' };
