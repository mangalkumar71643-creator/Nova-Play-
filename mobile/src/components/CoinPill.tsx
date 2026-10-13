import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

type Props = { coins: number; size?: 'sm' | 'md' };

function formatCoins(value: number) {
  return value.toLocaleString('en-IN');
}

export default function CoinPill({ coins, size = 'md' }: Props) {
  const [displayValue, setDisplayValue] = useState(coins);
  const anim = useRef(new Animated.Value(coins)).current;
  const prevCoins = useRef(coins);

  useEffect(() => {
    if (prevCoins.current === coins) return;
    prevCoins.current = coins;
    const listener = anim.addListener(({ value }) => setDisplayValue(Math.round(value)));
    Animated.timing(anim, { toValue: coins, duration: 500, useNativeDriver: false }).start();
    return () => anim.removeListener(listener);
  }, [coins, anim]);

  return (
    <View style={[styles.pill, size === 'sm' && styles.pillSm]}>
      <MaterialCommunityIcons name="circle-multiple" size={size === 'sm' ? 14 : 18} color={colors.gold} />
      <Text style={[styles.value, size === 'sm' && styles.valueSm]}>{formatCoins(displayValue)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  pillSm: { paddingVertical: 4, paddingHorizontal: spacing.sm },
  value: { color: colors.gold, fontWeight: '800', fontSize: typography.md, marginLeft: spacing.xs },
  valueSm: { fontSize: typography.sm },
});
