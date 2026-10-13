import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { DiamondsBet, DiamondsConfig, DiamondsResult, fetchDiamondsConfig, fetchDiamondsHistory, playDiamonds } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const LILAC = '#D8B4FE';
const INK = '#F5EEFF';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const SOUND_KEY = 'novaplay:diamonds:sound';
const TOAST_MS = 1900;

/** Ruby, sapphire, emerald, amethyst, topaz, aquamarine, rose: [light, main, dark]. */
const GEM_COLORS: [string, string, string][] = [
  ['#FF9AAA', '#E3173E', '#7A0820'],
  ['#9DBEFF', '#2F6BFF', '#0E2680'],
  ['#96F7C0', '#14C46A', '#06603A'],
  ['#DFB5FF', '#9B3DF0', '#4A1382'],
  ['#FFE7A6', '#FFB020', '#9A5700'],
  ['#B0FCFF', '#1FD6E6', '#086A75'],
  ['#FFBDEA', '#FF4FC0', '#931467'],
];
const RESULT_NAME: Record<DiamondsResult, string> = {
  FIVE_OF_A_KIND: 'Five of a Kind',
  FOUR_OF_A_KIND: 'Four of a Kind',
  FULL_HOUSE: 'Full House',
  THREE_OF_A_KIND: 'Three of a Kind',
  TWO_PAIR: 'Two Pair',
  PAIR: 'One Pair',
  NONE: 'No Match',
};
/** The look of each result in the paytable: gems of group 0 and 1 share a colour, -1 is any other gem. */
const PATTERN: Record<DiamondsResult, number[]> = {
  FIVE_OF_A_KIND: [0, 0, 0, 0, 0],
  FOUR_OF_A_KIND: [0, 0, 0, 0, -1],
  FULL_HOUSE: [0, 0, 0, 1, 1],
  THREE_OF_A_KIND: [0, 0, 0, -1, -1],
  TWO_PAIR: [0, 0, 1, 1, -1],
  PAIR: [0, 0, -1, -1, -1],
  NONE: [-1, -1, -1, -1, -1],
};
const FALLBACK_PAYTABLE: DiamondsConfig['paytable'] = [
  { result: 'FIVE_OF_A_KIND', multiplier: 50, chancePercent: 0.04 },
  { result: 'FOUR_OF_A_KIND', multiplier: 5, chancePercent: 1.25 },
  { result: 'FULL_HOUSE', multiplier: 4, chancePercent: 2.5 },
  { result: 'THREE_OF_A_KIND', multiplier: 2.7, chancePercent: 12.49 },
  { result: 'TWO_PAIR', multiplier: 1.75, chancePercent: 18.74 },
  { result: 'PAIR', multiplier: 0.1, chancePercent: 49.98 },
  { result: 'NONE', multiplier: 0, chancePercent: 14.99 },
];
const BIG: DiamondsResult[] = ['FULL_HOUSE', 'FOUR_OF_A_KIND', 'FIVE_OF_A_KIND'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function fmtMult(m: number): string {
  return `${Number.isInteger(m) ? m : round2(m)}x`;
}

const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

/** Gems that share their colour with another gem. */
function matchedGems(gems: number[]): boolean[] {
  const counts = new Array<number>(7).fill(0);
  gems.forEach((g) => counts[g]++);
  return gems.map((g) => counts[g] >= 2);
}

// ---------- art ----------

/** A brilliant-cut gem seen from the side: crown facets over a pointed pavilion. */
const Gem = memo(function Gem({ color, size, ghost = false }: { color: number; size: number; ghost?: boolean }) {
  const [light, main, dark] = ghost ? ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.06)'] : GEM_COLORS[color];
  const edge = ghost ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.55)';
  return (
    <Svg width={size} height={size * 0.9} viewBox="0 0 100 90">
      <Path d="M8 32 L28 10 L72 10 L92 32 L50 86 Z" fill={main} />
      <Path d="M28 10 L72 10 L62 32 L38 32 Z" fill={light} />
      <Path d="M8 32 L28 10 L38 32 Z" fill={light} opacity={0.75} />
      <Path d="M92 32 L72 10 L62 32 Z" fill={main} />
      <Path d="M8 32 L38 32 L50 86 Z" fill={main} opacity={0.9} />
      <Path d="M62 32 L92 32 L50 86 Z" fill={dark} />
      <Path d="M38 32 L62 32 L50 86 Z" fill={light} opacity={0.35} />
      <Path d="M8 32 L28 10 L72 10 L92 32 L50 86 Z M8 32 L92 32 M28 10 L38 32 L50 86 L62 32 L72 10" fill="none" stroke={edge} strokeWidth={1.6} strokeLinejoin="round" />
      {!ghost && <Path d="M34 14 L37 20 L43 22 L37 24 L34 30 L31 24 L25 22 L31 20 Z" fill="#FFFFFF" opacity={0.9} />}
    </Svg>
  );
});

function Background({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="dmBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1C0B33" />
          <Stop offset="0.55" stopColor="#120622" />
          <Stop offset="1" stopColor="#07030F" />
        </SvgLinearGradient>
        <RadialGradient id="dmGlow" cx="50%" cy="58%" r="55%">
          <Stop offset="0" stopColor="#A855F7" stopOpacity={0.28} />
          <Stop offset="1" stopColor="#A855F7" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#dmBg)" />
      {/* Light rays fanning up from the gem stage */}
      {[-0.42, -0.2, 0, 0.2, 0.42].map((k, i) => (
        <Path key={i} d={`M${w / 2} ${h * 0.62} L${w / 2 + k * w * 1.6 - w * 0.05} 0 L${w / 2 + k * w * 1.6 + w * 0.05} 0 Z`} fill="#E9D5FF" opacity={0.035} />
      ))}
      <Rect x={0} y={0} width={w} height={h} fill="url(#dmGlow)" />
      {Array.from({ length: 34 }, (_, i) => {
        const a = Math.sin(i * 12.9898) * 43758.5453;
        const b = Math.sin(i * 78.233) * 12543.123;
        return <Circle key={i} cx={(a - Math.floor(a)) * w} cy={(b - Math.floor(b)) * h} r={0.6 + (i % 3) * 0.45} fill="#FFFFFF" opacity={0.28} />;
      })}
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.18} viewBox="0 0 300 54">
      <Defs>
        <SvgLinearGradient id="dmLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.5" stopColor="#E9D5FF" />
          <Stop offset="1" stopColor="#A855F7" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={150} y={38} fontSize={32} fontWeight="bold" fontFamily="serif" fill="url(#dmLogo)" stroke="#2E0B55" strokeWidth={0.8} textAnchor="middle" letterSpacing={6}>
        DIAMONDS
      </SvgText>
      <Path d="M14 26 L24 18 L34 26 L24 40 Z M266 26 L276 18 L286 26 L276 40 Z" fill={GOLD} opacity={0.85} />
    </Svg>
  );
}

/** Home tile art: five gems in an arc on violet velvet. */
export function DiamondsTileArt({ size }: { size: number }) {
  const g = size * 0.27;
  const spots = [
    { c: 0, x: 0.1, y: 0.3 },
    { c: 1, x: 0.28, y: 0.14 },
    { c: 3, x: 0.365, y: 0.36 },
    { c: 2, x: 0.45, y: 0.14 },
    { c: 4, x: 0.63, y: 0.3 },
  ];
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="dmtBg" cx="50%" cy="40%" r="70%">
            <Stop offset="0" stopColor="#5B21B6" />
            <Stop offset="1" stopColor="#12051F" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#dmtBg)" />
      </Svg>
      {spots.map((s, i) => (
        <View key={i} style={{ position: 'absolute', left: s.x * size, top: s.y * size }}>
          <Gem color={s.c} size={g} />
        </View>
      ))}
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub: string };

export default function DiamondsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<DiamondsConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [last, setLast] = useState<DiamondsBet | null>(null);
  const [shown, setShown] = useState<(number | null)[]>([null, null, null, null, null]);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'history' | 'rules' | null>(null);
  const [history, setHistory] = useState<DiamondsBet[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [stageBox, setStageBox] = useState<{ y: number; h: number } | null>(null);
  const [payBottom, setPayBottom] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drops = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(1))).current;
  const glow = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const paytable = config?.paytable ?? FALLBACK_PAYTABLE;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const play = useCallback((name: 'tick' | 'win' | 'land') => {
    if (!soundRef.current) return;
    const p = playersRef.current?.[name];
    if (!p) return;
    try {
      p.seekTo(0);
      p.play();
    } catch {
      // A missed sound effect is harmless.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchDiamondsConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    AsyncStorage.getItem(SOUND_KEY)
      .then((v) => v === 'off' && setSoundOn(false))
      .catch(() => {});
    try {
      setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
      playersRef.current = {
        tick: createAudioPlayer(require('../../assets/sounds/plinko-tick.wav')),
        win: createAudioPlayer(require('../../assets/sounds/plinko-win.wav')),
        land: createAudioPlayer(require('../../assets/sounds/plinko-land.wav')),
      };
    } catch {
      playersRef.current = null;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      mountedRef.current = false;
      loop.stop();
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [glow]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  const showBanner = useCallback(
    (b: Banner) => {
      setBanner(b);
      bannerAnim.setValue(0);
      Animated.sequence([
        Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.delay(1400),
        Animated.timing(bannerAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(() => mountedRef.current && setBanner(null));
    },
    [bannerAnim]
  );

  const doPlay = useCallback(async () => {
    if (busyRef.current) return;
    if (bet > balanceRef.current) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setBanner(null);
    setRevealed(false);
    // The old gems sink away while the server answers.
    const clearing = run(Animated.parallel(drops.map((v) => Animated.timing(v, { toValue: 2, duration: 160, useNativeDriver: true }))));
    let b: DiamondsBet;
    try {
      [b] = await Promise.all([playDiamonds(bet), clearing]);
    } catch (err) {
      await clearing;
      drops.forEach((v) => v.setValue(1));
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      if (last) setRevealed(true);
      return;
    }
    if (!mountedRef.current) return;
    setShownBalance((x) => round2(x - bet));
    setShown([null, null, null, null, null]);
    drops.forEach((v) => v.setValue(0));
    // Gems drop into their cushions one by one.
    for (let i = 0; i < 5; i++) {
      setShown((s) => s.map((g, k) => (k === i ? b.gems[i] : g)));
      play('tick');
      Animated.spring(drops[i], { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
      await new Promise((r) => setTimeout(r, 130));
    }
    await new Promise((r) => setTimeout(r, 220));
    if (!mountedRef.current) return;
    setLast(b);
    setRevealed(true);
    const payout = Number(b.payout);
    if (payout > 0) setShownBalance((x) => round2(x + payout));
    if (BIG.includes(b.result)) {
      play('win');
      showBanner({ title: RESULT_NAME[b.result].toUpperCase(), sub: `₹${payout.toFixed(2)}  ·  ${fmtMult(Number(b.multiplier))}` });
    } else if (payout > Number(b.stake)) play('win');
    else if (payout === 0) play('land');
    refreshWallet().catch(() => {});
    busyRef.current = false;
    setBusy(false);
  }, [bet, drops, last, play, refreshWallet, showBanner, showToast]);

  const changeBet = (dir: -1 | 1) => {
    if (busy) return;
    const i = betLevels.indexOf(bet);
    const next = i < 0 ? betLevels.find((b) => (dir > 0 ? b > bet : b >= bet)) ?? bet : betLevels[Math.min(betLevels.length - 1, Math.max(0, i + dir))];
    setBet(next);
  };

  const scaleBet = (k: 0.5 | 2) => {
    if (busy) return;
    setBet((b) => Math.min(maxStake, Math.max(minStake, Math.round(b * k))));
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    AsyncStorage.setItem(SOUND_KEY, next ? 'on' : 'off').catch(() => {});
  };

  const openPanel = (p: 'history' | 'rules') => {
    setPanel(p);
    if (p === 'history') {
      setHistory(null);
      fetchDiamondsHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const contentW = Math.min(W - 24, 460);
  const headerH = insets.top + 50;
  const compact = H < 760;
  const logoW = Math.min(contentW * 0.7, 290);
  const logoH = compact ? 0 : logoW * 0.18 + 4;
  const gap = 8;
  const stagePad = 12;
  const slot = Math.min((contentW - stagePad * 2 - gap * 4) / 5, 80);
  const gemSize = slot * 0.78;
  const stageH = stagePad * 2 + slot * 1.15 + 34;
  // Leaves room above the gems for the win banner.
  const rowSpace = H - headerH - insets.bottom - 10 - logoH - stageH - 118 - 14 - (compact ? 80 : 40);
  const rowH = Math.max(28, Math.min(compact ? 32 : 40, Math.floor(rowSpace / 7)));
  const mini = Math.min(rowH * 0.62, 20);
  const lit = revealed && last ? last.result : null;
  // The banner sits just over the top edge of the gem stage, clear of the gems and the paytable.
  const bannerTop = stageBox ? Math.max(stageBox.y - 64, (payBottom ?? 0) + 4) : H * 0.55;
  const nameSize = rowH < 32 || contentW < 380 ? 12 : 13.5;
  const matched = revealed && last ? matchedGems(last.gems) : null;

  let status: React.ReactNode;
  if (busy) status = <Text style={styles.statusText}>Dropping gems…</Text>;
  else if (!last) status = <Text style={styles.statusText}>Match gem colours to win — up to 50x</Text>;
  else {
    const payout = Number(last.payout);
    const stake = Number(last.stake);
    status =
      payout > stake ? (
        <Text style={[styles.statusText, { color: GOLD }]}>
          {RESULT_NAME[last.result]} · WIN ₹{payout.toFixed(2)}
        </Text>
      ) : payout > 0 ? (
        <Text style={styles.statusText}>
          {RESULT_NAME[last.result]} · ₹{payout.toFixed(2)} back
        </Text>
      ) : (
        <Text style={styles.statusText}>No match this time</Text>
      );
  }

  return (
    <View style={styles.root}>
      <Background w={W} h={H} />

      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={GOLD} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={GOLD} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={GOLD} />
        </Pressable>
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My bets">
          <MaterialCommunityIcons name="history" size={20} color={GOLD} />
        </Pressable>
        <Pressable onPress={() => openPanel('rules')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Rules">
          <MaterialCommunityIcons name="information-variant" size={22} color={GOLD} />
        </Pressable>
      </View>

      <View style={[styles.body, { paddingTop: headerH, paddingBottom: insets.bottom + 10, width: contentW, alignSelf: 'center' }]}>
        {!compact && (
          <View style={{ alignItems: 'center', marginTop: 2 }} pointerEvents="none">
            <Logo width={logoW} />
          </View>
        )}

        {/* Paytable */}
        <LinearGradient colors={['rgba(76,29,149,0.85)', 'rgba(40,12,78,0.9)', 'rgba(22,6,44,0.95)']} style={styles.paytable} onLayout={(e) => setPayBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
          {paytable.map(({ result, multiplier }) => {
            const on = lit === result;
            const colours = on && last ? groupColours(last.gems) : [3, 1];
            return (
              <View key={result} style={[styles.payRow, { height: rowH }, on && styles.payRowOn]}>
                {on && <LinearGradient colors={['#FFF1B0', GOLD, '#E0A526']} style={StyleSheet.absoluteFill} />}
                {on && <Animated.View style={[StyleSheet.absoluteFill, styles.payGlow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }) }]} />}
                <View style={[styles.pattern, { width: mini * 5 + 8 }]}>
                  {PATTERN[result].map((g, i) => (
                    <Gem key={i} color={g < 0 ? 0 : colours[g]} size={mini} ghost={g < 0} />
                  ))}
                </View>
                <Text style={[styles.payName, { fontSize: nameSize }, on && styles.payDark]} numberOfLines={1}>
                  {RESULT_NAME[result].toUpperCase()}
                </Text>
                <Text style={[styles.payMult, { fontSize: rowH < 32 ? 12.5 : 14 }, on && styles.payDark, multiplier === 0 && { opacity: 0.5 }]}>{fmtMult(multiplier)}</Text>
              </View>
            );
          })}
        </LinearGradient>

        {/* Gem stage */}
        <View style={[styles.stage, { padding: stagePad }]} onLayout={(e) => setStageBox({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}>
          <View style={[styles.slotRow, { gap }]}>
            {[0, 1, 2, 3, 4].map((i) => {
              const g = shown[i];
              const hit = matched?.[i] ?? false;
              const dim = !!matched && last?.result !== 'NONE' && !hit;
              return (
                <View key={i} style={{ width: slot, height: slot * 1.15, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <Svg width={slot} height={slot * 0.42} style={{ position: 'absolute', bottom: 0 }}>
                    <Defs>
                      <RadialGradient id={`dmCush${i}`} cx="50%" cy="40%" r="60%">
                        <Stop offset="0" stopColor="#5B21B6" />
                        <Stop offset="1" stopColor="#1E0838" />
                      </RadialGradient>
                    </Defs>
                    <Ellipse cx={slot / 2} cy={slot * 0.21} rx={slot / 2 - 1} ry={slot * 0.19} fill={`url(#dmCush${i})`} stroke={hit ? GOLD : 'rgba(216,180,254,0.35)'} strokeWidth={hit ? 2 : 1} />
                  </Svg>
                  {hit && (
                    <Animated.View style={[styles.halo, { width: slot * 0.86, height: slot * 0.86, borderRadius: slot, bottom: slot * 0.12, backgroundColor: GEM_COLORS[g ?? 0][1], opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.34] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.05] }) }] }]} />
                  )}
                  {g !== null && (
                    <Animated.View
                      style={{
                        marginBottom: slot * 0.14,
                        opacity: drops[i].interpolate({ inputRange: [0, 0.3, 1, 2], outputRange: [0, 1, 1, 0] }),
                        transform: [{ translateY: drops[i].interpolate({ inputRange: [0, 1, 2], outputRange: [-slot * 1.6, 0, slot * 0.25] }) }, { scale: drops[i].interpolate({ inputRange: [0, 1, 2], outputRange: [0.7, 1, 0.6] }) }],
                      }}
                    >
                      <View style={{ opacity: dim ? 0.4 : 1 }}>
                        <Gem color={g} size={gemSize} />
                      </View>
                    </Animated.View>
                  )}
                </View>
              );
            })}
          </View>
          <View style={styles.statusBox}>{status}</View>
        </View>

        {/* Controls */}
        <View>
          <View style={[styles.betRow, busy && styles.dim]}>
            <View style={styles.betBox}>
              <Pressable onPress={() => changeBet(-1)} style={styles.betBtn} hitSlop={6} accessibilityLabel="Lower bet">
                <MaterialCommunityIcons name="minus" size={20} color="#2A1600" />
              </Pressable>
              <View style={styles.betValueBox}>
                <Text style={styles.betLabel}>BET</Text>
                <Text style={styles.betValue}>₹{bet}</Text>
              </View>
              <Pressable onPress={() => changeBet(1)} style={styles.betBtn} hitSlop={6} accessibilityLabel="Raise bet">
                <MaterialCommunityIcons name="plus" size={20} color="#2A1600" />
              </Pressable>
            </View>
            <Pressable onPress={() => scaleBet(0.5)} style={styles.chip} accessibilityLabel="Half bet">
              <Text style={styles.chipText}>½</Text>
            </Pressable>
            <Pressable onPress={() => scaleBet(2)} style={styles.chip} accessibilityLabel="Double bet">
              <Text style={styles.chipText}>2×</Text>
            </Pressable>
          </View>
          <Pressable onPress={doPlay} disabled={busy} style={({ pressed }) => [styles.mainBtn, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Play">
            <LinearGradient colors={['#F0ABFC', '#C026D3', '#7E22CE']} style={styles.mainInner}>
              <MaterialCommunityIcons name="diamond-stone" size={22} color="#FFFFFF" />
              <Text style={styles.mainText}>{busy ? 'DROPPING' : 'PLAY'}</Text>
              <Text style={styles.mainSub}>max {fmtMult(Math.min(paytable[0].multiplier, maxPayout / Math.max(bet, 1)))}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      {banner && (
        <View pointerEvents="none" style={[styles.bannerWrap, { top: bannerTop }]}>
          <Animated.View style={{ opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <LinearGradient colors={['#7E22CE', '#3B0764']} style={styles.bannerCard}>
              <Text style={styles.bannerTitle}>{banner.title}</Text>
              <Text style={styles.bannerSub}>{banner.sub}</Text>
            </LinearGradient>
          </Animated.View>
        </View>
      )}

      {panel && (
        <Pressable style={styles.scrim} onPress={() => setPanel(null)}>
          <Pressable style={[styles.sheet, { maxHeight: H * 0.84, width: Math.min(W - 24, 470) }]} onPress={() => {}}>
            <View style={styles.tabs}>
              {(
                [
                  ['history', 'MY BETS'],
                  ['rules', 'RULES'],
                ] as const
              ).map(([id, label]) => (
                <Pressable key={id} onPress={() => openPanel(id)} style={[styles.tab, panel === id && styles.tabOn]}>
                  <Text style={[styles.tabText, panel === id && styles.tabTextOn]}>{label}</Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setPanel(null)} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={20} color={GOLD} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>{panel === 'history' ? <History bets={history} /> : <Rules config={config} />}</ScrollView>
          </Pressable>
        </Pressable>
      )}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

/** The colours of the matched groups in a row, biggest group first, for the lit paytable pattern. */
function groupColours(gems: number[]): number[] {
  const counts = new Array<number>(7).fill(0);
  gems.forEach((g) => counts[g]++);
  const groups = counts.flatMap((n, c) => (n >= 2 ? [{ n, c }] : [])).sort((a, b) => b.n - a.n);
  return [groups[0]?.c ?? 3, groups[1]?.c ?? 1];
}

function Rules({ config }: { config: DiamondsConfig | null }) {
  const paytable = config?.paytable ?? FALLBACK_PAYTABLE;
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Set your bet and press Play. Five gems drop, each one of seven colours with equal chance. You are paid for how many gems share a colour — like a poker hand, the order doesn't matter.</Text>
      <Text style={styles.ruleHead}>Paytable</Text>
      <View style={styles.ruleBox}>
        <View style={styles.ruleRow}>
          <Text style={[styles.ruleKey, styles.ruleCap]}>RESULT</Text>
          <Text style={[styles.ruleMid, styles.ruleCap]}>CHANCE</Text>
          <Text style={[styles.ruleVal, styles.ruleCap]}>PAYS</Text>
        </View>
        {paytable.map(({ result, multiplier, chancePercent }) => (
          <View key={result} style={styles.ruleRow}>
            <Text style={styles.ruleKey}>{RESULT_NAME[result]}</Text>
            <Text style={styles.ruleMid}>{chancePercent.toFixed(2)}%</Text>
            <Text style={styles.ruleVal}>{fmtMult(multiplier)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Payouts are the total returned for your bet. Return to player {config?.rtpPercent ?? 89.86}%. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}; max win per bet ₹{config?.maxPayout ?? 10000}.
      </Text>
      <Text style={styles.ruleLine}>Every gem comes from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ bets }: { bets: DiamondsBet[] | null }) {
  if (bets === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (bets.length === 0) return <Text style={styles.ruleLine}>No bets yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {bets.map((b) => {
        const payout = Number(b.payout);
        const stake = Number(b.stake);
        const hits = matchedGems(b.gems);
        return (
          <View key={b.id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.histGems}>
                {b.gems.map((g, i) => (
                  <View key={i} style={{ opacity: b.result !== 'NONE' && !hits[i] ? 0.4 : 1 }}>
                    <Gem color={g} size={24} />
                  </View>
                ))}
              </View>
              <Text style={styles.histMain}>
                {RESULT_NAME[b.result]} · {fmtMult(Number(b.multiplier))}
              </Text>
              <Text style={styles.histSub}>
                ₹{stake.toFixed(2)} · {new Date(b.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > stake ? GOLD : 'rgba(245,238,255,0.5)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : `-₹${stake.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07030F' },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 3 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(36,12,66,0.9)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(36,12,66,0.92)', borderWidth: 1.2, borderColor: GOLD },
  headBalanceText: { color: GOLD, fontWeight: '900', fontSize: 14 },
  body: { flex: 1, justifyContent: 'space-between' },
  paytable: { borderRadius: 16, paddingVertical: 6, paddingHorizontal: 6, borderWidth: 1.5, borderColor: 'rgba(216,180,254,0.55)', shadowColor: '#A855F7', shadowOpacity: 0.55, shadowRadius: 16, elevation: 8 },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: 10, gap: 10, overflow: 'hidden' },
  payRowOn: { borderWidth: 1, borderColor: '#FFF3C4' },
  payGlow: { backgroundColor: '#FFFFFF' },
  pattern: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  payName: { flex: 1, color: INK, fontWeight: '900', letterSpacing: 0.4 },
  payMult: { color: GOLD, fontWeight: '900', minWidth: 48, textAlign: 'right' },
  payDark: { color: '#2A1600' },
  stage: { borderRadius: 20, backgroundColor: 'rgba(10,3,22,0.6)', borderWidth: 1, borderColor: 'rgba(216,180,254,0.3)' },
  slotRow: { flexDirection: 'row', justifyContent: 'center' },
  halo: { position: 'absolute', alignSelf: 'center' },
  statusBox: { alignItems: 'center', marginTop: 10, minHeight: 20 },
  statusText: { color: 'rgba(245,238,255,0.85)', fontWeight: '800', fontSize: 13.5, textAlign: 'center' },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  betBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(36,12,66,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.45)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },
  betValueBox: { flex: 1, alignItems: 'center' },
  betLabel: { color: 'rgba(245,238,255,0.55)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.5 },
  betValue: { color: INK, fontSize: 18, fontWeight: '900' },
  chip: { width: 50, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(36,12,66,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.45)' },
  chipText: { color: GOLD, fontWeight: '900', fontSize: 16 },
  mainBtn: { height: 62, borderRadius: 20, overflow: 'hidden', marginTop: 10, shadowColor: '#C026D3', shadowOpacity: 0.6, shadowRadius: 14, elevation: 8 },
  mainInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  mainText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 4, textShadowColor: 'rgba(59,7,100,0.6)', textShadowRadius: 4 },
  mainSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '900' },
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bannerCard: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 18, borderWidth: 2, borderColor: GOLD, alignItems: 'center', minWidth: 230 },
  bannerTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 23, letterSpacing: 3, fontFamily: 'serif' },
  bannerSub: { color: GOLD, fontWeight: '900', fontSize: 17, marginTop: 2 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  sheet: { borderRadius: 18, backgroundColor: '#1A0A30', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,107,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,214,107,0.14)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(245,238,255,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(245,238,255,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  ruleBox: { borderRadius: 12, padding: 10, backgroundColor: 'rgba(255,214,107,0.07)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.25)', gap: 6 },
  ruleRow: { flexDirection: 'row', alignItems: 'center' },
  ruleCap: { fontSize: 10.5, letterSpacing: 1.2, color: LILAC },
  ruleKey: { flex: 1, color: INK, fontWeight: '800', fontSize: 12.5 },
  ruleMid: { width: 70, textAlign: 'right', color: 'rgba(245,238,255,0.7)', fontWeight: '700', fontSize: 12 },
  ruleVal: { width: 60, textAlign: 'right', color: GOLD, fontWeight: '900', fontSize: 12.5 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.15)' },
  histGems: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(245,238,255,0.5)', fontSize: 11, marginTop: 3 },
  histPay: { fontWeight: '900', fontSize: 14, marginLeft: 8 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: GOLD, maxWidth: '86%', zIndex: 6 },
  toastText: { color: INK, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
