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
import { TowerConfig, TowerDifficulty, TowerRound, cashOutTower, fetchActiveTower, fetchTowerConfig, fetchTowerHistory, pickTower, startTower } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const JADE = '#2FE0A8';
const GOLD = '#FFD66B';
const EMBER = '#FF5A3C';
const INK = '#EFFCF6';
const ROWS = 9;
const DIFFS: TowerDifficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT', 'MASTER'];
const DIFF_LABEL: Record<TowerDifficulty, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard', EXPERT: 'Expert', MASTER: 'Master' };
const FALLBACK_DIFFS: Record<TowerDifficulty, { tiles: number; eggs: number }> = {
  EASY: { tiles: 4, eggs: 3 },
  MEDIUM: { tiles: 3, eggs: 2 },
  HARD: { tiles: 2, eggs: 1 },
  EXPERT: { tiles: 3, eggs: 1 },
  MASTER: { tiles: 4, eggs: 1 },
};
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const SOUND_KEY = 'novaplay:tower:sound';
const TOAST_MS = 1900;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor4(n: number): number {
  return Math.floor(n * 10000 + 1e-9) / 10000;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function fmtMult(m: number): string {
  return m >= 1000 ? `${Math.floor(m).toLocaleString('en-IN')}x` : m >= 100 ? `${(Math.floor(m * 10) / 10).toFixed(1)}x` : `${(Math.floor(m * 100) / 100).toFixed(2)}x`;
}

// ---------- art ----------

const Egg = memo(function Egg({ size, dim = false }: { size: number; dim?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" opacity={dim ? 0.45 : 1}>
      <Defs>
        <RadialGradient id="dtEgg" cx="38%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#FFF8D6" />
          <Stop offset="0.45" stopColor={GOLD} />
          <Stop offset="1" stopColor="#B7791F" />
        </RadialGradient>
      </Defs>
      <Path d="M20 3 C 30 3 35 18 35 25 C 35 33 28 38 20 38 C 12 38 5 33 5 25 C 5 18 10 3 20 3 Z" fill="url(#dtEgg)" stroke="#7A4A00" strokeWidth={1} />
      {/* dragon scales */}
      <Path d="M11 22 Q 14 19 17 22 Q 20 19 23 22 Q 26 19 29 22" fill="none" stroke="#9A6412" strokeWidth={1.2} strokeOpacity={0.7} />
      <Path d="M9 28 Q 12.5 25 16 28 Q 19.5 25 23 28 Q 26.5 25 30 28" fill="none" stroke="#9A6412" strokeWidth={1.2} strokeOpacity={0.7} />
      <Path d="M14 16 Q 17 13 20 16 Q 23 13 26 16" fill="none" stroke="#9A6412" strokeWidth={1.2} strokeOpacity={0.6} />
      <Ellipse cx={15} cy={11} rx={3} ry={4.5} fill="#FFFFFF" opacity={0.55} />
    </Svg>
  );
});

const Skull = memo(function Skull({ size, dim = false }: { size: number; dim?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" opacity={dim ? 0.4 : 1}>
      <Path d="M20 4 C 30 4 35 11 35 19 C 35 24 32 27 29 28 L 29 33 C 29 35 27 36 25 36 L 15 36 C 13 36 11 35 11 33 L 11 28 C 8 27 5 24 5 19 C 5 11 10 4 20 4 Z" fill="#F3EEE2" stroke="#3A0D06" strokeWidth={1.2} />
      <Ellipse cx={14} cy={19} rx={4.2} ry={4.6} fill="#2A0A05" />
      <Ellipse cx={26} cy={19} rx={4.2} ry={4.6} fill="#2A0A05" />
      <Circle cx={14} cy={19} r={1.4} fill={EMBER} />
      <Circle cx={26} cy={19} r={1.4} fill={EMBER} />
      <Path d="M20 23 L 17.5 27 L 22.5 27 Z" fill="#2A0A05" />
      <Path d="M15 31 L15 35 M18.5 31 L18.5 35 M21.5 31 L21.5 35 M25 31 L25 35" stroke="#3A0D06" strokeWidth={1.1} />
    </Svg>
  );
});

function Background({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="dtSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#061B22" />
          <Stop offset="0.55" stopColor="#07232A" />
          <Stop offset="1" stopColor="#020A0D" />
        </SvgLinearGradient>
        <RadialGradient id="dtMoon" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFF6D8" />
          <Stop offset="0.7" stopColor="#FFE7A3" />
          <Stop offset="1" stopColor="#FFE7A3" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="dtHalo" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={GOLD} stopOpacity={0.22} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#dtSky)" />
      <Circle cx={w * 0.82} cy={h * 0.13} r={w * 0.3} fill="url(#dtHalo)" />
      <Circle cx={w * 0.82} cy={h * 0.13} r={w * 0.075} fill="url(#dtMoon)" />
      {Array.from({ length: 30 }, (_, i) => {
        const a = Math.sin(i * 12.9898) * 43758.5453;
        const b = Math.sin(i * 78.233) * 12543.123;
        return <Circle key={i} cx={(a - Math.floor(a)) * w} cy={(b - Math.floor(b)) * h * 0.5} r={0.6 + (i % 3) * 0.4} fill="#FFFFFF" opacity={0.35} />;
      })}
      {/* Misty mountains */}
      <Path d={`M0 ${h * 0.78} L${w * 0.14} ${h * 0.62} L${w * 0.26} ${h * 0.72} L${w * 0.4} ${h * 0.58} L${w * 0.55} ${h * 0.74} L${w * 0.7} ${h * 0.6} L${w * 0.86} ${h * 0.7} L${w} ${h * 0.6} L${w} ${h} L0 ${h} Z`} fill="#0A3A3A" opacity={0.55} />
      <Path d={`M0 ${h * 0.86} L${w * 0.2} ${h * 0.74} L${w * 0.36} ${h * 0.84} L${w * 0.52} ${h * 0.72} L${w * 0.72} ${h * 0.86} L${w * 0.9} ${h * 0.76} L${w} ${h * 0.82} L${w} ${h} L0 ${h} Z`} fill="#052527" opacity={0.85} />
    </Svg>
  );
}

/** Pagoda roof crowning the tower, with the dragon coiled on top. */
function Roof({ width }: { width: number }) {
  const h = width * 0.3;
  return (
    <Svg width={width} height={h} viewBox="0 0 300 90">
      <Defs>
        <SvgLinearGradient id="dtRoof" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#B91C1C" />
          <Stop offset="1" stopColor="#5B0A0A" />
        </SvgLinearGradient>
        <SvgLinearGradient id="dtDragon" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFE8A3" />
          <Stop offset="1" stopColor="#D69B22" />
        </SvgLinearGradient>
      </Defs>
      <Path d="M8 84 Q 40 70 70 66 L 230 66 Q 260 70 292 84 L 270 88 L 30 88 Z" fill="url(#dtRoof)" stroke={GOLD} strokeWidth={2} />
      <Path d="M60 66 Q 100 48 150 44 Q 200 48 240 66 Z" fill="url(#dtRoof)" stroke={GOLD} strokeWidth={2} />
      {/* coiled dragon */}
      <Path d="M92 50 C 100 20, 130 30, 138 38 C 146 46, 168 46, 172 30 C 176 16, 196 12, 206 24" fill="none" stroke="url(#dtDragon)" strokeWidth={9} strokeLinecap="round" />
      <Path d="M92 50 C 100 20, 130 30, 138 38 C 146 46, 168 46, 172 30 C 176 16, 196 12, 206 24" fill="none" stroke="#8A5A10" strokeWidth={1.2} strokeDasharray="3 5" />
      <G transform="translate(206 24)">
        <Path d="M0 -8 L 18 -4 L 22 2 L 12 6 L 0 6 Z" fill="url(#dtDragon)" stroke="#8A5A10" strokeWidth={1} />
        <Path d="M4 -8 L 8 -18 L 10 -8 Z" fill="#FFE8A3" />
        <Circle cx={12} cy={-1} r={1.8} fill="#B91C1C" />
        <Path d="M22 2 Q 30 0 34 6" fill="none" stroke={EMBER} strokeWidth={2} strokeLinecap="round" />
      </G>
      <Circle cx={150} cy={40} r={6} fill={GOLD} stroke="#8A5A10" strokeWidth={1} />
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.17} viewBox="0 0 300 50">
      <Defs>
        <SvgLinearGradient id="dtLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF4CC" />
          <Stop offset="0.55" stopColor={GOLD} />
          <Stop offset="1" stopColor="#B7791F" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={150} y={36} fontSize={27} fontWeight="bold" fontFamily="serif" fill="url(#dtLogo)" stroke="#3A1F00" strokeWidth={1} textAnchor="middle" letterSpacing={3}>
        DRAGON TOWER
      </SvgText>
    </Svg>
  );
}

/** Home tile art: a small tower of tiles with eggs, a skull and the roof. */
export function DragonTowerTileArt({ size }: { size: number }) {
  const t = size * 0.15;
  const rows = [
    ['egg', 'stone', 'stone'],
    ['stone', 'egg', 'stone'],
    ['skull', 'stone', 'egg'],
  ] as const;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="dttBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0A3A3A" />
            <Stop offset="1" stopColor="#031416" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#dttBg)" />
        <Circle cx={89} cy={11} r={6} fill="#FFF1C2" opacity={0.9} />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.18, top: size * 0.02 }}>
        <Roof width={size * 0.64} />
      </View>
      <View style={{ position: 'absolute', left: (size - 3 * t - 8) / 2, top: size * 0.22, gap: 4 }}>
        {rows.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 4 }}>
            {r.map((kind, j) => (
              <View key={j} style={[styles.tile, { width: t, height: t * 0.8, borderRadius: 5 }, kind !== 'stone' && styles.tileOpen]}>
                {kind === 'egg' ? <Egg size={t * 0.7} /> : kind === 'skull' ? <Skull size={t * 0.7} /> : null}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub: string; tone: 'win' | 'lose' };

export default function DragonTowerScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<TowerConfig | null>(null);
  const [difficulty, setDifficulty] = useState<TowerDifficulty>('MEDIUM');
  const [bet, setBet] = useState(DEFAULT_BET);
  const [round, setRound] = useState<TowerRound | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'history' | 'rules' | null>(null);
  const [history, setHistory] = useState<TowerRound[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flips = useRef(new Map<string, Animated.Value>()).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const flipOf = useCallback(
    (row: number, tile: number) => {
      const k = `${row}:${tile}`;
      let v = flips.get(k);
      if (!v) {
        v = new Animated.Value(1);
        flips.set(k, v);
      }
      return v;
    },
    [flips]
  );

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const live = round?.status === 'ACTIVE';
  const diff = live && round ? round.difficulty : difficulty;
  const shape = (config?.difficulties ?? FALLBACK_DIFFS)[diff];
  const multipliers = config?.multipliers[diff] ?? Array.from({ length: ROWS }, (_, i) => floor4(0.9 * (shape.tiles / shape.eggs) ** (i + 1)));

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
    fetchTowerConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchActiveTower()
      .then(({ round: open }) => {
        if (!open || !mountedRef.current) return;
        setRound(open);
        setBet(Number(open.stake));
        setDifficulty(open.difficulty);
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
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: false }),
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
  }, [pulse]);

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
    let r: TowerRound;
    try {
      r = await startTower(bet, difficulty);
    } catch (err) {
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      setStarting(false);
      return;
    }
    if (!mountedRef.current) return;
    flips.clear();
    setShownBalance((b) => round2(b - bet));
    setRound(r);
    play('tick');
    busyRef.current = false;
    setBusy(false);
    setStarting(false);
  }, [bet, difficulty, flips, play, showToast]);

  const doPick = useCallback(
    async (tile: number) => {
      if (busyRef.current || !round || round.status !== 'ACTIVE') return;
      busyRef.current = true;
      setBusy(true);
      setPending(tile);
      const row = round.level;
      const v = flipOf(row, tile);
      // Turn the tile edge-on while the server answers, then open it.
      const closing = new Promise<void>((resolve) => Animated.timing(v, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => resolve()));
      let r: TowerRound;
      try {
        r = await pickTower(round.id, tile);
      } catch (err) {
        await closing;
        v.setValue(1);
        setPending(null);
        showToast(errorMessage(err));
        fetchActiveTower()
          .then(({ round: open }) => mountedRef.current && setRound(open))
          .catch(() => {});
        busyRef.current = false;
        setBusy(false);
        return;
      }
      await closing;
      if (!mountedRef.current) return;
      setPending(null);
      setRound(r);
      await new Promise<void>((resolve) => Animated.timing(v, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start(() => resolve()));
      if (r.status === 'LOST') {
        play('land');
        shake.setValue(0);
        Animated.timing(shake, { toValue: 1, duration: 450, easing: Easing.linear, useNativeDriver: true }).start();
        showBanner({ title: 'SKULL!', sub: `-₹${Number(r.stake).toFixed(2)}`, tone: 'lose' });
        refreshWallet().catch(() => {});
      } else {
        play(r.status === 'WON' ? 'win' : 'tick');
        if (r.status === 'WON') {
          const payout = Number(r.payout);
          setShownBalance((b) => round2(b + payout));
          showBanner({ title: r.level >= ROWS ? 'TOWER CONQUERED' : 'MAX WIN', sub: `₹${payout.toFixed(2)}  ·  ${fmtMult(Number(r.multiplier))}`, tone: 'win' });
          refreshWallet().catch(() => {});
        }
      }
      busyRef.current = false;
      setBusy(false);
    },
    [flipOf, play, refreshWallet, round, shake, showBanner, showToast]
  );

  const doCashOut = useCallback(async () => {
    if (busyRef.current || !round || round.level === 0) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await cashOutTower(round.id);
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

  const randomPick = () => {
    if (!round || !live || busy) return;
    doPick(Math.floor(Math.random() * round.tiles));
  };

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
      fetchTowerHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  const chooseDifficulty = (d: TowerDifficulty) => {
    if (live || busy) return;
    setDifficulty(d);
    if (round) {
      setRound(null);
      flips.clear();
    }
  };

  // ---------- layout ----------
  const contentW = Math.min(W - 24, 460);
  const headerH = insets.top + 50;
  const compact = H < 760;
  const controlsH = 184;
  const roofW = Math.min(contentW * 0.78, 330);
  const roofH = roofW * 0.3;
  const logoH = compact ? 0 : Math.min(contentW * 0.6, 260) * 0.17 + 4;
  const towerAvail = H - headerH - insets.bottom - 14 - controlsH - roofH - logoH - 18;
  const gap = 5;
  const rowH = Math.max(30, Math.min(56, Math.floor((towerAvail - 16 - gap * (ROWS - 1)) / ROWS)));
  const labelW = 64;
  const towerW = contentW;
  const tileAreaW = towerW - 20 - 12 - labelW - 8;
  const tileW = (tileAreaW - gap * (shape.tiles - 1)) / shape.tiles;
  const iconSize = Math.min(rowH * 0.78, tileW * 0.6);
  const level = round?.level ?? 0;
  const over = !!round && round.status !== 'ACTIVE';

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
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My climbs">
          <MaterialCommunityIcons name="history" size={20} color={GOLD} />
        </Pressable>
        <Pressable onPress={() => openPanel('rules')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Rules">
          <MaterialCommunityIcons name="information-variant" size={22} color={GOLD} />
        </Pressable>
      </View>

      <View style={[styles.body, { paddingTop: headerH, paddingBottom: insets.bottom + 10, width: contentW, alignSelf: 'center' }]}>
        {!compact && (
          <View style={{ alignItems: 'center' }} pointerEvents="none">
            <Logo width={Math.min(contentW * 0.6, 260)} />
          </View>
        )}

        {/* Tower */}
        <Animated.View style={{ alignItems: 'center', transform: [{ translateX: shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -9, 8, -5, 3, 0] }) }] }}>
          <View pointerEvents="none" style={{ marginBottom: -roofH * 0.08, zIndex: 2 }}>
            <Roof width={roofW} />
          </View>
          <LinearGradient colors={['#2B3A3A', '#172424', '#0D1616']} style={[styles.tower, { width: towerW }]}>
            <View style={[styles.pillar, { left: 4 }]} />
            <View style={[styles.pillar, { right: 4 }]} />
            {Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i).map((r) => {
              const cleared = r < level;
              const current = live && r === level;
              const lostRow = round?.status === 'LOST' && r === (round?.picks.length ?? 0) - 1;
              const picked = round?.picks[r];
              const eggs = over ? round?.layout?.[r] ?? null : null;
              return (
                <View key={r} style={[styles.towerRow, { height: rowH, marginTop: r === ROWS - 1 ? 0 : gap }]}>
                  <View style={[styles.multTag, { width: labelW }, cleared && styles.multTagDone, current && styles.multTagNow]}>
                    <Text style={[styles.multTagText, cleared && { color: '#062A1E' }, current && { color: '#2A1600' }]} numberOfLines={1}>
                      {fmtMult(multipliers[r])}
                    </Text>
                  </View>
                  <View style={[styles.tileRow, { gap }]}>
                    {Array.from({ length: shape.tiles }, (_, tIdx) => {
                      const isPick = picked === tIdx;
                      const showEgg = (cleared && isPick) || (eggs?.includes(tIdx) ?? false);
                      const showSkull = (lostRow && isPick) || (over && eggs !== null && !eggs.includes(tIdx) && isPick);
                      const revealedOnly = over && !isPick;
                      const v = flipOf(r, tIdx);
                      return (
                        <Pressable key={tIdx} onPress={() => current && doPick(tIdx)} disabled={!current || busy} accessibilityLabel={current ? `Tile ${tIdx + 1}` : undefined}>
                          <Animated.View
                            style={[
                              styles.tile,
                              { width: tileW, height: rowH, borderRadius: 9, transform: [{ scaleX: v }] },
                              current && { borderColor: pulse.interpolate({ inputRange: [0, 1], outputRange: ['rgba(47,224,168,0.55)', '#B6FFE6'] }), backgroundColor: 'rgba(20,90,70,0.85)' },
                              (showEgg || showSkull) && !revealedOnly && styles.tileOpen,
                              isPick && showSkull && styles.tileSkull,
                              isPick && cleared && styles.tileEgg,
                              pending === tIdx && current && { backgroundColor: 'rgba(47,224,168,0.35)' },
                            ]}
                          >
                            {showSkull ? <Skull size={iconSize} /> : showEgg ? <Egg size={iconSize} dim={revealedOnly} /> : over && eggs !== null ? <Skull size={iconSize * 0.8} dim /> : current ? <MaterialCommunityIcons name="help" size={iconSize * 0.55} color="rgba(182,255,230,0.55)" /> : null}
                          </Animated.View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </LinearGradient>
        </Animated.View>

        {/* Controls; the same height live or not, so the tower never moves */}
        <View style={{ minHeight: 166, justifyContent: 'flex-end' }}>
          {live ? (
            <>
              <View style={styles.statusRow}>
                <Text style={styles.statusText}>
                  Level {level}/{ROWS} · {DIFF_LABEL[diff]}
                </Text>
                <Text style={styles.statusNext}>next {round?.nextMultiplier ? fmtMult(round.nextMultiplier) : '—'}</Text>
              </View>
              <View style={styles.liveRow}>
                <Pressable onPress={randomPick} disabled={busy} style={[styles.randomBtn, busy && styles.dim]} accessibilityLabel="Random pick">
                  <MaterialCommunityIcons name="dice-5" size={20} color={INK} />
                  <Text style={styles.randomText}>RANDOM</Text>
                </Pressable>
                <Pressable onPress={doCashOut} disabled={busy || level === 0} style={({ pressed }) => [styles.cashBtn, (busy || level === 0) && styles.dim, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Cash out">
                  <LinearGradient colors={['#FFF1B0', GOLD, '#C98A10']} style={styles.cashInner}>
                    <Text style={styles.cashText}>CASH OUT</Text>
                    <Text style={styles.cashSub}>{level > 0 && round ? `₹${round.cashOut.toFixed(2)} · ${fmtMult(round.currentMultiplier)}` : 'after the first level'}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.diffRow}>
                {DIFFS.map((d) => (
                  <Pressable key={d} onPress={() => chooseDifficulty(d)} style={[styles.diffBtn, difficulty === d && styles.diffOn, busy && styles.dim]} accessibilityLabel={`Difficulty ${DIFF_LABEL[d]}`}>
                    <Text style={[styles.diffText, difficulty === d && styles.diffTextOn]}>{DIFF_LABEL[d]}</Text>
                  </Pressable>
                ))}
              </View>
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
                <LinearGradient colors={['#7CF5CF', JADE, '#0E8A63']} style={styles.startInner}>
                  <MaterialCommunityIcons name="stairs-up" size={22} color="#03261B" />
                  <Text style={styles.startText}>{starting ? 'OPENING' : round ? 'CLIMB AGAIN' : 'BET'}</Text>
                  <Text style={styles.startSub}>top {fmtMult(Math.min(multipliers[ROWS - 1], maxPayout / Math.max(bet, 1)))}</Text>
                </LinearGradient>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {banner && (
        <View pointerEvents="none" style={[styles.bannerWrap, { top: H * 0.38 }]}>
          <Animated.View style={{ opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <LinearGradient colors={banner.tone === 'win' ? ['#0E4E3A', '#052A1F'] : ['#5B130B', '#2E0804']} style={[styles.bannerCard, { borderColor: banner.tone === 'win' ? GOLD : EMBER }]}>
              <Text style={styles.bannerTitle}>{banner.title}</Text>
              <Text style={[styles.bannerSub, { color: banner.tone === 'win' ? GOLD : '#FFB3A3' }]}>{banner.sub}</Text>
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
                  ['history', 'MY CLIMBS'],
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

function Rules({ config }: { config: TowerConfig | null }) {
  const diffs = config?.difficulties ?? FALLBACK_DIFFS;
  const rtp = config?.rtpPercent ?? 90;
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Choose a difficulty and place your bet. Starting at the bottom, pick one tile on each level. A dragon egg lets you climb to the next level and raises your multiplier; a skull ends the climb and the bet is lost.</Text>
      <Text style={styles.ruleLine}>Cash out after any cleared level to take bet × multiplier. Reaching the top of the tower ({config?.rows ?? ROWS} levels) cashes out automatically.</Text>
      <Text style={styles.ruleHead}>Difficulty</Text>
      <View style={styles.payBox}>
        {DIFFS.map((d) => (
          <View key={d} style={styles.payRow}>
            <Text style={styles.payKey}>{DIFF_LABEL[d]}</Text>
            <Text style={styles.payMid}>
              {diffs[d].eggs} egg{diffs[d].eggs > 1 ? 's' : ''} in {diffs[d].tiles} tiles
            </Text>
            <Text style={styles.payVal}>{fmtMult(config?.multipliers[d][0] ?? floor4(0.9 * (diffs[d].tiles / diffs[d].eggs)))} → {fmtMult(config?.multipliers[d][ROWS - 1] ?? floor4(0.9 * (diffs[d].tiles / diffs[d].eggs) ** ROWS))}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Multiplier after each level = {rtp / 100} × (tiles ÷ eggs) for every level cleared, so the return is {rtp}% whenever you cash out. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}. Max win per climb ₹{config?.maxPayout ?? 10000} — reaching it cashes out automatically.
      </Text>
      <Text style={styles.ruleLine}>The whole tower is fixed from your provably-fair seeds when the climb starts and shown when it ends (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ rounds }: { rounds: TowerRound[] | null }) {
  if (rounds === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (rounds.length === 0) return <Text style={styles.ruleLine}>No climbs yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {rounds.map((r) => {
        const payout = Number(r.payout);
        const stake = Number(r.stake);
        return (
          <View key={r.id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.histMain}>
                {DIFF_LABEL[r.difficulty]} · {r.status === 'WON' ? `cashed out at level ${r.level} (${fmtMult(Number(r.multiplier))})` : `skull on level ${r.picks.length}`}
              </Text>
              <View style={styles.histLevels}>
                {Array.from({ length: ROWS }, (_, i) => (
                  <View key={i} style={[styles.histLevel, i < r.level && { backgroundColor: GOLD }, r.status === 'LOST' && i === r.picks.length - 1 && { backgroundColor: EMBER }]} />
                ))}
              </View>
              <Text style={styles.histSub}>
                ₹{stake.toFixed(2)} · {new Date(r.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > stake ? GOLD : 'rgba(239,252,246,0.5)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : `-₹${stake.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020A0D' },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 3 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6,30,30,0.9)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(6,30,30,0.92)', borderWidth: 1.2, borderColor: GOLD },
  headBalanceText: { color: GOLD, fontWeight: '900', fontSize: 14 },
  body: { flex: 1, justifyContent: 'space-between' },
  tower: { borderRadius: 16, padding: 8, borderWidth: 2, borderColor: 'rgba(255,214,107,0.55)', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 14, elevation: 8 },
  pillar: { position: 'absolute', top: 6, bottom: 6, width: 4, borderRadius: 2, backgroundColor: 'rgba(255,214,107,0.35)' },
  towerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
  multTag: { height: '78%', borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.25)' },
  multTagDone: { backgroundColor: JADE, borderColor: '#B6FFE6' },
  multTagNow: { backgroundColor: GOLD, borderColor: '#FFF3C4' },
  multTagText: { color: 'rgba(239,252,246,0.8)', fontWeight: '900', fontSize: 11.5 },
  tileRow: { flex: 1, flexDirection: 'row' },
  tile: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(40,58,58,0.95)', borderWidth: 1.5, borderColor: 'rgba(150,190,180,0.22)' },
  tileOpen: { backgroundColor: 'rgba(10,40,34,0.95)', borderColor: 'rgba(255,214,107,0.4)' },
  tileEgg: { borderColor: GOLD, backgroundColor: 'rgba(70,52,10,0.9)', shadowColor: GOLD, shadowOpacity: 0.7, shadowRadius: 8, elevation: 5 },
  tileSkull: { borderColor: EMBER, backgroundColor: 'rgba(90,18,8,0.92)', shadowColor: EMBER, shadowOpacity: 0.8, shadowRadius: 10, elevation: 6 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 },
  statusText: { color: INK, fontWeight: '900', fontSize: 13 },
  statusNext: { color: JADE, fontWeight: '900', fontSize: 13 },
  liveRow: { flexDirection: 'row', gap: 10 },
  randomBtn: { width: 104, height: 62, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(20,70,60,0.9)', borderWidth: 1.2, borderColor: 'rgba(47,224,168,0.5)' },
  randomText: { color: INK, fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  cashBtn: { flex: 1, height: 62, borderRadius: 16, overflow: 'hidden' },
  cashInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 2, borderColor: '#FFF3C4' },
  cashText: { color: '#2A1600', fontWeight: '900', fontSize: 19, letterSpacing: 2 },
  cashSub: { color: 'rgba(42,22,0,0.75)', fontWeight: '900', fontSize: 11.5 },
  diffRow: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: 'rgba(6,30,30,0.9)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.3)' },
  diffBtn: { flex: 1, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  diffOn: { backgroundColor: GOLD },
  diffText: { color: 'rgba(239,252,246,0.75)', fontWeight: '900', fontSize: 11.5 },
  diffTextOn: { color: '#2A1600' },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  betBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(6,30,30,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.45)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },
  betValueBox: { flex: 1, alignItems: 'center' },
  betLabel: { color: 'rgba(239,252,246,0.55)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.5 },
  betValue: { color: INK, fontSize: 18, fontWeight: '900' },
  chip: { width: 50, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6,30,30,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.45)' },
  chipText: { color: GOLD, fontWeight: '900', fontSize: 16 },
  startBtn: { height: 62, borderRadius: 20, overflow: 'hidden', marginTop: 10, shadowColor: JADE, shadowOpacity: 0.5, shadowRadius: 14, elevation: 8 },
  startInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  startText: { color: '#03261B', fontSize: 21, fontWeight: '900', letterSpacing: 3 },
  startSub: { color: 'rgba(3,38,27,0.7)', fontSize: 11, fontWeight: '900' },
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bannerCard: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 18, borderWidth: 2, alignItems: 'center', minWidth: 220 },
  bannerTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 24, letterSpacing: 3, fontFamily: 'serif' },
  bannerSub: { fontWeight: '900', fontSize: 17, marginTop: 2 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  sheet: { borderRadius: 18, backgroundColor: '#0A2424', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,107,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,214,107,0.14)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(239,252,246,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(239,252,246,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  payBox: { borderRadius: 12, padding: 10, backgroundColor: 'rgba(255,214,107,0.07)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.25)', gap: 7 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payKey: { color: INK, fontWeight: '900', fontSize: 12.5, width: 58 },
  payMid: { color: 'rgba(239,252,246,0.7)', fontWeight: '700', fontSize: 12, flex: 1 },
  payVal: { color: GOLD, fontWeight: '900', fontSize: 12 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.15)' },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histLevels: { flexDirection: 'row', gap: 3, marginTop: 6 },
  histLevel: { width: 16, height: 8, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  histSub: { color: 'rgba(239,252,246,0.5)', fontSize: 11, marginTop: 5 },
  histPay: { fontWeight: '900', fontSize: 14, marginLeft: 8 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: GOLD, maxWidth: '86%', zIndex: 6 },
  toastText: { color: INK, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
