export const colors = {
  background: '#170709',
  backgroundAlt: '#1F0B0E',
  surface: '#2A0F14',
  surfaceAlt: '#33141A',
  surfaceRaised: '#3B1720',
  border: 'rgba(240, 185, 61, 0.28)',
  borderStrong: 'rgba(240, 185, 61, 0.55)',

  gold: '#F0B93D',
  goldLight: '#FFDE8C',
  goldDark: '#B8862A',

  crimson: '#C4172C',
  crimsonLight: '#FF4D5E',
  crimsonDark: '#7A0E1C',

  textPrimary: '#FFFFFF',
  textSecondary: '#CBB4B8',
  textMuted: '#8E7377',

  positive: '#3ECF8E',
  negative: '#FF6B6B',

  overlay: 'rgba(9, 2, 3, 0.72)',
} as const;

export const gradients = {
  background: [colors.background, '#100304'] as const,
  goldButton: [colors.goldLight, colors.gold, colors.goldDark] as const,
  crimsonButton: [colors.crimsonLight, colors.crimson, colors.crimsonDark] as const,
  card: [colors.surfaceAlt, colors.surface] as const,
  balanceCard: ['#3A1409', '#2A0F14', '#170709'] as const,
  peachCard: ['#FFCB8E', '#E8935A', '#B85F2E'] as const,
  vipCard: ['#3B2508', '#1F0B0E'] as const,
  rankGold: ['#FFE9A8', '#F0B93D', '#8A6110'] as const,
  rankSilver: ['#F1F3F6', '#B9C1CB', '#6E767F'] as const,
  rankBronze: ['#F4C79A', '#C97B3D', '#7A4620'] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
};

export const typography = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  display: 32,
};

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  glow: {
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
};
