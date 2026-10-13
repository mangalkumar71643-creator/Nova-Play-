import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { AcesCard, AcesCell, AcesConfig, AcesOutcome, AcesRound, AcesSpinRow, AcesStep, AcesSym, fetchAcesConfig, fetchAcesHistory, spinAces } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const GOLD_DEEP = '#B8862B';
const REELS = 5;
const ROWS = 4;
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const AUTO_OPTIONS = [10, 25, 50, 100];
const SOUND_KEY = 'novaplay:aces:sound';
const TOAST_MS = 1800;
const FALLBACK_PAYTABLE: Record<AcesCard, [number, number, number]> = {
  CLUB: [0.01, 0.03, 0.05],
  DIAMOND: [0.01, 0.03, 0.05],
  HEART: [0.02, 0.06, 0.1],
  SPADE: [0.02, 0.06, 0.1],
  J: [0.04, 0.12, 0.2],
  Q: [0.06, 0.18, 0.3],
  K: [0.08, 0.24, 0.4],
  A: [0.1, 0.3, 0.5],
};
const FALLBACK_BASE = [1, 2, 3, 5];
const FALLBACK_FREE = [2, 4, 6, 10];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- card art ----------

const HEART = 'M50 88 C 20 65 6 48 6 32 C 6 18 17 8 30 8 C 40 8 47 14 50 22 C 53 14 60 8 70 8 C 83 8 94 18 94 32 C 94 48 80 65 50 88 Z';
const DIAMOND = 'M50 6 L 86 50 L 50 94 L 14 50 Z';
const SPADE = 'M50 6 C 80 30 94 44 94 58 C 94 72 83 80 71 80 C 62 80 55 75 52 68 C 53 79 57 87 64 94 L 36 94 C 43 87 47 79 48 68 C 45 75 38 80 29 80 C 17 80 6 72 6 58 C 6 44 20 30 50 6 Z';

function Suit({ s, x, y, size, color }: { s: string; x: number; y: number; size: number; color: string }) {
  const k = size / 100;
  const t = `translate(${x - size / 2} ${y - size / 2}) scale(${k})`;
  if (s === 'HEART') return <Path d={HEART} fill={color} transform={t} />;
  if (s === 'DIAMOND') return <Path d={DIAMOND} fill={color} transform={t} />;
  if (s === 'SPADE') return <Path d={SPADE} fill={color} transform={t} />;
  return (
    <G transform={t} fill={color}>
      <Circle cx={50} cy={27} r={18} />
      <Circle cx={28} cy={56} r={18} />
      <Circle cx={72} cy={56} r={18} />
      <Circle cx={50} cy={50} r={12} />
      <Path d="M 45 56 C 45 76 39 86 32 94 L 68 94 C 61 86 55 76 55 56 Z" />
    </G>
  );
}

const SUIT_COLOR: Record<string, string> = { SPADE: '#17171F', CLUB: '#15603A', HEART: '#C8102E', DIAMOND: '#E8590C' };
const LETTER: Record<string, { color: string; suit: string }> = {
  A: { color: '#C8102E', suit: 'SPADE' },
  K: { color: '#1E3A8A', suit: 'HEART' },
  Q: { color: '#6B21A8', suit: 'DIAMOND' },
  J: { color: '#0F766E', suit: 'CLUB' },
};

function CardDefs() {
  return (
    <Defs>
      <SvgLinearGradient id="acIvory" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FFFDF6" />
        <Stop offset="1" stopColor="#EDE3CB" />
      </SvgLinearGradient>
      <SvgLinearGradient id="acGold" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#FFF4B8" />
        <Stop offset="0.45" stopColor="#F2C14E" />
        <Stop offset="1" stopColor="#B7791F" />
      </SvgLinearGradient>
      <SvgLinearGradient id="acJoker" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#7C3AED" />
        <Stop offset="1" stopColor="#2E1065" />
      </SvgLinearGradient>
      <RadialGradient id="acCoin" cx="40%" cy="35%" r="70%">
        <Stop offset="0" stopColor="#FFF6C8" />
        <Stop offset="0.6" stopColor="#F2C14E" />
        <Stop offset="1" stopColor="#9A6412" />
      </RadialGradient>
    </Defs>
  );
}

export const CardArt = memo(function CardArt({ s, g, w }: { s: AcesSym; g: boolean; w: number }) {
  const h = w * 1.25;
  let body: React.ReactNode;
  if (s === 'WILD') {
    body = (
      <G>
        <Rect x={2} y={2} width={96} height={121} rx={10} fill="url(#acJoker)" stroke={GOLD} strokeWidth={3} />
        <Rect x={8} y={8} width={84} height={109} rx={7} fill="none" stroke={GOLD} strokeOpacity={0.45} strokeWidth={1} />
        {/* jester hat */}
        <Path d="M 22 74 C 22 48 30 34 16 22 C 34 26 42 36 50 52 C 58 36 66 26 84 22 C 70 34 78 48 78 74 Z" fill="#DC2626" stroke={GOLD} strokeWidth={2} />
        <Path d="M 50 52 C 46 38 48 24 50 14 C 52 24 54 38 50 52 Z" fill="#16A34A" stroke={GOLD} strokeWidth={1.5} />
        <Circle cx={16} cy={21} r={5} fill={GOLD} />
        <Circle cx={84} cy={21} r={5} fill={GOLD} />
        <Circle cx={50} cy={13} r={5} fill={GOLD} />
        <Rect x={20} y={72} width={60} height={9} rx={3} fill={GOLD} />
        <SvgText x={50} y={106} fontSize={19} fontWeight="bold" fontFamily="serif" fill={GOLD} textAnchor="middle" letterSpacing={2}>
          JOKER
        </SvgText>
      </G>
    );
  } else if (s === 'SCATTER') {
    const star = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 11 : 24;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      return `${50 + r * Math.cos(a)},${54 + r * Math.sin(a)}`;
    }).join(' ');
    body = (
      <G>
        <Rect x={2} y={2} width={96} height={121} rx={10} fill="#140608" stroke={GOLD} strokeWidth={3} />
        <Circle cx={50} cy={54} r={36} fill="url(#acCoin)" stroke="#7A4A00" strokeWidth={2} />
        <Circle cx={50} cy={54} r={29} fill="none" stroke="#7A4A00" strokeWidth={1.2} strokeDasharray="3 3" />
        <Polygon points={star} fill="#C8102E" stroke="#7A0A18" strokeWidth={1.5} />
        <SvgText x={50} y={112} fontSize={15} fontWeight="bold" fill={GOLD} textAnchor="middle" letterSpacing={1.5}>
          SCATTER
        </SvgText>
      </G>
    );
  } else {
    const face = g ? 'url(#acGold)' : 'url(#acIvory)';
    const border = g ? '#7A4A00' : '#C9B98F';
    const isLetter = s in LETTER;
    body = (
      <G>
        <Rect x={2} y={2} width={96} height={121} rx={10} fill={face} stroke={border} strokeWidth={g ? 3 : 2} />
        {g && <Path d="M 10 110 L 70 4 L 86 4 L 26 110 Z" fill="#FFFFFF" opacity={0.28} />}
        {isLetter ? (
          <G>
            <Suit s={LETTER[s].suit} x={17} y={18} size={16} color={SUIT_COLOR[LETTER[s].suit]} />
            <Suit s={LETTER[s].suit} x={83} y={107} size={16} color={SUIT_COLOR[LETTER[s].suit]} />
            {s === 'K' && <Path d="M 36 34 L 34 22 L 43 29 L 50 18 L 57 29 L 66 22 L 64 34 Z" fill={GOLD_DEEP} />}
            <SvgText x={51.5} y={90} fontSize={64} fontWeight="bold" fontFamily="serif" fill="#000" opacity={0.18} textAnchor="middle">
              {s}
            </SvgText>
            <SvgText x={50} y={88} fontSize={64} fontWeight="bold" fontFamily="serif" fill={LETTER[s].color} stroke={g ? '#5A2E00' : 'none'} strokeWidth={1} textAnchor="middle">
              {s}
            </SvgText>
          </G>
        ) : (
          <Suit s={s} x={50} y={62} size={66} color={SUIT_COLOR[s]} />
        )}
      </G>
    );
  }
  return (
    <Svg width={w} height={h} viewBox="0 0 100 125">
      <CardDefs />
      {body}
    </Svg>
  );
});

// ---------- decoration ----------

function Background({ w, h, free }: { w: number; h: number; free: boolean }) {
  const tiles: React.ReactNode[] = [];
  const step = 46;
  const suits = ['SPADE', 'HEART', 'CLUB', 'DIAMOND'];
  let n = 0;
  for (let y = 20; y < h; y += step) {
    for (let x = ((y / step) % 2) * (step / 2) + 10; x < w; x += step) {
      tiles.push(<Suit key={n} s={suits[n % 4]} x={x} y={y} size={12} color={GOLD} />);
      n++;
    }
  }
  const cx = w / 2;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="acBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={free ? '#2B0B4A' : '#2A0508'} />
          <Stop offset="0.5" stopColor={free ? '#14052A' : '#120204'} />
          <Stop offset="1" stopColor="#050102" />
        </SvgLinearGradient>
        <RadialGradient id="acGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={free ? '#A855F7' : '#E11D48'} stopOpacity={0.35} />
          <Stop offset="1" stopColor={free ? '#A855F7' : '#E11D48'} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#acBg)" />
      <G opacity={0.05}>{tiles}</G>
      <Circle cx={cx} cy={h * 0.5} r={Math.max(w, h) * 0.5} fill="url(#acGlow)" />
      {/* art-deco sunburst at the top */}
      <G opacity={0.2}>
        {Array.from({ length: 17 }, (_, i) => {
          const a = Math.PI + (i / 16) * Math.PI;
          return <Line key={i} x1={cx} y1={0} x2={cx + Math.cos(a) * w} y2={-Math.sin(a) * w * 0.55} stroke={GOLD} strokeWidth={1} />;
        })}
      </G>
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.24} viewBox="0 0 360 86">
      <Defs>
        <SvgLinearGradient id="acLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF6C8" />
          <Stop offset="0.5" stopColor="#FFCB45" />
          <Stop offset="1" stopColor="#B7791F" />
        </SvgLinearGradient>
      </Defs>
      <Path d="M 180 4 L 196 20 L 180 36 L 164 20 Z" fill="#C8102E" stroke="url(#acLogo)" strokeWidth={2} />
      <SvgText x={182} y={72} fontSize={40} fontWeight="bold" fontFamily="serif" fill="#000" opacity={0.45} textAnchor="middle" letterSpacing={4}>
        GOLDEN ACES
      </SvgText>
      <SvgText x={180} y={70} fontSize={40} fontWeight="bold" fontFamily="serif" fill="url(#acLogo)" stroke="#5A2E00" strokeWidth={1.2} textAnchor="middle" letterSpacing={4}>
        GOLDEN ACES
      </SvgText>
      <Line x1={40} y1={20} x2={150} y2={20} stroke={GOLD} strokeOpacity={0.6} strokeWidth={1.2} />
      <Line x1={210} y1={20} x2={320} y2={20} stroke={GOLD} strokeOpacity={0.6} strokeWidth={1.2} />
    </Svg>
  );
}

function Rays({ size }: { size: number }) {
  const c = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="acRay" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFE9A0" stopOpacity={0.6} />
          <Stop offset="1" stopColor="#FFB020" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c * 0.45} fill="url(#acRay)" />
      {Array.from({ length: 16 }, (_, i) => {
        const a0 = ((i * 22.5 - 5) * Math.PI) / 180;
        const a1 = ((i * 22.5 + 5) * Math.PI) / 180;
        return <Path key={i} d={`M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`} fill="url(#acRay)" />;
      })}
    </Svg>
  );
}

// ---------- board cards ----------

type BoardCard = {
  id: number;
  s: AcesSym;
  g: boolean;
  col: number;
  row: number;
  y: Animated.Value;
  scale: Animated.Value;
  flip: Animated.Value;
  opacity: Animated.Value;
  lit: boolean;
  pop: boolean;
};

const DEMO_GRID: AcesCell[][] = [
  [{ s: 'A', g: false }, { s: 'HEART', g: false }, { s: 'K', g: false }, { s: 'SPADE', g: false }],
  [{ s: 'Q', g: false }, { s: 'A', g: true }, { s: 'CLUB', g: false }, { s: 'J', g: false }],
  [{ s: 'DIAMOND', g: false }, { s: 'WILD', g: false }, { s: 'K', g: true }, { s: 'HEART', g: false }],
  [{ s: 'SCATTER', g: false }, { s: 'J', g: false }, { s: 'Q', g: true }, { s: 'A', g: false }],
  [{ s: 'K', g: false }, { s: 'CLUB', g: false }, { s: 'SPADE', g: false }, { s: 'Q', g: false }],
];

type Banner = { title: string; sub: string };
type BigWin = { label: string; amount: number };

export default function AcesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<AcesConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOpen, setAutoOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [combo, setCombo] = useState<number | null>(null);
  const [free, setFree] = useState<{ index: number; total: number; base: number } | null>(null);
  const [winTotal, setWinTotal] = useState(0);
  const [stepWin, setStepWin] = useState<{ amount: number; mult: number; key: number } | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [bigWin, setBigWin] = useState<BigWin | null>(null);
  const [bigCount, setBigCount] = useState(0);
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [history, setHistory] = useState<AcesSpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const cardsRef = useRef<BoardCard[]>([]);
  const idRef = useRef(1);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const hurryRef = useRef(false);
  const autoRef = useRef(0);
  autoRef.current = autoLeft;
  const turboRef = useRef(turbo);
  turboRef.current = turbo;
  const betRef = useRef(bet);
  betRef.current = bet;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const stepAnim = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const bigAnim = useRef(new Animated.Value(0)).current;
  const raysSpin = useRef(new Animated.Value(0)).current;

  const paytable = config?.paytable ?? FALLBACK_PAYTABLE;
  const baseLadder = config?.baseMultipliers ?? FALLBACK_BASE;
  const freeLadder = config?.freeMultipliers ?? FALLBACK_FREE;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  // ---------- layout ----------
  const pad = 8;
  const gap = 5;
  const headerH = insets.top + 50;
  const logoW = Math.min(W * 0.84, 340);
  const logoH = logoW * 0.24;
  const comboH = 34;
  const controlsH = 92;
  const stripH = 54;
  const availH = H - headerH - insets.bottom - 18 - controlsH - stripH - logoH - comboH - 60;
  const cellW = Math.floor(Math.min((Math.min(W - 24, 460) - pad * 2 - gap * (REELS - 1)) / REELS, (availH - pad * 2 - gap * (ROWS - 1)) / (ROWS * 1.25)));
  const cellH = Math.round(cellW * 1.25);
  const boardW = cellW * REELS + gap * (REELS - 1);
  const boardH = cellH * ROWS + gap * (ROWS - 1);
  const frameW = boardW + pad * 2;
  const frameH = boardH + pad * 2;
  const frameLeft = (W - frameW) / 2;
  const spare = Math.max(0, H - insets.bottom - 18 - controlsH - headerH - (logoH + 8 + comboH + 8 + frameH + 12 + stripH));
  const logoTop = headerH + spare * 0.3;
  const comboTop = logoTop + logoH + 8;
  const frameTop = comboTop + comboH + 8;
  const stripTop = frameTop + frameH + 12 + spare * 0.2;
  const colX = (c: number) => c * (cellW + gap);
  const rowY = (r: number) => r * (cellH + gap);

  const timing = useCallback((ms: number) => (hurryRef.current || turboRef.current ? Math.round(ms * 0.45) : ms), []);
  const wait = useCallback((ms: number) => new Promise<void>((r) => setTimeout(r, hurryRef.current ? Math.min(ms, 60) : turboRef.current ? ms * 0.45 : ms)), []);

  const setBoard = useCallback((next: BoardCard[]) => {
    cardsRef.current = next;
    if (mountedRef.current) setCards(next);
  }, []);

  const makeCard = useCallback(
    (cell: AcesCell, col: number, row: number, startY: number): BoardCard => ({
      id: idRef.current++,
      s: cell.s,
      g: cell.g,
      col,
      row,
      y: new Animated.Value(startY),
      scale: new Animated.Value(1),
      flip: new Animated.Value(1),
      opacity: new Animated.Value(1),
      lit: false,
      pop: false,
    }),
    []
  );

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
    fetchAcesConfig()
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
        Animated.timing(pulse, { toValue: 1, duration: 380, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 380, useNativeDriver: false }),
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

  // First board: laid out once the cell size is known.
  const laidOut = useRef(false);
  useEffect(() => {
    if (laidOut.current || cellW <= 0) return;
    laidOut.current = true;
    setBoard(DEMO_GRID.flatMap((col, c) => col.map((cell, r) => makeCard(cell, c, r, rowY(r)))));
    // rowY depends only on the cell size, fixed for the first layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellW, makeCard, setBoard]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    if (!bigWin) return;
    raysSpin.setValue(0);
    const loop = Animated.loop(Animated.timing(raysSpin, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    setBigCount(0);
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / 1800);
      setBigCount(round2(bigWin.amount * (1 - (1 - t) * (1 - t))));
      if (t >= 1) clearInterval(id);
    }, 40);
    return () => {
      loop.stop();
      clearInterval(id);
    };
  }, [bigWin, raysSpin]);

  // ---------- board animations ----------

  const dropOut = useCallback(async () => {
    const current = cardsRef.current;
    if (current.length === 0) return;
    await run(
      Animated.parallel(
        current.map((c) =>
          Animated.timing(c.y, { toValue: rowY(c.row) + boardH + cellH, duration: timing(260), delay: timing(c.col * 45), easing: Easing.in(Easing.quad), useNativeDriver: true })
        )
      )
    );
    setBoard([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardH, cellH, setBoard, timing]);

  const dropIn = useCallback(
    async (grid: AcesCell[][]) => {
      const fresh = grid.flatMap((col, c) => col.map((cell, r) => makeCard(cell, c, r, rowY(r) - boardH - gap * 2)));
      setBoard(fresh);
      await frame();
      await frame();
      await run(
        Animated.parallel(
          fresh.map((c) =>
            Animated.timing(c.y, {
              toValue: rowY(c.row),
              duration: timing(380),
              delay: timing(c.col * 70 + (ROWS - 1 - c.row) * 22),
              easing: Easing.out(Easing.back(1.15)),
              useNativeDriver: true,
            })
          )
        )
      );
      play('land');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardH, makeCard, play, setBoard, timing]
  );

  const resolveStep = useCallback(
    async (step: AcesStep, next: AcesCell[][]) => {
      const key = (c: number, r: number) => `${c},${r}`;
      const winning = new Set(step.winning.map(([c, r]) => key(c, r)));
      const flipped = new Set(step.flipped.map(([c, r]) => key(c, r)));
      const current = cardsRef.current;

      // 1. Golden winners turn over into Jokers; the other winners burst.
      const halfFlip: Animated.CompositeAnimation[] = [];
      const burst: Animated.CompositeAnimation[] = [];
      for (const c of current) {
        const k = key(c.col, c.row);
        if (flipped.has(k)) halfFlip.push(Animated.timing(c.flip, { toValue: 0, duration: timing(160), useNativeDriver: true }));
        else if (winning.has(k))
          burst.push(
            Animated.parallel([
              Animated.timing(c.scale, { toValue: 1.25, duration: timing(120), useNativeDriver: true }),
              Animated.timing(c.opacity, { toValue: 0, duration: timing(240), useNativeDriver: true }),
            ])
          );
      }
      await run(Animated.parallel([...halfFlip, ...burst]));
      let survivors = current
        .filter((c) => !winning.has(key(c.col, c.row)) || flipped.has(key(c.col, c.row)))
        .map((c) => (flipped.has(key(c.col, c.row)) ? { ...c, s: 'WILD' as AcesSym, g: false, lit: false } : { ...c, lit: false }));
      setBoard(survivors);
      await frame();
      const turned = survivors.filter((c) => flipped.has(key(c.col, c.row)));
      if (turned.length) await run(Animated.parallel(turned.map((c) => Animated.timing(c.flip, { toValue: 1, duration: timing(180), useNativeDriver: true }))));

      // 2. Survivors fall; new cards drop in above them. Every card then
      // takes the server's symbol for its cell, so the board always matches.
      const nextCards: BoardCard[] = [];
      for (let col = 0; col < REELS; col++) {
        const colCards = survivors.filter((c) => c.col === col).sort((a, b) => a.row - b.row);
        const start = ROWS - colCards.length;
        colCards.forEach((c, i) => nextCards.push({ ...c, row: start + i, s: next[col][start + i].s, g: next[col][start + i].g }));
        for (let r = 0; r < start; r++) nextCards.push(makeCard(next[col][r], col, r, rowY(r) - start * (cellH + gap) - gap * 2));
      }
      survivors = nextCards;
      setBoard(survivors);
      await frame();
      await frame();
      await run(
        Animated.parallel(
          survivors.map((c) =>
            Animated.timing(c.y, { toValue: rowY(c.row), duration: timing(340), delay: timing(c.col * 40), easing: Easing.out(Easing.back(1.05)), useNativeDriver: true })
          )
        )
      );

      // 3. A Big Joker's spread lands with a flash.
      if (step.bigJokers.length) {
        const big = new Set(step.bigJokers.map(([c, r]) => key(c, r)));
        survivors = survivors.map((c) => (big.has(key(c.col, c.row)) ? { ...c, pop: true } : c));
        setBoard(survivors);
        await frame();
        const popped = survivors.filter((c) => c.pop);
        popped.forEach((c) => c.scale.setValue(0.4));
        await run(Animated.parallel(popped.map((c) => Animated.spring(c.scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }))));
        await wait(250);
        setBoard(survivors.map((c) => ({ ...c, pop: false })));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cellH, makeCard, setBoard, timing, wait]
  );

  const playRound = useCallback(
    async (round: AcesRound, ladder: number[], stake: number, before: number) => {
      await dropIn(round.steps.length ? round.steps[0].grid : round.final);
      let total = before;
      for (let i = 0; i < round.steps.length; i++) {
        const step = round.steps[i];
        const next = i + 1 < round.steps.length ? round.steps[i + 1].grid : round.final;
        setCombo(Math.min(i, ladder.length - 1));
        const win = new Set(step.winning.map(([c, r]) => `${c},${r}`));
        setBoard(cardsRef.current.map((c) => ({ ...c, lit: win.has(`${c.col},${c.row}`) })));
        play('tick');
        total = round2(total + stake * step.win);
        setWinTotal(total);
        setStepWin({ amount: round2(stake * step.win), mult: step.multiplier, key: Date.now() });
        stepAnim.setValue(0);
        Animated.timing(stepAnim, { toValue: 1, duration: timing(900), useNativeDriver: true }).start();
        await wait(760);
        await resolveStep(step, next);
      }
      await wait(round.steps.length ? 200 : 0);
      setCombo(null);
      return total;
    },
    [dropIn, play, resolveStep, setBoard, stepAnim, timing, wait]
  );

  const showBanner = useCallback(
    async (b: Banner, ms: number) => {
      setBanner(b);
      bannerAnim.setValue(0);
      await run(Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }));
      await wait(ms);
      await run(Animated.timing(bannerAnim, { toValue: 0, duration: 220, useNativeDriver: true }));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim, wait]
  );

  const doSpin = useCallback(async () => {
    if (busyRef.current) {
      hurryRef.current = true;
      return;
    }
    const stake = betRef.current;
    if (stake > balanceRef.current) {
      showToast('Insufficient balance');
      setAutoLeft(0);
      return;
    }
    busyRef.current = true;
    hurryRef.current = false;
    setBusy(true);
    setWinTotal(0);
    setStepWin(null);
    setBigWin(null);
    setShownBalance((b) => round2(b - stake));

    // Remember the board so a failed spin (nothing charged) can put it back.
    const previous: AcesCell[][] = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) => {
        const card = cardsRef.current.find((x) => x.col === c && x.row === r);
        return card ? { s: card.s, g: card.g } : DEMO_GRID[c][r];
      })
    );
    const clearing = dropOut();
    let result: { spin: AcesSpinRow; outcome: AcesOutcome };
    try {
      result = await spinAces(stake);
      await clearing;
    } catch (err) {
      await clearing;
      setShownBalance((b) => round2(b + stake));
      setAutoLeft(0);
      showToast(errorMessage(err));
      await dropIn(previous);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;

    const { spin, outcome } = result;
    let total = await playRound(outcome.base, baseLadder, stake, 0);
    if (outcome.freeGames.length > 0 && mountedRef.current) {
      hurryRef.current = false;
      play('win');
      await showBanner({ title: 'FREE GAMES', sub: `${outcome.freeGames.length} SPINS · MULTIPLIERS DOUBLED` }, 1300);
      // The strip counts the Free Games win up as it lands (total minus the base game).
      const base = total;
      for (let i = 0; i < outcome.freeGames.length && mountedRef.current; i++) {
        setFree({ index: i + 1, total: outcome.freeGames.length, base });
        await dropOut();
        total = await playRound(outcome.freeGames[i], freeLadder, stake, total);
        await wait(250);
      }
      const freeWin = round2(total - base);
      await showBanner({ title: 'FREE GAMES WIN', sub: `₹${freeWin.toFixed(2)}` }, 1400);
      setFree(null);
    }
    if (!mountedRef.current) return;

    // The server's payout (rounded down, capped) is the one that counts.
    const payout = Number(spin.payout);
    setWinTotal(payout);
    setShownBalance((b) => round2(b + payout));
    busyRef.current = false;
    hurryRef.current = false;
    setBusy(false);
    if (payout > 0) {
      play('win');
      const ratio = payout / stake;
      if (ratio >= 20) {
        setBigWin({ label: ratio >= 100 ? 'SUPER WIN' : ratio >= 50 ? 'MEGA WIN' : 'BIG WIN', amount: payout });
        bigAnim.setValue(0);
        Animated.spring(bigAnim, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
      }
    }
    refreshWallet().catch(() => {});

    if (autoRef.current > 0) {
      const next = autoRef.current - 1;
      setAutoLeft(next);
      if (next > 0) {
        const pause = payout <= 0 ? 250 : payout / stake >= 20 ? 2600 : 900;
        setTimeout(() => {
          if (mountedRef.current && autoRef.current > 0) {
            setBigWin(null);
            doSpinRef.current();
          }
        }, turboRef.current ? pause / 2 : pause);
      }
    }
  }, [baseLadder, bigAnim, dropIn, dropOut, freeLadder, play, playRound, refreshWallet, showBanner, showToast, wait]);

  const doSpinRef = useRef(doSpin);
  doSpinRef.current = doSpin;

  const changeBet = (dir: 1 | -1) => {
    if (busy || autoLeft > 0) return;
    const i = betLevels.indexOf(bet);
    const next = betLevels[Math.max(0, Math.min(betLevels.length - 1, (i < 0 ? betLevels.indexOf(DEFAULT_BET) : i) + dir))];
    if (next !== undefined) setBet(next);
  };

  const startAuto = (n: number) => {
    setAutoOpen(false);
    setAutoLeft(n);
    autoRef.current = n;
    if (!busyRef.current) doSpin();
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    AsyncStorage.setItem(SOUND_KEY, next ? 'on' : 'off').catch(() => {});
  };

  const openPanel = (p: 'pay' | 'history') => {
    setPanel(p);
    if (p === 'history') {
      setHistory(null);
      fetchAcesHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  const ladder = free ? freeLadder : baseLadder;

  return (
    <View style={styles.root}>
      <Background w={W} h={H} free={!!free} />

      {/* Header */}
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
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My history">
          <MaterialCommunityIcons name="history" size={20} color={GOLD} />
        </Pressable>
        <Pressable onPress={() => openPanel('pay')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Paytable">
          <MaterialCommunityIcons name="information-variant" size={22} color={GOLD} />
        </Pressable>
      </View>

      <View style={{ position: 'absolute', top: logoTop, left: (W - logoW) / 2 }} pointerEvents="none">
        <Logo width={logoW} />
      </View>

      {/* Combo multiplier ladder */}
      <View style={[styles.comboRow, { top: comboTop, left: frameLeft, width: frameW, height: comboH }]}>
        {free ? (
          <View style={styles.freeTag}>
            <Text style={styles.freeTagText}>
              FREE {free.index}/{free.total}
            </Text>
          </View>
        ) : (
          <Text style={styles.comboLabel}>COMBO</Text>
        )}
        {ladder.map((m, i) => {
          const on = combo !== null && (i === combo || (i === ladder.length - 1 && combo >= ladder.length - 1));
          return (
            <View key={i} style={[styles.comboPill, on && styles.comboPillOn, free && !on && styles.comboPillFree]}>
              <Text style={[styles.comboText, on && styles.comboTextOn]}>x{m}</Text>
            </View>
          );
        })}
      </View>

      {/* Board */}
      <View style={{ position: 'absolute', top: frameTop, left: frameLeft, width: frameW, height: frameH }}>
        <Svg width={frameW} height={frameH} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgLinearGradient id="acFrame" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFF1B8" />
              <Stop offset="0.35" stopColor="#E9B949" />
              <Stop offset="0.7" stopColor="#8C5E17" />
              <Stop offset="1" stopColor="#F3D27A" />
            </SvgLinearGradient>
            <RadialGradient id="acWell" cx="50%" cy="40%" r="75%">
              <Stop offset="0" stopColor={free ? '#3B1466' : '#3A0A12'} />
              <Stop offset="1" stopColor={free ? '#12041F' : '#0E0204'} />
            </RadialGradient>
          </Defs>
          <Rect x={2} y={2} width={frameW - 4} height={frameH - 4} rx={14} fill="url(#acWell)" stroke={free ? '#C084FC' : 'url(#acFrame)'} strokeWidth={3.5} />
          {Array.from({ length: REELS - 1 }, (_, i) => (
            <Line key={i} x1={pad + colX(i + 1) - gap / 2} y1={pad} x2={pad + colX(i + 1) - gap / 2} y2={pad + boardH} stroke={GOLD} strokeOpacity={0.15} strokeWidth={1} />
          ))}
          {[
            [7, 7],
            [frameW - 7, 7],
            [7, frameH - 7],
            [frameW - 7, frameH - 7],
          ].map(([x, y], i) => (
            <Polygon key={i} points={`${x},${y - 6} ${x + 6},${y} ${x},${y + 6} ${x - 6},${y}`} fill={GOLD} stroke="#7A4A00" strokeWidth={0.8} />
          ))}
        </Svg>
        <View style={{ position: 'absolute', left: pad, top: pad, width: boardW, height: boardH, overflow: 'hidden' }}>
          {cards.map((c) => (
            <Animated.View
              key={c.id}
              style={{
                position: 'absolute',
                left: colX(c.col),
                top: 0,
                width: cellW,
                height: cellH,
                opacity: c.opacity,
                transform: [{ translateY: c.y }, { scale: c.scale }, { scaleX: c.flip }],
              }}
            >
              <CardArt s={c.s} g={c.g} w={cellW} />
              {c.lit && <Animated.View pointerEvents="none" style={[styles.lit, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }]} />}
              {c.pop && <View pointerEvents="none" style={styles.pop} />}
            </Animated.View>
          ))}
        </View>

        {stepWin && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.stepWin,
              {
                top: frameH / 2 - 24,
                opacity: stepAnim.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                transform: [{ translateY: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [10, -24] }) }, { scale: stepAnim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.6, 1.05, 1] }) }],
              },
            ]}
          >
            <Text style={styles.stepWinText}>
              +₹{stepWin.amount.toFixed(2)}
              {stepWin.mult > 1 ? <Text style={styles.stepWinMult}>  x{stepWin.mult}</Text> : null}
            </Text>
          </Animated.View>
        )}
      </View>

      {/* Win strip */}
      <View style={[styles.winStrip, { top: stripTop, left: frameLeft, width: frameW }]}>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>BET</Text>
          <Text style={styles.stripValue}>₹{bet}</Text>
        </View>
        <View style={[styles.stripCell, styles.stripWin]}>
          <Text style={styles.stripLabel}>{free ? 'FREE GAMES WIN' : 'WIN'}</Text>
          <Text style={[styles.stripWinValue, (free ? winTotal - free.base : winTotal) > 0 && { color: GOLD }]}>₹{(free ? round2(winTotal - free.base) : winTotal).toFixed(2)}</Text>
        </View>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>WAYS</Text>
          <Text style={styles.stripValue}>1024</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={[styles.controls, { bottom: insets.bottom + 18, left: frameLeft, width: frameW }]}>
        <View style={styles.betBox}>
          <Pressable onPress={() => changeBet(-1)} style={[styles.betBtn, (busy || autoLeft > 0) && styles.dim]} hitSlop={6} accessibilityLabel="Lower bet">
            <MaterialCommunityIcons name="minus" size={20} color="#2A1600" />
          </Pressable>
          <View style={styles.betValueBox}>
            <Text style={styles.betLabel}>TOTAL BET</Text>
            <Text style={styles.betValue}>₹{bet}</Text>
          </View>
          <Pressable onPress={() => changeBet(1)} style={[styles.betBtn, (busy || autoLeft > 0) && styles.dim]} hitSlop={6} accessibilityLabel="Raise bet">
            <MaterialCommunityIcons name="plus" size={20} color="#2A1600" />
          </Pressable>
        </View>
        <Pressable
          onPress={() => {
            if (autoLeft > 0) setAutoLeft(0);
            else doSpin();
          }}
          style={({ pressed }) => [styles.spinBtn, pressed && { transform: [{ scale: 0.95 }] }]}
          accessibilityLabel={autoLeft > 0 ? 'Stop auto spin' : busy ? 'Speed up' : 'Spin'}
        >
          <LinearGradient colors={autoLeft > 0 ? ['#FF7A8A', '#B3102F'] : ['#FFF1B0', '#F5C542', '#B7791F']} style={styles.spinInner}>
            {autoLeft > 0 ? (
              <>
                <MaterialCommunityIcons name="stop" size={26} color="#FFFFFF" />
                <Text style={styles.spinAutoText}>{autoLeft}</Text>
              </>
            ) : (
              <MaterialCommunityIcons name={busy ? 'fast-forward' : 'sync'} size={40} color="#3A1E00" />
            )}
          </LinearGradient>
        </Pressable>
        <View style={styles.sideBtns}>
          <Pressable onPress={() => (autoLeft > 0 ? setAutoLeft(0) : setAutoOpen((o) => !o))} style={[styles.sideBtn, autoLeft > 0 && styles.sideBtnOn]} accessibilityLabel="Auto spin">
            <MaterialCommunityIcons name="autorenew" size={16} color={autoLeft > 0 ? '#2A1600' : GOLD} />
            <Text style={[styles.sideBtnText, autoLeft > 0 && { color: '#2A1600' }]}>AUTO</Text>
          </Pressable>
          <Pressable onPress={() => setTurbo((t) => !t)} style={[styles.sideBtn, turbo && styles.sideBtnOn]} accessibilityLabel="Turbo">
            <MaterialCommunityIcons name="lightning-bolt" size={16} color={turbo ? '#2A1600' : GOLD} />
            <Text style={[styles.sideBtnText, turbo && { color: '#2A1600' }]}>TURBO</Text>
          </Pressable>
        </View>
      </View>

      {autoOpen && (
        <View style={[styles.autoPop, { bottom: insets.bottom + 126, right: frameLeft }]}>
          <Text style={styles.autoPopTitle}>AUTO SPIN</Text>
          <View style={styles.autoGrid}>
            {AUTO_OPTIONS.map((n) => (
              <Pressable key={n} onPress={() => startAuto(n)} style={styles.autoOpt}>
                <Text style={styles.autoOptText}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {banner && (
        <View pointerEvents="none" style={styles.bannerWrap}>
          <Animated.View style={[styles.bannerCard, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
            <LinearGradient colors={['#4C1D95', '#1E0B3A']} style={styles.bannerInner}>
              <Text style={styles.bannerTitle}>{banner.title}</Text>
              <Text style={styles.bannerSub}>{banner.sub}</Text>
            </LinearGradient>
          </Animated.View>
        </View>
      )}

      {bigWin && (
        <Pressable style={styles.bigWrap} onPress={() => setBigWin(null)}>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: bigAnim, transform: [{ rotate: raysSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
            <Rays size={Math.max(W, 420) * 1.2} />
          </Animated.View>
          <Animated.View style={{ alignItems: 'center', opacity: bigAnim, transform: [{ scale: bigAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
            <Svg width={Math.min(W * 0.92, 380)} height={72} viewBox="0 0 380 72">
              <Defs>
                <SvgLinearGradient id="acBig" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#FFF6C8" />
                  <Stop offset="0.5" stopColor="#FFC93C" />
                  <Stop offset="1" stopColor="#C9780F" />
                </SvgLinearGradient>
              </Defs>
              <SvgText x={190} y={56} fontSize={50} fontWeight="bold" fontFamily="serif" fill="url(#acBig)" stroke="#5A2E00" strokeWidth={2} textAnchor="middle" letterSpacing={4}>
                {bigWin.label}
              </SvgText>
            </Svg>
            <Text style={styles.bigAmount}>₹{bigCount.toFixed(2)}</Text>
            <View style={styles.row}>
              {(['A', 'WILD', 'K'] as AcesSym[]).map((s, i) => (
                <View key={i} style={{ marginHorizontal: 5, transform: [{ rotate: `${(i - 1) * 12}deg` }, { translateY: i === 1 ? -6 : 0 }] }}>
                  <CardArt s={s} g={s !== 'WILD'} w={52} />
                </View>
              ))}
            </View>
          </Animated.View>
        </Pressable>
      )}

      {panel && (
        <Pressable style={styles.scrim} onPress={() => setPanel(null)}>
          <Pressable style={[styles.sheet, { maxHeight: H * 0.84, width: Math.min(W - 24, 470) }]} onPress={() => {}}>
            <View style={styles.tabs}>
              {(
                [
                  ['pay', 'PAYTABLE'],
                  ['history', 'MY HISTORY'],
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
            <ScrollView contentContainerStyle={{ padding: 14 }}>
              {panel === 'pay' ? <Paytable paytable={paytable} bet={bet} config={config} /> : <History spins={history} />}
            </ScrollView>
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

const PAY_ORDER: AcesCard[] = ['A', 'K', 'Q', 'J', 'SPADE', 'HEART', 'CLUB', 'DIAMOND'];

function Paytable({ paytable, bet, config }: { paytable: Record<AcesCard, [number, number, number]>; bet: number; config: AcesConfig | null }) {
  const base = config?.baseMultipliers ?? FALLBACK_BASE;
  const free = config?.freeMultipliers ?? FALLBACK_FREE;
  return (
    <View>
      <Text style={styles.ruleHead}>Pays per way at ₹{bet} bet</Text>
      <View style={styles.payHeader}>
        <Text style={[styles.payHeadText, { flex: 1.2 }]}>CARD</Text>
        <Text style={styles.payHeadText}>3</Text>
        <Text style={styles.payHeadText}>4</Text>
        <Text style={styles.payHeadText}>5</Text>
      </View>
      {PAY_ORDER.map((s) => (
        <View key={s} style={styles.payRow}>
          <View style={{ flex: 1.2 }}>
            <CardArt s={s} g={false} w={32} />
          </View>
          {paytable[s].map((p, i) => (
            <Text key={i} style={styles.payCellText}>
              ₹{round2(p * bet)}
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.ruleLine}>A win needs the card on reels 1, 2 and 3 in a row from the left (4 or 5 reels pay more). Pay × number of ways × combo multiplier. Ways = how many times the card shows on each of those reels, multiplied.</Text>
      <Text style={styles.ruleHead}>Golden cards & Jokers</Text>
      <View style={[styles.row, { gap: 10, marginBottom: 4 }]}>
        <CardArt s="A" g w={40} />
        <MaterialCommunityIcons name="arrow-right-bold" size={22} color={GOLD} />
        <CardArt s="WILD" g={false} w={40} />
      </View>
      <Text style={styles.ruleLine}>Golden cards land on reels 2, 3 and 4. When a golden card is part of a win it turns into a Joker, which stands in for every card. Sometimes it is a Big Joker that also turns 1–4 other cards on reels 2–5 into Jokers.</Text>
      <Text style={styles.ruleHead}>Cascades & combo</Text>
      <Text style={styles.ruleLine}>
        Winning cards clear and new cards drop in. Each cascade in the same spin raises the combo multiplier: {base.map((m) => `x${m}`).join(' → ')}.
      </Text>
      <Text style={styles.ruleHead}>Free Games</Text>
      <View style={[styles.row, { gap: 10, marginBottom: 4 }]}>
        <CardArt s="SCATTER" g={false} w={40} />
        <Text style={styles.ruleLine}>× {config?.scattersToTrigger ?? 3} or more</Text>
      </View>
      <Text style={styles.ruleLine}>
        {config?.scattersToTrigger ?? 3}+ Scatters when a spin settles give {config?.freeGames ?? 10} Free Games, with the combo doubled: {free.map((m) => `x${m}`).join(' → ')}. {config?.scattersToTrigger ?? 3}+ Scatters in Free Games add {config?.freeRetrigger ?? 5} more.
      </Text>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {config?.rtpPercent ?? 88.09}% (measured over 20 million spins). Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}. Max win per spin ₹{config?.maxPayout ?? 10000}.
      </Text>
      <Text style={styles.ruleLine}>Tap SPIN during a spin to speed it up. Every spin is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ spins }: { spins: AcesSpinRow[] | null }) {
  if (spins === null) return <Text style={styles.muted}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.muted}>No spins yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {spins.map((s) => {
        const payout = Number(s.payout);
        const d = new Date(s.createdAt);
        return (
          <View key={s.id} style={styles.histRow}>
            <View style={styles.histIcon}>
              <CardArt s={s.freeGames > 0 ? 'SCATTER' : payout > 0 ? 'A' : 'CLUB'} g={payout > 0 && s.freeGames === 0} w={26} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.histMain}>
                Bet ₹{Number(s.stake).toFixed(2)} · {s.cascades} cascade{s.cascades === 1 ? '' : 's'}
                {s.freeGames > 0 ? ` · ${s.freeGames} free` : ''}
              </Text>
              <Text style={styles.histSub}>
                {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > 0 ? '#4ADE80' : 'rgba(255,230,220,0.5)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Home-screen tile art: a golden Ace and a Joker. */
export function AcesTileArt({ size }: { size: number }) {
  const w = size * 0.3;
  return (
    <View style={{ width: size * 0.7, height: w * 1.35, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', transform: [{ translateX: -w * 0.36 }, { rotate: '-12deg' }] }}>
        <CardArt s="WILD" g={false} w={w} />
      </View>
      <View style={{ position: 'absolute', transform: [{ translateX: w * 0.36 }, { rotate: '12deg' }] }}>
        <CardArt s="A" g w={w} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050102' },
  row: { flexDirection: 'row', alignItems: 'center' },
  dim: { opacity: 0.4 },

  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(40,6,10,0.85)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(40,6,10,0.9)', borderWidth: 1.2, borderColor: GOLD },
  headBalanceText: { color: GOLD, fontWeight: '900', fontSize: 14 },

  comboRow: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6 },
  comboLabel: { color: 'rgba(255,230,200,0.7)', fontWeight: '900', fontSize: 11, letterSpacing: 2, marginRight: 4 },
  comboPill: { flex: 1, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,3,6,0.85)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.4)' },
  comboPillFree: { borderColor: 'rgba(192,132,252,0.7)' },
  comboPillOn: { backgroundColor: GOLD, borderColor: '#FFF3C4', transform: [{ scale: 1.1 }] },
  comboText: { color: GOLD, fontWeight: '900', fontSize: 14, fontFamily: 'serif' },
  comboTextOn: { color: '#3A1E00' },
  freeTag: { paddingHorizontal: 10, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: '#7C3AED', borderWidth: 1.2, borderColor: '#DDD6FE' },
  freeTagText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11, letterSpacing: 1 },

  lit: { position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: 8, borderWidth: 3, borderColor: GOLD, backgroundColor: 'rgba(255,214,107,0.12)' },
  pop: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 10, borderWidth: 3, borderColor: '#E9D5FF', backgroundColor: 'rgba(168,85,247,0.25)' },
  stepWin: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 6, borderRadius: 22, backgroundColor: 'rgba(12,2,4,0.88)', borderWidth: 2, borderColor: GOLD },
  stepWinText: { color: '#FFFFFF', fontSize: 26, fontWeight: '900' },
  stepWinMult: { color: GOLD, fontSize: 26, fontFamily: 'serif' },

  winStrip: { position: 'absolute', flexDirection: 'row', height: 54, borderRadius: 14, backgroundColor: 'rgba(20,3,6,0.9)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.5)', overflow: 'hidden' },
  stripCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stripWin: { flex: 1.7, borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,214,107,0.25)' },
  stripLabel: { color: 'rgba(255,230,200,0.6)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  stripValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginTop: 1 },
  stripWinValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 1 },

  controls: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  betBox: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(20,3,6,0.9)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.5)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },
  betValueBox: { alignItems: 'center', minWidth: 58 },
  betLabel: { color: 'rgba(255,230,200,0.6)', fontSize: 8.5, fontWeight: '800', letterSpacing: 1 },
  betValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  spinBtn: { width: 92, height: 92, borderRadius: 46, padding: 4, backgroundColor: '#5A2E00', elevation: 10, shadowColor: GOLD, shadowOpacity: 0.8, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  spinInner: { flex: 1, borderRadius: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF3C4' },
  spinAutoText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, marginTop: -2 },
  sideBtns: { gap: 8 },
  sideBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 84, height: 34, borderRadius: 12, justifyContent: 'center', backgroundColor: 'rgba(20,3,6,0.9)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.5)' },
  sideBtnOn: { backgroundColor: GOLD, borderColor: '#FFF3C4' },
  sideBtnText: { color: GOLD, fontWeight: '900', fontSize: 11, letterSpacing: 1 },

  autoPop: { position: 'absolute', padding: 12, borderRadius: 14, backgroundColor: '#2A0508', borderWidth: 1.5, borderColor: GOLD },
  autoPopTitle: { color: GOLD, fontWeight: '900', fontSize: 11, letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
  autoGrid: { flexDirection: 'row', gap: 8 },
  autoOpt: { width: 46, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,214,107,0.12)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.5)' },
  autoOptText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },

  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  bannerCard: { borderRadius: 18, borderWidth: 2, borderColor: GOLD, overflow: 'hidden', minWidth: 260 },
  bannerInner: { paddingHorizontal: 28, paddingVertical: 18, alignItems: 'center' },
  bannerTitle: { color: GOLD, fontSize: 34, fontWeight: '900', fontFamily: 'serif', letterSpacing: 3, textShadowColor: '#000', textShadowRadius: 8 },
  bannerSub: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },

  bigWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,0,2,0.72)', alignItems: 'center', justifyContent: 'center' },
  bigAmount: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', marginVertical: 10, textShadowColor: GOLD_DEEP, textShadowRadius: 12 },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 18, backgroundColor: '#1C0406', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,107,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,214,107,0.14)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(255,230,200,0.6)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(255,238,228,0.85)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  payHeader: { flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,107,0.25)' },
  payHeadText: { flex: 1, color: 'rgba(255,230,200,0.6)', fontWeight: '900', fontSize: 11, textAlign: 'center' },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,214,107,0.15)' },
  payCellText: { flex: 1, color: GOLD, fontWeight: '900', fontSize: 13, textAlign: 'center' },
  muted: { color: 'rgba(255,230,220,0.6)', textAlign: 'center', marginTop: 20, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.15)' },
  histIcon: { width: 30, alignItems: 'center' },
  histMain: { color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 },
  histSub: { color: 'rgba(255,230,220,0.6)', fontWeight: '600', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 13 },

  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: GOLD_DEEP },
  toastText: { color: '#FFE08A', fontSize: 14, fontWeight: '700' },
});
