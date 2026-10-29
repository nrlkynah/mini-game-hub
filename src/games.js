// Every game in the hub, in display order. Plain data, no DOM.
//
// To add a game: build it as a module with open() and close() (and best() if
// it keeps a high score), register it in src/main.js, then set its status
// here to 'playable'. The id is also its URL hash (#color-chaos).

export const GAMES = [
  { id: 'color-chaos', icon: '🌈', title: 'Color Chaos', tagline: '60 Second Challenge', status: 'playable', accent: 'cyan' },
  { id: 'neon-reflex', icon: '⚡', title: 'Neon Reflex', tagline: 'How fast are you?', status: 'playable', accent: 'magenta' },
  { id: 'memory-matrix', icon: '🧠', title: 'Memory Matrix', tagline: 'Remember the light', status: 'playable', accent: 'purple' },
  { id: 'space-tap', icon: '🚀', title: 'Space Tap', tagline: 'Tap. Combo. Survive.', status: 'playable', accent: 'lime' },
  { id: 'laser-dodge', icon: '💥', title: 'Laser Dodge', tagline: 'Survive the beam', status: 'soon', accent: 'blue' },
];

export const STATUS_LABELS = { playable: 'Playable', next: 'Coming Next', soon: 'Coming Soon' };
