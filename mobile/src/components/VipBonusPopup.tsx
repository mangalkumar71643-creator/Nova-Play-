import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors, gradients, radius, spacing, typography } from '../theme';
import { VipEmblem, vipTier } from './VipEmblem';

export type VipBonusResult =
  | { kind: 'success'; bonus: 'upgrade' | 'monthly'; level: number; amount: number; nextMonthly?: string }
  /** Agent (EARN) rewards claimed into the balance. */
  | { kind: 'success'; bonus: 'agent'; level?: undefined; amount: number; nextMonthly?: undefined }
  | { kind: 'error'; message: string; kicker?: string };

const RAYS = 18;
const COINS = 12;

/** Slowly turning gold sunburst behind the emblem. */
function Sunburst({ size }: { size: number }) {
  const c = size / 2;
  const half = Math.PI / RAYS / 2.2;
  const rays = Array.from({ length: RAYS }, (_, i) => {
    const a = (i / RAYS) * Math.PI * 2;
    const x1 = c + Math.cos(a - half) * c;
    const y1 = c + Math.sin(a - half) * c;
    const x2 = c + Math.cos(a + half) * c;
    const y2 = c + Math.sin(a + half) * c;
    return `M${c} ${c} L${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
  }).join(' ');
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="burst" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFF3C4" stopOpacity="0.95" />
          <Stop offset="0.35" stopColor="#FFC94A" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FF8A1F" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFE9A8" stopOpacity="0.85" />
          <Stop offset="0.5" stopColor="#FF4D6A" stopOpacity="0.25" />
          <Stop offset="1" stopColor="#FF4D6A" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Path d={rays} fill="url(#burst)" />
      <Circle cx={c} cy={c} r={c * 0.55} fill="url(#halo)" />
    </Svg>
  );
}

/** "1 Nov": the day the next monthly bonus opens. */
export function nextMonthLabel(iso?: string) {
  if (!iso) return null;
  // The reset is midnight India time; read the date there whatever the phone's zone.
  const d = new Date(Date.parse(iso) + 5.5 * 60 * 60 * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

/** Celebration shown after a VIP bonus claim (or a styled notice when it can't be claimed). */
export default function VipBonusPopup({ result, onClose }: { result: VipBonusResult | null; onClose: () => void }) {
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(340, screenWidth - spacing.lg * 3);
  const emblemSize = Math.round(width * 0.44);
  const burstSize = Math.round(width * 1.25);

  const enter = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const count = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  const success = result?.kind === 'success' ? result : null;

  useEffect(() => {
    if (!result) return;
    [enter, pop, spin, burst, twinkle, shine, count].forEach((v) => v.setValue(0));
    setShown(0);
    const id = count.addListener(({ value }) => setShown(Math.round(value)));
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 16000, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(twinkle, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(twinkle, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.delay(700),
          Animated.timing(shine, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ),
    ];
    loops.forEach((l) => l.start());
    Animated.sequence([
      Animated.timing(enter, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(count, {
          toValue: result.kind === 'success' ? result.amount : 0,
          duration: 1000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
    ]).start();
    return () => {
      count.removeListener(id);
      loops.forEach((l) => l.stop());
    };
  }, [result, enter, pop, spin, burst, twinkle, shine, count]);

  if (!result) return null;

  const cardScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  const emblemScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const twinkleScale = twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.15] });
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-width, width] });
  const centreY = emblemSize / 2;
  const next = success?.bonus === 'monthly' ? nextMonthLabel(success.nextMonthly) : null;
  const tier = success && success.bonus !== 'agent' ? vipTier(success.level) : null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={{ width, alignItems: 'center', opacity: enter, transform: [{ scale: cardScale }] }}>
          {success ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: centreY - burstSize / 2,
                left: (width - burstSize) / 2,
                width: burstSize,
                height: burstSize,
                opacity: pop,
                transform: [{ rotate }],
              }}
            >
              <Sunburst size={burstSize} />
            </Animated.View>
          ) : null}

          <View style={{ height: emblemSize }} />

          <LinearGradient
            colors={['#8A1A2E', '#4E0C18', '#22040A']}
            locations={[0, 0.5, 1]}
            style={[styles.card, { marginTop: -Math.round(emblemSize * 0.42), paddingTop: Math.round(emblemSize * 0.66) }]}
          >
            <View pointerEvents="none" style={styles.innerFrame} />
            {success ? (
              <>
                <Text style={styles.kicker}>CONGRATULATIONS</Text>
                <Text style={styles.title}>
                  {success.bonus === 'agent'
                    ? 'Agent Rewards'
                    : `VIP ${success.level} ${success.bonus === 'upgrade' ? 'Upgrade' : 'Monthly'} Bonus`}
                </Text>
                <Text style={styles.amount}>+₹{shown.toLocaleString('en-IN')}</Text>
                <View style={styles.ornament}>
                  <LinearGradient colors={['transparent', colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ornamentLine} />
                  <View style={styles.ornamentGem} />
                  <LinearGradient colors={[colors.gold, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ornamentLine} />
                </View>
                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="check-circle" size={16} color={colors.positive} />
                  <Text style={styles.infoText}>Added to your balance</Text>
                </View>
                <Text style={styles.note}>Play it once before withdrawing.</Text>
                {next ? <Text style={styles.note}>Next monthly bonus opens on {next}.</Text> : null}
              </>
            ) : (
              <>
                <Text style={styles.kicker}>{(result.kind === 'error' && result.kicker) || 'VIP BONUS'}</Text>
                <Text style={styles.title}>Not available</Text>
                <Text style={styles.errorText}>{result.kind === 'error' ? result.message : ''}</Text>
              </>
            )}

            <Pressable onPress={onClose} style={styles.buttonWrap}>
              <LinearGradient colors={gradients.goldButton} style={styles.button}>
                <View style={styles.buttonGloss} />
                <Animated.View pointerEvents="none" style={[styles.buttonShine, { transform: [{ translateX: shineX }, { skewX: '-20deg' }] }]} />
                <Text style={styles.buttonText}>{success ? 'Collect' : 'OK'}</Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>

          <Animated.View
            style={[styles.emblem, { width: emblemSize, height: emblemSize, left: (width - emblemSize) / 2, transform: [{ scale: emblemScale }] }]}
          >
            {success?.bonus === 'agent' ? (
              <LinearGradient colors={['#FFF0B0', colors.gold, colors.goldDark]} style={[styles.errorBadge, { borderRadius: emblemSize / 2 }]}>
                <MaterialCommunityIcons name="hand-coin" size={Math.round(emblemSize * 0.5)} color="#5C3A0E" />
              </LinearGradient>
            ) : success && tier ? (
              <>
                <VipEmblem level={success.level ?? 0} size={emblemSize} />
                <LinearGradient colors={tier.ribbon} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.ribbon}>
                  <Text style={styles.ribbonText}>V{success.level}</Text>
                </LinearGradient>
              </>
            ) : (
              <LinearGradient colors={['#7E1B2E', '#3A0913']} style={[styles.errorBadge, { borderRadius: emblemSize / 2 }]}>
                <MaterialCommunityIcons name="calendar-lock" size={Math.round(emblemSize * 0.42)} color={colors.goldLight} />
              </LinearGradient>
            )}
          </Animated.View>

          {success
            ? Array.from({ length: COINS }, (_, i) => {
                const angle = (i / COINS) * Math.PI * 2 - Math.PI / 2;
                const reach = emblemSize * (0.62 + (i % 3) * 0.14);
                return (
                  <Animated.View
                    key={i}
                    pointerEvents="none"
                    style={[
                      styles.coin,
                      {
                        top: centreY - 8,
                        left: width / 2 - 8,
                        opacity: burst.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                        transform: [
                          { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * reach] }) },
                          { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * reach + emblemSize * 0.25] }) },
                          { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${i % 2 ? 300 : -300}deg`] }) },
                          { scale: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.3, 1.1, 0.7] }) },
                        ],
                      },
                    ]}
                  >
                    <LinearGradient colors={['#FFF0B0', colors.gold, colors.goldDark]} style={styles.coinFace}>
                      <Text style={styles.coinText}>₹</Text>
                    </LinearGradient>
                  </Animated.View>
                );
              })
            : null}

          {success
            ? [
                { x: -0.42, y: 0.1, s: 18 },
                { x: 0.4, y: 0.02, s: 14 },
                { x: -0.3, y: 0.9, s: 12 },
                { x: 0.34, y: 0.82, s: 20 },
              ].map((p, i) => (
                <Animated.View
                  key={`t${i}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: p.y * emblemSize - p.s / 2,
                    left: width / 2 + p.x * width - p.s / 2,
                    opacity: i % 2 ? twinkle : twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                    transform: [{ scale: twinkleScale }],
                  }}
                >
                  <MaterialCommunityIcons name="star-four-points" size={p.s} color="#FFF1C2" />
                </Animated.View>
              ))
            : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,1,3,0.86)', alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '100%',
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255,222,140,0.65)',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    shadowColor: '#FFB83D',
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  innerFrame: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.18)',
  },
  emblem: { position: 'absolute', top: 0, alignItems: 'center' },
  ribbon: {
    position: 'absolute',
    bottom: '6%',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  ribbonText: {
    color: '#FFFFFF',
    fontSize: typography.md,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  errorBadge: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,222,140,0.6)',
  },
  kicker: { color: colors.gold, fontSize: typography.xs, fontWeight: '900', letterSpacing: 3 },
  title: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  amount: {
    color: colors.goldLight,
    fontSize: 46,
    fontWeight: '900',
    marginTop: spacing.xs,
    textShadowColor: 'rgba(255,184,61,0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  ornament: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginVertical: spacing.sm, paddingHorizontal: spacing.lg },
  ornamentLine: { flex: 1, height: 1 },
  ornamentGem: { width: 8, height: 8, marginHorizontal: 8, backgroundColor: colors.goldLight, transform: [{ rotate: '45deg' }] },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' },
  note: { color: colors.textMuted, fontSize: typography.xs, marginTop: 4, textAlign: 'center' },
  errorText: { color: colors.textSecondary, fontSize: typography.sm, marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 },
  buttonWrap: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    borderRadius: radius.pill,
    shadowColor: '#FFB83D',
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  button: {
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,248,220,0.8)',
  },
  buttonGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '48%', backgroundColor: 'rgba(255,255,255,0.22)' },
  buttonShine: { position: 'absolute', top: -10, bottom: -10, width: 36, backgroundColor: 'rgba(255,255,255,0.45)' },
  buttonText: { color: '#3A2006', fontSize: typography.lg, fontWeight: '900', letterSpacing: 1 },
  coin: { position: 'absolute', width: 16, height: 16 },
  coinFace: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFF6D0',
  },
  coinText: { color: '#6B4210', fontSize: 9, fontWeight: '900' },
});
