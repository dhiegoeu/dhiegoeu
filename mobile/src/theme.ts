import { useColorScheme } from 'react-native';

const light = {
  bg: '#faf8f5', card: '#ffffff', text: '#1d1b19', muted: '#6f6a64', border: '#e4dfd8',
  accent: '#c2410c', accentText: '#ffffff', chord: '#c2410c', danger: '#b91c1c', warnBg: '#fef3c7', warnText: '#78350f',
};
const dark: typeof light = {
  bg: '#14120f', card: '#1f1c18', text: '#f3efe9', muted: '#a39c93', border: '#332e28',
  accent: '#fb923c', accentText: '#1a0f06', chord: '#fb923c', danger: '#f87171', warnBg: '#3b2f0b', warnText: '#fde68a',
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);
