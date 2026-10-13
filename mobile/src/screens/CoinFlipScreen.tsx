import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { CoinFlipConfig, CoinFlipRound, CoinSide, cashOutCoinFlip, fetchActiveCoinFlip, fetchCoinFlipConfig, fetchCoinFlipHistory, flipCoin, startCoinFlip } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const SILVER = '#CBD5E1';
const INK = '#FFF4EC';
const WIN = '#34D399';
const LOSE = '#FB7185';
const SIDES: CoinSide[] = ['HEADS', 'TAILS'];
const MAX_FLIPS = 20;
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const SOUND_KEY = 'novaplay:coinflip:sound';
const TOAST_MS = 1900;
/** Half-turns a flip can spin through; the spin value runs from 0 to 10 or 11. */
const MAX_HALF_TURNS = 12;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function fmtMult(m: number): string {
  if (m >= 1000) return `${Math.floor(m).toLocaleString('en-IN')}x`;
  if (m >= 100) return `${(Math.floor(m * 10) / 10).toFixed(1)}x`;
  return `${(Math.floor(m * 100) / 100).toFixed(2)}x`;
}

const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// Spin curves: the coin's height is |cos| of the spin, and each face shows for its half of every turn.
const SPIN_IN: number[] = [];
const SPIN_SCALE: number[] = [];
const FRONT: number[] = [];
for (let k = 0; k <= MAX_HALF_TURNS; k++) {
  SPIN_IN.push(k);
  SPIN_SCALE.push(1);
  FRONT.push(k % 2 === 0 ? 1 : 0);
  if (k < MAX_HALF_TURNS) {
    SPIN_IN.push(k + 0.499, k + 0.501);
    SPIN_SCALE.push(0.04, 0.04);
    FRONT.push(k % 2 === 0 ? 1 : 0, k % 2 === 0 ? 0 : 1);
  }
}
const BACK = FRONT.map((v) => 1 - v);

// ---------- art ----------

/** A minted coin: heads is gold with a crown, tails is silver with a star. */
const Coin = memo(function Coin({ size, side, id }: { size: number; side: CoinSide; id: string }) {
  const heads = side === 'HEADS';
  const [light, main, dark, emblem] = heads ? ['#FFF3B0', '#F5B82E', '#9A5B00', '#7A3E00'] : ['#F8FAFC', '#A5B4C8', '#475569', '#1E293B'];
  const ticks = 48;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`cf${id}${side}`} cx="35%" cy="30%" r="80%">
          <Stop offset="0" stopColor={light} />
          <Stop offset="0.5" stopColor={main} />
          <Stop offset="1" stopColor={dark} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={49} fill={dark} />
      <Circle cx={50} cy={50} r={46} fill={`url(#cf${id}${side})`} />
      {/* Reeded rim */}
      {Array.from({ length: ticks }, (_, i) => {
        const a = (i / ticks) * Math.PI * 2;
        return <Path key={i} d={`M${50 + Math.cos(a) * 42} ${50 + Math.sin(a) * 42} L${50 + Math.cos(a) * 46} ${50 + Math.sin(a) * 46}`} stroke={dark} strokeOpacity={0.45} strokeWidth={1.2} />;
      })}
      <Circle cx={50} cy={50} r={36} fill="none" stroke={dark} strokeOpacity={0.55} strokeWidth={1.5} />
      {heads ? (
        <G>
          <Path d="M30 60 L 27 36 L 39 47 L 50 30 L 61 47 L 73 36 L 70 60 Z" fill={emblem} opacity={0.85} />
          <Rect x={30} y={62} width={40} height={6} rx={2} fill={emblem} opacity={0.85} />
          <Circle cx={27} cy={34} r={3} fill={emblem} opacity={0.85} />
          <Circle cx={50} cy={28} r={3} fill={emblem} opacity={0.85} />
          <Circle cx={73} cy={34} r={3} fill={emblem} opacity={0.85} />
        </G>
      ) : (
        <Path d="M50 24 L 57.6 41.5 L 76.6 43.4 L 62.3 56 L 66.5 74.6 L 50 65 L 33.5 74.6 L 37.7 56 L 23.4 43.4 L 42.4 41.5 Z" fill={emblem} opacity={0.8} />
      )}
      <Ellipse cx={34} cy={26} rx={14} ry={7} fill="#FFFFFF" opacity={0.28} transform="rotate(-30 34 26)" />
    </Svg>
  );
});

function Background({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="cfBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A0A14" />
          <Stop offset="0.55" stopColor="#1A060D" />
          <Stop offset="1" stopColor="#0B0306" />
        </SvgLinearGradient>
        <RadialGradient id="cfSpot" cx="50%" cy="40%" r="55%">
          <Stop offset="0" stopColor={GOLD} stopOpacity={0.2} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#cfBg)" />
      {/* Damask-like diamonds */}
      {Array.from({ length: 7 }, (_, r) =>
        Array.from({ length: 6 }, (_, c) => {
          const x = (c + (r % 2 ? 0.5 : 0)) * (w / 5.5);
          const y = r * (h / 6.5) + 20;
          return <Path key={`${r}-${c}`} d={`M${x} ${y - 14} L${x + 9} ${y} L${x} ${y + 14} L${x - 9} ${y} Z`} fill="none" stroke={GOLD} strokeOpacity={0.05} strokeWidth={1} />;
        })
      )}
      <Rect x={0} y={0} width={w} height={h} fill="url(#cfSpot)" />
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.18} viewBox="0 0 300 54">
      <Defs>
        <SvgLinearGradient id="cfLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF6D2" />
          <Stop offset="0.55" stopColor={GOLD} />
          <Stop offset="1" stopColor="#B7791F" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={150} y={38} fontSize={32} fontWeight="bold" fontFamily="serif" fill="url(#cfLogo)" stroke="#3A1400" strokeWidth={0.8} textAnchor="middle" letterSpacing={5}>
        COIN FLIP
      </SvgText>
      <Circle cx={22} cy={26} r={9} fill={GOLD} stroke="#9A5B00" strokeWidth={1.5} />
      <Circle cx={278} cy={26} r={9} fill={SILVER} stroke="#475569" strokeWidth={1.5} />
    </Svg>
  );
}

/** Home tile art: a gold and a silver coin, one mid-flip. */
export function CoinFlipTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="cftBg" cx="50%" cy="38%" r="70%">
            <Stop offset="0" stopColor="#5A1426" />
            <Stop offset="1" stopColor="#12040A" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#cftBg)" />
        <Ellipse cx={50} cy={64} rx={26} ry={4} fill="#000000" opacity={0.4} />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.14, top: size * 0.14 }}>
        <Coin size={size * 0.42} side="HEADS" id="t" />
      </View>
      <View style={{ position: 'absolute', left: size * 0.48, top: size * 0.2, transform: [{ scaleY: 0.55 }, { rotate: '-18deg' }] }}>
        <Coin size={size * 0.38} side="TAILS" id="t" />
      </View>
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub: string; tone: 'win' | 'lose' };

export default function CoinFlipScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<CoinFlipConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [round, setRound] = useState<CoinFlipRound | null>(null);
  const [face, setFace] = useState<CoinSide>('HEADS');
  const [spinFrom, setSpinFrom] = useState<CoinSide>('HEADS');
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'history' | 'rules' | null>(null);
  const [history, setHistory] = useState<CoinFlipRound[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spin = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const maxFlips = config?.maxFlips ?? MAX_FLIPS;
  const multipliers = config?.multipliers ?? Array.from({ length: MAX_FLIPS }, (_, i) => round2(0.9 * 2 ** (i + 1)));
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const live = round?.status === 'ACTIVE';

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
    fetchCoinFlipConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchActiveCoinFlip()
      .then(({ round: open }) => {
        if (!open || !mountedRef.current) return;
        setRound(open);
        setBet(Number(open.stake));
        setShown(open.results.length);
        const last = open.results[open.results.length - 1];
        if (last !== undefined) {
          setFace(SIDES[last]);
          setSpinFrom(SIDES[last]);
        }
      })
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
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
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
        Animated.delay(1300),
        Animated.timing(bannerAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(() => mountedRef.current && setBanner(null));
    },
    [bannerAnim]
  );

  const doStart = useCallback(async () => {
    if (busyRef.current) return;
    if (bet > balanceRef.current) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setStarting(true);
    setBanner(null);
    try {
      const r = await startCoinFlip(bet);
      if (!mountedRef.current) return;
      setShownBalance((b) => round2(b - bet));
      setRound(r);
      setShown(0);
      play('tick');
    } catch (err) {
      showToast(errorMessage(err));
    }
    busyRef.current = false;
    setBusy(false);
    setStarting(false);
  }, [bet, play, showToast]);

  const doFlip = useCallback(
    async (side: CoinSide) => {
      if (busyRef.current || !round || round.status !== 'ACTIVE') return;
      busyRef.current = true;
      setBusy(true);
      const from = face;
      setSpinFrom(from);
      spin.setValue(0);
      lift.setValue(0);
      // Toss while the server answers; the spin settles on the side it reports.
      const up = run(Animated.timing(lift, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }));
      const spinning = run(Animated.timing(spin, { toValue: 4, duration: 420, easing: Easing.linear, useNativeDriver: true }));
      let r: CoinFlipRound;
      try {
        [r] = await Promise.all([flipCoin(round.id, side), up, spinning]);
      } catch (err) {
        await run(Animated.parallel([Animated.timing(lift, { toValue: 0, duration: 300, useNativeDriver: true }), Animated.timing(spin, { toValue: 6, duration: 300, useNativeDriver: true })]));
        spin.setValue(0);
        showToast(errorMessage(err));
        fetchActiveCoinFlip()
          .then(({ round: open }) => mountedRef.current && setRound(open))
          .catch(() => {});
        busyRef.current = false;
        setBusy(false);
        return;
      }
      if (!mountedRef.current) return;
      const landed = SIDES[r.results[r.results.length - 1]];
      const halfTurns = landed === from ? 10 : 11;
      await run(
        Animated.parallel([
          Animated.timing(spin, { toValue: halfTurns, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(lift, { toValue: 0, duration: 520, easing: Easing.bounce, useNativeDriver: true }),
        ])
      );
      if (!mountedRef.current) return;
      setFace(landed);
      setSpinFrom(landed);
      spin.setValue(0);
      setRound(r);
      setShown(r.results.length);
      if (r.status === 'LOST') {
        play('land');
        shake.setValue(0);
        Animated.timing(shake, { toValue: 1, duration: 420, easing: Easing.linear, useNativeDriver: true }).start();
        showBanner({ title: 'WRONG CALL', sub: `${landed === 'HEADS' ? 'Heads' : 'Tails'} · -₹${Number(r.stake).toFixed(2)}`, tone: 'lose' });
        refreshWallet().catch(() => {});
      } else if (r.status === 'WON') {
        const payout = Number(r.payout);
        setShownBalance((b) => round2(b + payout));
        play('win');
        showBanner({ title: r.wins >= r.maxFlips ? 'ALL FLIPS WON' : 'MAX WIN', sub: `₹${payout.toFixed(2)}  ·  ${fmtMult(Number(r.multiplier))}`, tone: 'win' });
        refreshWallet().catch(() => {});
      } else play('tick');
      busyRef.current = false;
      setBusy(false);
    },
    [face, lift, play, refreshWallet, round, shake, showBanner, showToast, spin]
  );

  const doCashOut = useCallback(async () => {
    if (busyRef.current || !round || round.wins === 0) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await cashOutCoinFlip(round.id);
      if (!mountedRef.current) return;
      setRound(r);
      const payout = Number(r.payout);
      setShownBalance((b) => round2(b + payout));
      play('win');
      showBanner({ title: 'CASHED OUT', sub: `₹${payout.toFixed(2)}  ·  ${fmtMult(Number(r.multiplier))}`, tone: 'win' });
      refreshWallet().catch(() => {});
    } catch (err) {
      showToast(errorMessage(err));
    }
    busyRef.current = false;
    setBusy(false);
  }, [play, refreshWallet, round, showBanner, showToast]);

  const changeBet = (dir: -1 | 1) => {
    if (live || busy) return;
    const i = betLevels.indexOf(bet);
    const next = i < 0 ? betLevels.find((b) => (dir > 0 ? b > bet : b >= bet)) ?? bet : betLevels[Math.min(betLevels.length - 1, Math.max(0, i + dir))];
    setBet(next);
  };

  const scaleBet = (k: 0.5 | 2) => {
    if (live || busy) return;
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
      fetchCoinFlipHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const contentW = Math.min(W - 24, 460);
  const headerH = insets.top + 50;
  const compact = H < 760;
  const logoW = Math.min(contentW * 0.66, 280);
  const sw = stage?.w ?? contentW;
  const sh = stage?.h ?? 260;
  const coinSize = Math.min(sw * 0.54, sh * 0.5, 220);
  const coinTop = sh * 0.56 - coinSize / 2;
  const other: CoinSide = spinFrom === 'HEADS' ? 'TAILS' : 'HEADS';
  const wins = round?.wins ?? 0;
  const shownMult = round && wins > 0 ? (round.status === 'WON' ? Number(round.multiplier) : round.currentMultiplier) : 0;
  const pip = Math.min((contentW - 9 * 4) / 10, 30);

  let headline: React.ReactNode;
  if (!round) headline = <Text style={styles.hint}>Call heads or tails — every right call doubles it</Text>;
  else if (live)
    headline = (
      <>
        <Text style={styles.multBig}>{wins > 0 ? fmtMult(shownMult) : `₹${Number(round.stake).toFixed(2)}`}</Text>
        <Text style={styles.multSub}>{wins > 0 ? `cash out ₹${round.cashOut.toFixed(2)} · next ${fmtMult(round.nextMultiplier)}` : `first right call pays ${fmtMult(round.nextMultiplier)}`}</Text>
      </>
    );
  else if (round.status === 'WON')
    headline = (
      <>
        <Text style={[styles.multBig, { color: GOLD }]}>+₹{Number(round.payout).toFixed(2)}</Text>
        <Text style={styles.multSub}>
          {fmtMult(Number(round.multiplier))} after {round.wins} right call{round.wins > 1 ? 's' : ''}
        </Text>
      </>
    );
  else
    headline = (
      <>
        <Text style={[styles.multBig, { color: LOSE }]}>-₹{Number(round.stake).toFixed(2)}</Text>
        <Text style={styles.multSub}>
          {round.wins > 0 ? `lost ${fmtMult(multipliers[round.wins - 1])} on flip ${round.results.length}` : 'wrong call on the first flip'}
        </Text>
      </>
    );

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
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My rounds">
          <MaterialCommunityIcons name="history" size={20} color={GOLD} />
        </Pressable>
        <Pressable onPress={() => openPanel('rules')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Rules">
          <MaterialCommunityIcons name="information-variant" size={22} color={GOLD} />
        </Pressable>
      </View>

      <View style={[styles.body, { paddingTop: headerH, paddingBottom: insets.bottom + 10, width: contentW, alignSelf: 'center' }]}>
        {!compact && (
          <View style={{ alignItems: 'center' }} pointerEvents="none">
            <Logo width={logoW} />
          </View>
        )}

        <View style={styles.headline}>{headline}</View>

        {/* Stage: the coin tossed above its shadow */}
        <Animated.View
          style={{ flex: 1, transform: [{ translateX: shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -10, 9, -6, 3, 0] }) }] }}
          onLayout={(e) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          {stage && (
            <>
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: sw / 2 - coinSize * 0.45,
                  top: coinTop + coinSize + 8,
                  width: coinSize * 0.9,
                  height: 16,
                  borderRadius: coinSize,
                  backgroundColor: '#000000',
                  opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.15] }),
                  transform: [{ scaleX: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) }],
                }}
              />
              {live && wins > 0 && !busy && (
                <Animated.View
                  pointerEvents="none"
                  style={{ position: 'absolute', left: sw / 2 - coinSize * 0.62, top: coinTop - coinSize * 0.12, width: coinSize * 1.24, height: coinSize * 1.24, borderRadius: coinSize, backgroundColor: GOLD, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.18] }) }}
                />
              )}
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: sw / 2 - coinSize / 2,
                  top: coinTop,
                  width: coinSize,
                  height: coinSize,
                  transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.max(coinTop, 40) * 0.9] }) }, { scaleY: spin.interpolate({ inputRange: SPIN_IN, outputRange: SPIN_SCALE }) }],
                }}
              >
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: spin.interpolate({ inputRange: SPIN_IN, outputRange: FRONT }) }]}>
                  <Coin size={coinSize} side={spinFrom} id="main" />
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: spin.interpolate({ inputRange: SPIN_IN, outputRange: BACK }) }]}>
                  <Coin size={coinSize} side={other} id="main" />
                </Animated.View>
              </Animated.View>
            </>
          )}
        </Animated.View>

        {/* The flips of this round */}
        <View style={[styles.pips, { gap: 4 }]}>
          {Array.from({ length: 10 }, (_, i) => {
            const offset = Math.max(0, Math.floor(((round?.results.length ?? 0) - 1) / 10) * 10);
            const k = offset + i;
            const res = round && k < shown ? round.results[k] : undefined;
            const right = res !== undefined && round ? round.picks[k] === res : false;
            return (
              <View key={i} style={[styles.pip, { width: pip, height: pip, borderRadius: pip / 2 }, res !== undefined && { borderColor: right ? WIN : LOSE, borderWidth: 2 }]}>
                {res !== undefined ? <Coin size={pip - 6} side={SIDES[res]} id="pip" /> : <Text style={styles.pipText}>{k + 1}</Text>}
              </View>
            );
          })}
        </View>

        {/* Controls, the same height live or not */}
        <View style={{ minHeight: 166, justifyContent: 'flex-end' }}>
          {live && round ? (
            <>
              <View style={styles.sideRow}>
                {SIDES.map((s) => (
                  <Pressable key={s} onPress={() => doFlip(s)} disabled={busy} style={({ pressed }) => [styles.sideBtn, busy && styles.dim, pressed && { transform: [{ scale: 0.96 }] }]} accessibilityLabel={s === 'HEADS' ? 'Heads' : 'Tails'}>
                    <LinearGradient colors={s === 'HEADS' ? ['#FFF1B0', '#F5B82E', '#A0620A'] : ['#F8FAFC', '#A5B4C8', '#4B5A70']} style={styles.sideInner}>
                      <Coin size={30} side={s} id={`btn${s}`} />
                      <View>
                        <Text style={[styles.sideText, { color: s === 'HEADS' ? '#3A1F00' : '#0F172A' }]}>{s}</Text>
                        <Text style={[styles.sideSub, { color: s === 'HEADS' ? 'rgba(58,31,0,0.7)' : 'rgba(15,23,42,0.7)' }]}>{`→ ${fmtMult(round.nextMultiplier)}`}</Text>
                      </View>
                    </LinearGradient>
                  </Pressable>
                ))}
              </View>
              <View style={styles.liveRow}>
                <Pressable onPress={() => doFlip(Math.random() < 0.5 ? 'HEADS' : 'TAILS')} disabled={busy} style={[styles.randomBtn, busy && styles.dim]} accessibilityLabel="Random call">
                  <MaterialCommunityIcons name="shuffle-variant" size={18} color={INK} />
                  <Text style={styles.randomText}>RANDOM</Text>
                </Pressable>
                <Pressable onPress={doCashOut} disabled={busy || wins === 0} style={({ pressed }) => [styles.cashBtn, (busy || wins === 0) && styles.dim, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Cash out">
                  <LinearGradient colors={['#6EE7B7', '#10B981', '#047857']} style={styles.cashInner}>
                    <Text style={styles.cashText}>CASH OUT</Text>
                    <Text style={styles.cashSub}>{wins > 0 ? `₹${round.cashOut.toFixed(2)}` : 'after a right call'}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.betRow}>
                <View style={styles.betBox}>
                  <Pressable onPress={() => changeBet(-1)} style={[styles.betBtn, busy && styles.dim]} hitSlop={6} accessibilityLabel="Lower bet">
                    <MaterialCommunityIcons name="minus" size={20} color="#2A1600" />
                  </Pressable>
                  <View style={styles.betValueBox}>
                    <Text style={styles.betLabel}>BET</Text>
                    <Text style={styles.betValue}>₹{bet}</Text>
                  </View>
                  <Pressable onPress={() => changeBet(1)} style={[styles.betBtn, busy && styles.dim]} hitSlop={6} accessibilityLabel="Raise bet">
                    <MaterialCommunityIcons name="plus" size={20} color="#2A1600" />
                  </Pressable>
                </View>
                <Pressable onPress={() => scaleBet(0.5)} style={[styles.chip, busy && styles.dim]} accessibilityLabel="Half bet">
                  <Text style={styles.chipText}>½</Text>
                </Pressable>
                <Pressable onPress={() => scaleBet(2)} style={[styles.chip, busy && styles.dim]} accessibilityLabel="Double bet">
                  <Text style={styles.chipText}>2×</Text>
                </Pressable>
              </View>
              <Pressable onPress={doStart} disabled={busy} style={({ pressed }) => [styles.startBtn, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Bet">
                <LinearGradient colors={['#FFF1B0', GOLD, '#C98A10']} style={styles.startInner}>
                  <MaterialCommunityIcons name="poker-chip" size={22} color="#2A1600" />
                  <Text style={styles.startText}>{starting ? 'STARTING' : round ? 'PLAY AGAIN' : 'BET'}</Text>
                  <Text style={styles.startSub}>up to {fmtMult(Math.min(multipliers[maxFlips - 1], maxPayout / Math.max(bet, 1)))}</Text>
                </LinearGradient>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {banner && (
        <View pointerEvents="none" style={[styles.bannerWrap, { top: H * 0.34 }]}>
          <Animated.View style={{ opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <LinearGradient colors={banner.tone === 'win' ? ['#065F46', '#022C22'] : ['#881337', '#3B0414']} style={[styles.bannerCard, { borderColor: banner.tone === 'win' ? GOLD : '#FDA4AF' }]}>
              <Text style={styles.bannerTitle}>{banner.title}</Text>
              <Text style={[styles.bannerSub, { color: banner.tone === 'win' ? GOLD : '#FECDD3' }]}>{banner.sub}</Text>
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
                  ['history', 'MY ROUNDS'],
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
            <ScrollView contentContainerStyle={{ padding: 14 }}>{panel === 'history' ? <History rounds={history} /> : <Rules config={config} />}</ScrollView>
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

function Rules({ config }: { config: CoinFlipConfig | null }) {
  const mults = config?.multipliers ?? Array.from({ length: MAX_FLIPS }, (_, i) => round2(0.9 * 2 ** (i + 1)));
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Place your bet, then call Heads or Tails — the coin is flipped straight away. A right call doubles your multiplier; a wrong call ends the round and the bet is lost. Each flip is 50 / 50 and you can call a different side every time.</Text>
      <Text style={styles.ruleLine}>Cash out after any right call to take bet × multiplier. Up to {config?.maxFlips ?? MAX_FLIPS} flips a round.</Text>
      <Text style={styles.ruleHead}>Multipliers</Text>
      <View style={styles.ruleGrid}>
        {mults.slice(0, 12).map((m, i) => (
          <View key={i} style={styles.ruleCell}>
            <Text style={styles.ruleCellKey}>{i + 1} right</Text>
            <Text style={styles.ruleCellVal}>{fmtMult(m)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Multiplier after n right calls = {(config?.rtpPercent ?? 90) / 100} × 2ⁿ, so the return is {config?.rtpPercent ?? 90}% whenever you cash out. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}; max win per round ₹{config?.maxPayout ?? 10000} — reaching it cashes out automatically.
      </Text>
      <Text style={styles.ruleLine}>Every flip comes from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ rounds }: { rounds: CoinFlipRound[] | null }) {
  if (rounds === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (rounds.length === 0) return <Text style={styles.ruleLine}>No rounds yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {rounds.map((r) => {
        const payout = Number(r.payout);
        const stake = Number(r.stake);
        return (
          <View key={r.id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.histFlips}>
                {r.results.map((res, k) => (
                  <View key={k} style={[styles.histPip, { borderColor: r.picks[k] === res ? WIN : LOSE }]}>
                    <Coin size={14} side={SIDES[res]} id="hist" />
                  </View>
                ))}
              </View>
              <Text style={styles.histMain}>{r.status === 'WON' ? `Cashed out after ${r.wins} right call${r.wins > 1 ? 's' : ''} (${fmtMult(Number(r.multiplier))})` : `Wrong call on flip ${r.results.length}`}</Text>
              <Text style={styles.histSub}>
                ₹{stake.toFixed(2)} · {new Date(r.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > stake ? GOLD : 'rgba(255,244,236,0.5)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : `-₹${stake.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0306' },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 3 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(60,12,26,0.9)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(60,12,26,0.92)', borderWidth: 1.2, borderColor: GOLD },
  headBalanceText: { color: GOLD, fontWeight: '900', fontSize: 14 },
  body: { flex: 1 },
  headline: { alignItems: 'center', minHeight: 64, justifyContent: 'center', marginTop: 4 },
  hint: { color: 'rgba(255,244,236,0.8)', fontWeight: '800', fontSize: 14, textAlign: 'center' },
  multBig: { color: INK, fontWeight: '900', fontSize: 38, letterSpacing: 1, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
  multSub: { color: 'rgba(255,244,236,0.7)', fontWeight: '800', fontSize: 12.5, marginTop: 2 },
  pips: { flexDirection: 'row', justifyContent: 'center', marginVertical: 10 },
  pip: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(60,12,26,0.7)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.25)' },
  pipText: { color: 'rgba(255,244,236,0.35)', fontWeight: '900', fontSize: 10 },
  sideRow: { flexDirection: 'row', gap: 10 },
  sideBtn: { flex: 1, height: 64, borderRadius: 18, overflow: 'hidden' },
  sideInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  sideText: { fontWeight: '900', fontSize: 19, letterSpacing: 2 },
  sideSub: { fontWeight: '900', fontSize: 11.5 },
  liveRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  randomBtn: { width: 118, height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(60,12,26,0.9)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.45)' },
  randomText: { color: INK, fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  cashBtn: { flex: 1, height: 52, borderRadius: 16, overflow: 'hidden' },
  cashInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  cashText: { color: '#022C22', fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  cashSub: { color: 'rgba(2,44,34,0.75)', fontWeight: '900', fontSize: 11.5 },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  betBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(60,12,26,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.45)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },
  betValueBox: { flex: 1, alignItems: 'center' },
  betLabel: { color: 'rgba(255,244,236,0.55)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.5 },
  betValue: { color: INK, fontSize: 18, fontWeight: '900' },
  chip: { width: 50, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(60,12,26,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.45)' },
  chipText: { color: GOLD, fontWeight: '900', fontSize: 16 },
  startBtn: { height: 62, borderRadius: 20, overflow: 'hidden', marginTop: 10, shadowColor: GOLD, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
  startInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  startText: { color: '#2A1600', fontSize: 21, fontWeight: '900', letterSpacing: 3 },
  startSub: { color: 'rgba(42,22,0,0.7)', fontSize: 11, fontWeight: '900' },
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bannerCard: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 18, borderWidth: 2, alignItems: 'center', minWidth: 220 },
  bannerTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 24, letterSpacing: 3, fontFamily: 'serif' },
  bannerSub: { fontWeight: '900', fontSize: 17, marginTop: 2 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  sheet: { borderRadius: 18, backgroundColor: '#2A0A14', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,107,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,214,107,0.14)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(255,244,236,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(255,244,236,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  ruleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ruleCell: { width: '31.5%', paddingVertical: 6, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,214,107,0.07)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.25)' },
  ruleCellKey: { color: 'rgba(255,244,236,0.6)', fontWeight: '800', fontSize: 11 },
  ruleCellVal: { color: GOLD, fontWeight: '900', fontSize: 13 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.15)' },
  histFlips: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: 6 },
  histPip: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(255,244,236,0.5)', fontSize: 11, marginTop: 3 },
  histPay: { fontWeight: '900', fontSize: 14, marginLeft: 8 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: GOLD, maxWidth: '86%', zIndex: 6 },
  toastText: { color: INK, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
