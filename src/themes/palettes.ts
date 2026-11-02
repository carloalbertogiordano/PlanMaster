import type { Palette } from './theme.js';

const midnight: Palette = {
  name: 'PlanMaster Midnight',
  type: 'dark',
  bg: '#0b1021', bgSide: '#0e1429', bgDeep: '#080c1a', fg: '#c9d4f0', muted: '#8793b8', border: '#1d2547',
  accent: '#6ea8ff', accentFg: '#07101f', hover: '#172046', selection: '#22305f', comment: '#6b789f',
  blue: '#6ea8ff', green: '#5fd39a', orange: '#ffb454', red: '#ff7b8a', purple: '#b69cff', cyan: '#5fd6e6', yellow: '#ffd866',
  status: { bg: '#1e3a8a', fg: '#ffffff' },
  statusError: { bg: '#b42318', fg: '#ffffff' },
  statusWarning: { bg: '#8a5a00', fg: '#ffffff' },
};

const solar: Palette = {
  name: 'PlanMaster Solar',
  type: 'light',
  bg: '#fdf6e3', bgSide: '#f5eed9', bgDeep: '#eee8d5', fg: '#2f3e46', muted: '#4e646b', border: '#d9d2bd',
  accent: '#1f6fa8', accentFg: '#fdf6e3', hover: '#ebe4cd', selection: '#e0d9bd', comment: '#7c8f94',
  blue: '#1f6fa8', green: '#36701a', orange: '#8a5800', red: '#b8322a', purple: '#6558b8', cyan: '#1a7a82', yellow: '#7a5f00',
  status: { bg: '#1f6fa8', fg: '#fdf6e3' },
  statusError: { bg: '#b8322a', fg: '#ffffff' },
  statusWarning: { bg: '#8a5a00', fg: '#ffffff' },
};

const cyberpunk: Palette = {
  name: 'PlanMaster Cyberpunk',
  type: 'dark',
  bg: '#0d0221', bgSide: '#120330', bgDeep: '#070112', fg: '#e8e6ff', muted: '#a090d0', border: '#3a0f6b',
  accent: '#ff2a6d', accentFg: '#0d0221', hover: '#1f0a45', selection: '#3b1470', comment: '#8070b0',
  blue: '#05d9e8', green: '#39ff88', orange: '#ffb000', red: '#ff4d6d', purple: '#d58bff', cyan: '#05d9e8', yellow: '#f9f871',
  status: { bg: '#6b21ff', fg: '#ffffff' },
  statusError: { bg: '#ff2a2a', fg: '#0d0221' },
  statusWarning: { bg: '#ffb000', fg: '#0d0221' },
};

const goth: Palette = {
  name: 'PlanMaster Goth',
  type: 'dark',
  bg: '#0c0a0d', bgSide: '#110d12', bgDeep: '#070508', fg: '#d8cfd9', muted: '#9a8c9f', border: '#2a1b2d',
  accent: '#e0456f', accentFg: '#0c0a0d', hover: '#1b141d', selection: '#3a1d33', comment: '#7d6f82',
  blue: '#8f86e0', green: '#86b894', orange: '#d99347', red: '#ef5b72', purple: '#b57be0', cyan: '#72b7c0', yellow: '#d4be68',
  status: { bg: '#4a0d22', fg: '#f1e4e8' },
  statusError: { bg: '#8f1030', fg: '#ffffff' },
  statusWarning: { bg: '#7a4a10', fg: '#ffffff' },
};

const claude: Palette = {
  name: 'PlanMaster Claude',
  type: 'dark',
  bg: '#262624', bgSide: '#1f1e1d', bgDeep: '#1a1918', fg: '#ece9e0', muted: '#a8a396', border: '#3a3835',
  accent: '#d97757', accentFg: '#1a1918', hover: '#302f2c', selection: '#4a3b33', comment: '#8a8578',
  blue: '#7aa2d6', green: '#8fb573', orange: '#e0a14b', red: '#e8606e', purple: '#b79ad9', cyan: '#6dbab0', yellow: '#e3c669',
  status: { bg: '#a8472b', fg: '#ffffff' },
  statusError: { bg: '#a82a2a', fg: '#ffffff' },
  statusWarning: { bg: '#8a5f10', fg: '#ffffff' },
};

// Everything is yellow. You were warned. The text is still dark brown on yellow, so it stays readable.
const bananaPanic: Palette = {
  name: 'PlanMaster Banana Panic',
  type: 'light',
  bg: '#fff59d', bgSide: '#ffee58', bgDeep: '#fdd835', fg: '#3e2723', muted: '#5d4037', border: '#f9a825',
  accent: '#c2185b', accentFg: '#ffffff', hover: '#fff176', selection: '#ffd54f', comment: '#8d6e63',
  blue: '#0d47a1', green: '#1b5e20', orange: '#8f4d00', red: '#d50000', purple: '#6a1b9a', cyan: '#006064', yellow: '#6d5b00',
  status: { bg: '#6a1b9a', fg: '#fff700' },
  statusError: { bg: '#b71c1c', fg: '#ffffff' },
  statusWarning: { bg: '#e65100', fg: '#1a0f00' },
};

// It is not a bug, it is brine. Lime on dark green, with more glow than any editor needs.
const radioactivePickle: Palette = {
  name: 'PlanMaster Radioactive Pickle',
  type: 'dark',
  bg: '#0a1f0a', bgSide: '#0d290d', bgDeep: '#061406', fg: '#d4ff9e', muted: '#8fbf5a', border: '#1f4d1f',
  accent: '#c6ff00', accentFg: '#0a1f0a', hover: '#123612', selection: '#1f5a1f', comment: '#6f9f45',
  blue: '#4dd0e1', green: '#76ff03', orange: '#ffab40', red: '#ff5252', purple: '#e040fb', cyan: '#18ffff', yellow: '#ffea00',
  status: { bg: '#76ff03', fg: '#061406' },
  statusError: { bg: '#ff1744', fg: '#061406' },
  statusWarning: { bg: '#ffab00', fg: '#061406' },
};

export const PALETTES: readonly Palette[] = [midnight, solar, cyberpunk, goth, claude, bananaPanic, radioactivePickle];
