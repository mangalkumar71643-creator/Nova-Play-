import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { BallColor, ColorBallBetRow, ColorBallConfig, fetchColorBallConfig, fetchColorBallHistory, playColorBall } from '../api/backend';
import GameInfoButton from '../components/GameInfoButton';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const DEEP_GOLD = '#B8860B';
const GREEN_TEXT = '#3DFF8A';
const TEXT = '#F4F0FF';
const INK = '#120A24';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const TOAST_MS = 1800;
/** No paid draw resolves faster than this, press to result. */
const MIN_DRAW_MS = 2500;
/** The drum mixes at least this long before a ball drops. */
const MIX_MS = 1500;
const COLORS: BallColor[] = ['RED', 'BLUE', 'GREEN', 'GOLD'];
/** Used until the config arrives; the server's drum replaces it. */
const FALLBACK_BALLS: BallColor[] = [...Array<BallColor>(9).fill('RED'), ...Array<BallColor>(7).fill('BLUE'), ...Array<BallColor>(3).fill('GREEN'), 'GOLD'];
const FALLBACK_PAYS: Record<BallColor, number> = { RED: 1.95, BLUE: 2.51, GREEN: 5.86, GOLD: 17.6 };

/** Sphere shading per colour: highlight, body, shadow. */
const SHADE: Record<BallColor, [string, string, string]> = {
  RED: ['#FFB0B8', '#F0203A', '#6A0010'],
  BLUE: ['#B8DCFF', '#2A7AF0', '#0A2A6A'],
  GREEN: ['#B8FFD0', '#1AC85A', '#05502A'],
  GOLD: ['#FFFBE0', '#FFC81A', '#8A5A00'],
};
const LABEL_COLOR: Record<BallColor, string> = { RED: '#FF5A6E', BLUE: '#5AA8FF', GREEN: '#3ADC7A', GOLD: GOLD };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Rounded down like the server, without float error. */
function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- art ----------

/** A glossy lottery ball with its number on a white disc. */
export const Ball = memo(function Ball({ color, n, size }: { color: BallColor; n?: number; size: number }) {
  const u = `cb${useId().replace(/:/g, '')}`;
  const [hi, body, shadow] = SHADE[color];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${u}g`} cx="0.36" cy="0.3" r="0.78">
          <Stop offset="0" stopColor={hi} />
          <Stop offset="0.45" stopColor={body} />
          <Stop offset="1" stopColor={shadow} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={47} fill={`url(#${u}g)`} />
      {n !== undefined && (
        <>
          <Circle cx={50} cy={52} r={24} fill="#FFFFFF" opacity={0.95} />
          <SvgText x={50} y={61} fontSize={n >= 10 ? 24 : 27} fontWeight="900" fill={color === 'GOLD' ? '#6A4400' : shadow} textAnchor="middle">
            {n}
          </SvgText>
        </>
      )}
      <Ellipse cx={34} cy={24} rx={15} ry={8} fill="#FFFFFF" opacity={0.55} transform="rotate(-25 34 24)" />
    </Svg>
  );
});

/** The glass drum: clear sphere, reflections and a brass rim. Drawn over the balls. */
const GlobeGlass = memo(function GlobeGlass({ size }: { size: number }) {
  const u = `gl${useId().replace(/:/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={`${u}g`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="1" stopColor="#C8E8FF" stopOpacity={0.35} />
        </RadialGradient>
        <SvgLinearGradient id={`${u}r`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF4C0" />
          <Stop offset="0.5" stopColor={DEEP_GOLD} />
          <Stop offset="1" stopColor="#FFE08A" />
        </SvgLinearGradient>
      </Defs>
      <Circle cx={50} cy={50} r={48} fill={`url(#${u}g)`} />
      <Path d="M22,26 A34,34 0 0 1 52,12" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.55} />
      <Path d="M17,38 A36,36 0 0 1 19,32" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.45} />
      <Path d="M80,72 A36,36 0 0 1 66,84" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.25} />
      <Circle cx={50} cy={50} r={48.5} fill="none" stroke={`url(#${u}r)`} strokeWidth={2.4} />
      {/* the mouth the ball drops through */}
      <Rect x={42} y={93} width={16} height={7} rx={2} fill="#2A1A3A" stroke={`url(#${u}r)`} strokeWidth={1.4} />
    </Svg>
  );
});

/** Home tile art: the glass drum with a gold ball dropping out. */
export function ColorBallTileArt({ size }: { size: number }) {
  const g = size * 0.6;
  const b = g * 0.24;
  const spots: [number, number, BallColor][] = [
    [0.3, 0.62, 'RED'],
    [0.52, 0.66, 'BLUE'],
    [0.72, 0.58, 'RED'],
    [0.4, 0.4, 'GREEN'],
    [0.62, 0.38, 'BLUE'],
    [0.22, 0.42, 'BLUE'],
    [0.5, 0.2, 'RED'],
  ];
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, alignItems: 'center' }} pointerEvents="none">
      <LinearGradient colors={['#3A1A6A', '#120A24']} style={StyleSheet.absoluteFill} />
      <View style={{ marginTop: size * 0.04, width: g, height: g, borderRadius: g / 2, overflow: 'hidden', backgroundColor: 'rgba(120,180,255,0.08)' }}>
        {spots.map(([x, y, c], i) => (
          <View key={i} style={{ position: 'absolute', left: x * g - b / 2, top: y * g - b / 2 }}>
            <Ball color={c} size={b} />
          </View>
        ))}
        <GlobeGlass size={g} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.62, top: size * 0.5 }}>
        <Ball color="GOLD" n={20} size={size * 0.26} />
      </View>
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub?: string; tone: BallColor };
type Shown = { pick: BallColor; ball: number; color: BallColor; payout: number; stake: number; m: number };

/** Where each ball rests (piled at the bottom) and where it flies while mixing, inside a drum of radius R. */
function layout(R: number, b: number, n: number) {
  const rest: { x: number; y: number }[] = [];
  let row = 0;
  // Rows of balls from the floor up, each centred and kept inside the glass.
  const inner = R - b / 2 - 3;
  while (rest.length < n && row < 12) {
    const y = inner - b * 0.35 - row * b * 0.87;
    const half = Math.sqrt(Math.max(0, inner * inner - y * y));
    const count = Math.max(1, Math.floor((half * 2) / b) + 1);
    const span = (count - 1) * b;
    for (let k = 0; k < count && rest.length < n; k++) rest.push({ x: -span / 2 + k * b, y });
    row++;
  }
  const fly = Array.from({ length: n }, (_, i) => {
    const r = (R - b * 0.62) * Math.sqrt((i + 0.5) / n);
    const t = i * 2.39996;
    return { x: Math.cos(t) * r, y: Math.sin(t) * r };
  });
  return { rest, fly };
}

export default function ColorBallScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<ColorBallConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [pick, setPick] = useState<BallColor>('RED');
  const [busy, setBusy] = useState(false);
  const [drawn, setDrawn] = useState<{ ball: number; color: BallColor } | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [recent, setRecent] = useState<{ ball: number; color: BallColor }[]>([]);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'info' | 'history' | null>(null);
  const [history, setHistory] = useState<ColorBallBetRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const mix = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const jig = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const S = Math.min(W - 12, 470);
  const G = Math.min(S * 0.62, 280);
  const R = G / 2;
  const b = G * 0.15;
  const big = Math.min(S * 0.24, 104);

  const balls = config?.balls ?? FALLBACK_BALLS;
  const { rest, fly } = useMemo(() => layout(R, b, balls.length), [R, b, balls.length]);
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((v) => v >= minStake && v <= maxStake), [minStake, maxStake]);
  const info = useCallback(
    (c: BallColor) => config?.colors.find((x) => x.color === c) ?? { color: c, balls: FALLBACK_BALLS.filter((x) => x === c).length, multiplier: FALLBACK_PAYS[c], rtpPercent: 88 },
    [config],
  );

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchColorBallConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    const jiggle = Animated.loop(
      Animated.sequence([
        Animated.timing(jig, { toValue: 1, duration: 140, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(jig, { toValue: -1, duration: 280, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(jig, { toValue: 0, duration: 140, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    jiggle.start();
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      loop.stop();
      jiggle.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse, jig]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const flashBanner = useCallback(
    async (bn: Banner, hold: number) => {
      setBanner(bn);
      bannerAnim.setValue(0);
      await run(Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }));
      await wait(hold);
      await run(Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim],
  );

  const draw = useCallback(async () => {
    if (busyRef.current || !config) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setShown(null);
    setDrawn(null);
    glow.setValue(0);
    setShownBalance((v) => round2(v - bet));
    const t0 = Date.now();
    // Balls lift off and the drum turns until the server answers.
    Animated.timing(mix, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    spin.setValue(0);
    const turning = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }));
    turning.start();
    try {
      const res = await playColorBall(bet, pick);
      if (!mountedRef.current) return;
      await wait(Math.max(0, MIX_MS - (Date.now() - t0)));
      turning.stop();
      const at = await new Promise<number>((r) => spin.stopAnimation(r));
      // Finish the turn and let the balls settle as the winning one drops out.
      await run(
        Animated.parallel([
          Animated.timing(spin, { toValue: 1, duration: Math.max(120, (1 - at) * 700), easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(mix, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      );
      if (!mountedRef.current) return;
      spin.setValue(0);
      setDrawn({ ball: res.ball, color: res.color });
      drop.setValue(0);
      pop.setValue(0.5);
      await run(
        Animated.sequence([
          Animated.timing(drop, { toValue: 1, duration: 420, easing: Easing.bounce, useNativeDriver: true }),
          Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        ]),
      );
      await wait(Math.max(0, MIN_DRAW_MS - (Date.now() - t0)));
      if (!mountedRef.current) return;
      const payout = Number(res.payout);
      const m = Number(res.multiplier);
      setShown({ pick: res.pick, ball: res.ball, color: res.color, payout, stake: bet, m });
      setRecent((r) => [{ ball: res.ball, color: res.color }, ...r].slice(0, 12));
      setShownBalance((v) => round2(v + payout));
      setSessionNet((v) => round2(v + payout - bet));
      refreshWallet();
      if (panel === 'history')
        fetchColorBallHistory(30)
          .then((rows) => mountedRef.current && setHistory(rows))
          .catch(() => {});
      // Only a return above the stake is celebrated.
      if (payout > bet) {
        Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 180, useNativeDriver: true }), Animated.timing(glow, { toValue: 0.35, duration: 900, useNativeDriver: true })]).start();
        await flashBanner({ title: res.color === 'GOLD' ? 'GOLD BALL!' : 'WIN!', sub: `${m}x · ${money(payout)}`, tone: res.color }, res.color === 'GOLD' ? 1500 : 900);
      }
    } catch (err) {
      turning.stop();
      spin.setValue(0);
      mix.setValue(0);
      if (mountedRef.current) {
        showToast(errorMessage(err));
        setShownBalance(coins);
        refreshWallet();
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [config, bet, shownBalance, pick, mix, spin, drop, pop, glow, flashBanner, panel, coins, refreshWallet, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (busy) return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchColorBallHistory(30)
      .then((rows) => mountedRef.current && setHistory(rows))
      .catch(() => mountedRef.current && setHistory([]));
  };

  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const rtpLine = config ? `${Math.min(...config.colors.map((c) => c.rtpPercent))}–${Math.max(...config.colors.map((c) => c.rtpPercent))}%` : '88%';
  const won = shown !== null && shown.payout > shown.stake;
  const stageH = G + big + 92;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#2A0E4A', '#120A24', '#07040E']} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={TEXT} />
          <MaterialCommunityIcons name="billiards" size={18} color={GOLD} />
          <Text style={styles.title}>COLOR BALL</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }} scrollEnabled={!busy}>
        {/* Recent draws */}
        <View style={[styles.recentRow, { width: S }]}>
          {recent.length === 0 ? (
            <Text style={styles.recentEmpty}>Your last draws show here</Text>
          ) : (
            recent.map((r, i) => (
              <View key={i} style={{ opacity: 1 - i * 0.06 }}>
                <Ball color={r.color} n={r.ball} size={26} />
              </View>
            ))
          )}
        </View>

        {/* Stage */}
        <View style={[styles.stage, { width: S, height: stageH }]}>
          <LinearGradient colors={['#4A1A7A', '#1E0A3A', '#0E061C']} style={StyleSheet.absoluteFill} />
          {Array.from({ length: 12 }, (_, i) => (
            <View key={i} style={[styles.ray, { left: S / 2 - 1, top: 14 + R, height: S * 0.8, transform: [{ rotate: `${i * 30}deg` }, { translateY: -S * 0.4 }] }]} />
          ))}
          {/* the drum */}
          <View style={{ position: 'absolute', top: 14, left: (S - G) / 2, width: G, height: G }}>
            <View style={[styles.globeInside, { width: G, height: G, borderRadius: R }]}>
              <Animated.View
                style={{
                  position: 'absolute',
                  left: R,
                  top: R,
                  width: 0,
                  height: 0,
                  transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
                }}
              >
                {balls.map((c, i) => {
                  const sign = i % 2 ? 1 : -1;
                  const jx = Animated.multiply(jig.interpolate({ inputRange: [-1, 1], outputRange: [-b * 0.35 * sign, b * 0.35 * sign] }), mix);
                  const jy = Animated.multiply(jig.interpolate({ inputRange: [-1, 1], outputRange: [b * 0.3 * (i % 3 ? 1 : -1), -b * 0.3 * (i % 3 ? 1 : -1)] }), mix);
                  const gone = drawn !== null && drawn.ball === i + 1;
                  return (
                    <Animated.View
                      key={i}
                      style={{
                        position: 'absolute',
                        left: -b / 2,
                        top: -b / 2,
                        opacity: gone ? 0 : 1,
                        transform: [
                          { translateX: Animated.add(mix.interpolate({ inputRange: [0, 1], outputRange: [rest[i].x, fly[i].x] }), jx) },
                          { translateY: Animated.add(mix.interpolate({ inputRange: [0, 1], outputRange: [rest[i].y, fly[i].y] }), jy) },
                        ],
                      }}
                    >
                      <Ball color={c} n={i + 1} size={b} />
                    </Animated.View>
                  );
                })}
              </Animated.View>
            </View>
            <GlobeGlass size={G} />
          </View>
          {/* stand and chute */}
          <LinearGradient colors={['#FFF0B0', DEEP_GOLD, '#5A3A00']} style={[styles.stand, { top: 14 + G - 4, left: S / 2 - 34 }]} />
          {/* the drawn ball's cradle */}
          <View style={[styles.cradle, { top: 14 + G + 18, width: big + 26, height: big + 26, borderRadius: (big + 26) / 2, left: (S - big - 26) / 2 }]}>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: (big + 26) / 2, backgroundColor: drawn ? SHADE[drawn.color][1] : GOLD, opacity: glow }]} />
            {drawn ? (
              <Animated.View
                style={{
                  transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-big * 0.9, 0] }) }, { scale: pop }],
                }}
              >
                <Ball color={drawn.color} n={drawn.ball} size={big} />
              </Animated.View>
            ) : (
              <Text style={styles.cradleText}>{busy ? 'MIXING…' : '?'}</Text>
            )}
          </View>
          {/* Result plate */}
          <View style={[styles.plate, { top: 14 + G + big + 32 }]}>
            {shown ? (
              won ? (
                <Text style={styles.plateWin}>
                  WIN {money(shown.payout)} <Text style={styles.plateSub}>({shown.m}x)</Text>
                </Text>
              ) : (
                <Text style={styles.plateText}>
                  BALL {shown.ball} · <Text style={{ color: LABEL_COLOR[shown.color] }}>{shown.color}</Text> · NO WIN
                </Text>
              )
            ) : (
              <Text style={styles.plateText}>{busy ? 'DRAWING…' : 'PICK A COLOUR · DRAW'}</Text>
            )}
          </View>
        </View>

        {/* Colours */}
        <View style={[styles.pickRow, { width: S }]}>
          {COLORS.map((c) => {
            const on = c === pick;
            const it = info(c);
            const hit = shown !== null && shown.pick === c && shown.color === c;
            return (
              <Pressable
                key={c}
                onPress={() => !busy && setPick(c)}
                disabled={busy}
                style={[styles.pick, on && { borderColor: LABEL_COLOR[c], backgroundColor: 'rgba(255,255,255,0.08)' }, busy && !on && styles.dim]}
              >
                {on && <MaterialCommunityIcons name="check-circle" size={13} color={LABEL_COLOR[c]} style={styles.pickCheck} />}
                <Ball color={c} size={30} />
                <Text style={[styles.pickName, { color: on ? LABEL_COLOR[c] : '#C8B8E0' }]}>{c}</Text>
                <Text style={[styles.pickPay, hit && { color: GREEN_TEXT }]}>{it.multiplier}x</Text>
                <Text style={styles.pickSub}>
                  {it.balls} of {balls.length}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.paysLine}>
          {pick} pays {money(Math.min(floor2(bet * info(pick).multiplier), maxPayout))} on a {money(bet)} bet
        </Text>

        {/* Session (time played and net position, always on show) */}
        <View style={[styles.session, { width: S }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#D8C8F0" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? GREEN_TEXT : sessionNet < 0 ? '#FF9AA6' : '#D8C8F0' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        {/* Controls: no autoplay or turbo */}
        <View style={[styles.controls, { width: S }]}>
          <Pressable onPress={() => setPanel('info')} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="information-outline" size={20} color={GOLD} />
            <Text style={styles.sideText}>RULES</Text>
          </Pressable>
          <View style={styles.betBox}>
            <Text style={styles.betLabel}>BET</Text>
            <View style={styles.betRow}>
              <Pressable onPress={() => stepBet(-1)} disabled={busy} style={[styles.betBtn, busy && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="minus" size={18} color={INK} />
              </Pressable>
              <Text style={styles.betValue}>{money(bet)}</Text>
              <Pressable onPress={() => stepBet(1)} disabled={busy} style={[styles.betBtn, busy && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={18} color={INK} />
              </Pressable>
            </View>
          </View>
          <Pressable onPress={draw} disabled={busy || !config} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Animated.View style={[styles.mainHalo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }]} />
            <LinearGradient colors={busy || !config ? ['#5A4A6A', '#2A1E3A'] : ['#FFF4C8', GOLD, DEEP_GOLD]} style={styles.mainBtn}>
              <MaterialCommunityIcons name={busy ? 'dots-horizontal' : 'billiards'} size={26} color={INK} />
              {!busy && <Text style={styles.mainSmall}>DRAW</Text>}
            </LinearGradient>
          </Pressable>
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={GOLD} />
            <Text style={styles.sideText}>HISTORY</Text>
          </Pressable>
        </View>

        <GameInfoButton>
          RTP {rtpLine} · bet {money(minStake)}–{money(maxStake)} · max {money(maxPayout)} per draw{'\n'}
          No autoplay or turbo · each draw takes at least 2.5 seconds · provably fair
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View pointerEvents="none" style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
          <LinearGradient
            colors={banner.tone === 'GOLD' ? ['#FFF4C8', GOLD, '#B87800'] : [SHADE[banner.tone][1], SHADE[banner.tone][2]]}
            style={[styles.bannerInner, { borderColor: banner.tone === 'GOLD' ? '#FFFFFF' : GOLD }]}
          >
            <MaterialCommunityIcons name="star-four-points" size={30} color={banner.tone === 'GOLD' ? '#5A2A00' : GOLD} />
            <Text style={[styles.bannerText, banner.tone === 'GOLD' && { color: '#3A1A00' }]}>{banner.title}</Text>
            {banner.sub ? <Text style={[styles.bannerSub, banner.tone === 'GOLD' && { color: '#5A2A00' }]}>{banner.sub}</Text> : null}
          </LinearGradient>
        </Animated.View>
      )}

      {toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={panel !== null} transparent animationType="fade" onRequestClose={() => setPanel(null)}>
        <Pressable style={styles.modalBack} onPress={() => setPanel(null)}>
          <Pressable style={[styles.modalCard, { width: Math.min(W - 24, 440) }]} onPress={() => {}}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{panel === 'info' ? 'HOW TO PLAY' : 'MY DRAWS'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={TEXT} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'info' ? <Rules bet={bet} config={config} /> : <History bets={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Rules({ bet, config }: { bet: number; config: ColorBallConfig | null }) {
  if (!config) return <Text style={styles.note}>Loading…</Text>;
  const total = config.balls.length;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.note}>
        Pick a colour and your bet, then DRAW. The drum holds {total} numbered balls; one is drawn. If it is your colour, your bet pays that colour&apos;s multiplier; otherwise the bet is lost.
      </Text>
      <Text style={styles.section}>PAYS</Text>
      {config.colors.map((c) => (
        <View key={c.color} style={[styles.tRow, { alignItems: 'center' }]}>
          <View style={{ flex: 1.1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ball color={c.color} size={20} />
            <Text style={[styles.tCell, { color: LABEL_COLOR[c.color] }]}>{c.color}</Text>
          </View>
          <Text style={[styles.tCell, { color: '#B8A8D0' }]}>
            {c.balls} of {total}
          </Text>
          <Text style={styles.tCell}>{c.multiplier}x</Text>
          <Text style={[styles.tCell, { textAlign: 'right' }]}>{money(Math.min(floor2(bet * c.multiplier), config.maxPayout))}</Text>
        </View>
      ))}
      <Text style={styles.section}>GAME INFO</Text>
      <Text style={styles.note}>
        Every ball is equally likely to be drawn. Returns: {config.colors.map((c) => `${c.color} ${c.rtpPercent}%`).join(' · ')}. No autoplay or turbo; each draw takes at least 2.5 seconds. The ball
        comes from your provably-fair seeds (server seed hash, client seed and nonce on each draw).
      </Text>
    </View>
  );
}

function History({ bets }: { bets: ColorBallBetRow[] | null }) {
  if (bets === null) return <Text style={styles.note}>Loading…</Text>;
  if (bets.length === 0) return <Text style={styles.note}>No draws yet.</Text>;
  return (
    <View>
      {bets.map((row) => {
        const payout = Number(row.payout);
        const d = new Date(row.createdAt);
        return (
          <View key={row.id} style={styles.histRow}>
            <Text style={styles.histTime}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.histStake}>{money(Number(row.stake))}</Text>
            <Text style={[styles.histPick, { color: LABEL_COLOR[row.pick] }]}>{row.pick}</Text>
            <View style={{ flex: 1 }}>
              <Ball color={row.color} n={row.ball} size={22} />
            </View>
            <Text style={[styles.histWin, { color: payout > 0 ? GREEN_TEXT : '#8A8FA8' }]}>{payout > 0 ? `+${money(payout)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07040E' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  title: { color: TEXT, fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,214,107,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,214,107,0.45)',
  },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  recentRow: { flexDirection: 'row', gap: 4, height: 30, alignItems: 'center', overflow: 'hidden', marginBottom: 6 },
  recentEmpty: { color: '#7A6A98', fontSize: 11, fontWeight: '700' },
  stage: { borderRadius: 20, overflow: 'hidden', borderWidth: 2.5, borderColor: DEEP_GOLD },
  ray: { position: 'absolute', width: 2, backgroundColor: 'rgba(255,214,107,0.07)' },
  globeInside: { overflow: 'hidden', backgroundColor: 'rgba(120,170,255,0.07)' },
  stand: { position: 'absolute', width: 68, height: 16, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  cradle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2.5,
    borderColor: GOLD,
  },
  cradleText: { color: '#8A7AA8', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  plate: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(8,4,16,0.85)', borderWidth: 1.5, borderColor: GOLD },
  plateText: { color: TEXT, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  plateWin: { color: GREEN_TEXT, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  plateSub: { color: GOLD, fontSize: 13 },
  pickRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  pick: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: '#3A2A5A', gap: 1 },
  pickCheck: { position: 'absolute', top: 4, right: 5 },
  pickName: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 2 },
  pickPay: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  pickSub: { color: '#9A8AB8', fontSize: 9.5, fontWeight: '700' },
  paysLine: { color: '#B8A8D0', fontSize: 11, fontWeight: '700', marginTop: 6 },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  sessionText: { color: '#D8C8F0', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#5A4A70', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideText: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: { color: '#C8B0E0', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  betRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20,6,34,0.9)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#5A2A8A',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  betBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: TEXT, alignItems: 'center', justifyContent: 'center' },
  betValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'center' },
  dim: { opacity: 0.4 },
  mainWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  mainHalo: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: GOLD },
  mainBtn: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  mainSmall: { color: INK, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  banner: { position: 'absolute', top: '56%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 16, borderWidth: 3, alignItems: 'center' },
  bannerText: { color: TEXT, fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  bannerSub: { color: GOLD, fontSize: 14, fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#1E0A34', borderRadius: 16, borderWidth: 2, borderColor: DEEP_GOLD, padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: TEXT, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  note: { color: '#D8C8F0', fontSize: 12, lineHeight: 17 },
  section: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  tRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  tCell: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 6 },
  histTime: { color: '#A898B8', fontSize: 11, width: 64 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 66 },
  histPick: { fontSize: 10, fontWeight: '900', width: 50 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
