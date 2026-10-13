import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  PlinkoBet,
  PlinkoConfig,
  PlinkoRisk,
  dropPlinkoBall,
  fetchFairnessStatus,
  fetchPlinkoConfig,
  fetchPlinkoHistory,
  rotateFairnessSeed,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import { useAuth } from '../state/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// The three risk levels are played as coloured tile rows, top to bottom.
const COLORS: { risk: PlinkoRisk; label: string; tile: [string, string]; button: [string, string]; border: string; ball: [string, string, string] }[] = [
  { risk: 'LOW', label: 'GREEN', tile: ['#6BD12E', '#3E9A12'], button: ['#5DB51E', '#2F7A0B'], border: '#173F05', ball: ['#D4FFB0', '#6BD12E', '#2F7A0B'] },
  { risk: 'MEDIUM', label: 'YELLOW', tile: ['#F7A91E', '#D9780A'], button: ['#F0A020', '#B96A06'], border: '#5A3200', ball: ['#FFE7A8', '#F7A91E', '#B96A06'] },
  { risk: 'HIGH', label: 'RED', tile: ['#F0343F', '#B8111F'], button: ['#E8202E', '#9E0C18'], border: '#4A0008', ball: ['#FFB4BA', '#F0343F', '#9E0C18'] },
];
const RISK_INDEX: Record<PlinkoRisk, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

const DEFAULT_ROWS = 8;
const DEFAULT_STAKE = 10;
const STAKE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const QUICK_STAKES = [100, 200, 500, 1000];
const SEGMENT_MS = 115;
const AUTO_OPTIONS = [10, 25, 50, 100];
const AUTO_GAP_MS = 320;
const BIG_WIN_MULTIPLIER = 10;
const BIG_WIN_MS = 3000;
const HISTORY_LEN = 30;
const SOUND_KEY = 'novaplay:plinko:sound:v1';
const LANG_KEY = 'novaplay:plinko:lang:v1';
const TICK_MIN_GAP_MS = 35;

type Lang = 'en' | 'hi';
const TEXT = {
  en: {
    sound: 'Sound',
    betsHistory: 'Bets History',
    gameRules: 'Game Rules',
    gameLimits: 'Game Limits',
    language: 'Language',
    howToPlay: 'HOW TO PLAY',
    limitsTitle: 'GAME LIMITS',
    myBets: 'MY BETS',
    lastResults: 'LAST RESULTS',
    noResults: 'Drop a ball to see results here',
    pins: 'Pins',
    bet: 'Bet',
    rules1: 'The disc will land on one of the tiles at the bottom.',
    rules2:
      'Choose from different pins options, and from either red, yellow or green tiles for higher odds as your bet multiplier increases!',
    rules3:
      'Every bounce comes from your provably-fair seeds — the Encrypted Result at the top is the hash of the server seed, and the ⟳ button reveals it and starts a new one.',
    limitsIntro: 'Game limits are managed by operator. Current game limits for this game are below:',
    maxBet: 'Maximum bet INR:',
    minBet: 'Minimum bet INR:',
    maxWin: 'Maximum win for one bet INR:',
    rtp: 'Return to player:',
    noBets: 'No balls dropped yet.',
    autoColour: 'Auto play colour',
    autoBalls: 'Number of balls',
    insufficient: 'Insufficient balance',
    waitBalls: 'Wait for the balls to land',
  },
  hi: {
    sound: 'आवाज़',
    betsHistory: 'बेट हिस्ट्री',
    gameRules: 'गेम के नियम',
    gameLimits: 'गेम लिमिट',
    language: 'भाषा',
    howToPlay: 'कैसे खेलें',
    limitsTitle: 'गेम लिमिट',
    myBets: 'मेरी बेट',
    lastResults: 'पिछले नतीजे',
    noResults: 'नतीजे देखने के लिए बॉल गिराएँ',
    pins: 'पिन',
    bet: 'बेट',
    rules1: 'डिस्क नीचे की किसी एक टाइल पर गिरेगी।',
    rules2: 'पिन की संख्या चुनें और हरी, पीली या लाल टाइल चुनें — ज़्यादा जोखिम पर मल्टीप्लायर भी ज़्यादा मिलता है!',
    rules3:
      'हर उछाल आपके provably-fair seeds से तय होता है — ऊपर दिखा Encrypted Result सर्वर seed का hash है, और ⟳ बटन उसे दिखाकर नया seed शुरू करता है।',
    limitsIntro: 'गेम लिमिट ऑपरेटर तय करता है। इस गेम की मौजूदा लिमिट नीचे हैं:',
    maxBet: 'अधिकतम बेट INR:',
    minBet: 'न्यूनतम बेट INR:',
    maxWin: 'एक बेट पर अधिकतम जीत INR:',
    rtp: 'खिलाड़ी को वापसी (RTP):',
    noBets: 'अभी तक कोई बॉल नहीं गिराई।',
    autoColour: 'ऑटो प्ले रंग',
    autoBalls: 'बॉल की संख्या',
    insufficient: 'बैलेंस कम है',
    waitBalls: 'बॉल गिरने का इंतज़ार करें',
  },
};
const LANG_NAMES: Record<Lang, string> = { en: 'English', hi: 'हिंदी' };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function formatMult(m: number): string {
  if (m >= 100) return String(Math.floor(m));
  return String(m);
}

type Geometry = {
  rows: number;
  cx: number;
  sx: number;
  sy: number;
  top: number;
  pinR: number;
  ballR: number;
  tilesTop: number;
  tileH: number;
  height: number;
};

function rowY(g: Geometry, i: number) {
  return g.top + i * g.sy;
}

function slotX(g: Geometry, k: number) {
  return g.cx + (k - g.rows / 2) * g.sx;
}

/** Keyframes for a ball following `path`: dropped onto the top pin, one
 * little arc per row onto the next pin, then onto its colour's tile. */
function ballKeyframes(g: Geometry, path: number[], riskIndex: number) {
  const pts: { x: number; y: number; h: number }[] = [{ x: g.cx, y: g.top - g.sy * 1.1, h: 0 }];
  let rights = 0;
  for (let i = 0; i < g.rows; i++) {
    pts.push({ x: g.cx + (rights - i / 2) * g.sx, y: rowY(g, i) - g.pinR - g.ballR, h: i === 0 ? 0 : g.sy * 0.32 });
    rights += path[i];
  }
  pts.push({ x: slotX(g, rights), y: g.tilesTop + (riskIndex + 0.5) * g.tileH, h: g.sy * 0.25 });

  const input: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const taus = [0, 0.25, 0.5, 0.75];
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s];
    const b = pts[s + 1];
    for (const t of taus) {
      input.push(s + t);
      xs.push(a.x + (b.x - a.x) * t);
      ys.push(a.y + (b.y - a.y) * t - b.h * 4 * t * (1 - t));
    }
  }
  const last = pts[pts.length - 1];
  input.push(pts.length - 1);
  xs.push(last.x);
  ys.push(last.y);
  return { input, xs, ys, segments: pts.length - 1, slot: rights };
}

const Board = memo(function Board({ g, width }: { g: Geometry; width: number }) {
  const pins: React.ReactElement[] = [];
  for (let i = 0; i < g.rows; i++) {
    for (let j = 0; j < i + 3; j++) {
      const x = g.cx + (j - (i + 2) / 2) * g.sx;
      const y = rowY(g, i);
      pins.push(<Circle key={`h${i}-${j}`} cx={x} cy={y} r={g.pinR * 2.2} fill="url(#pinGlow)" />);
      pins.push(<Circle key={`s${i}-${j}`} cx={x + g.pinR * 0.15} cy={y + g.pinR * 0.3} r={g.pinR} fill="#0B3F5C" fillOpacity={0.45} />);
      pins.push(<Circle key={`p${i}-${j}`} cx={x} cy={y} r={g.pinR} fill="url(#pinFace)" />);
    }
  }
  // Dotted side guides, like a real Plinko cabinet.
  const topY = g.top - g.sy * 0.6;
  const botY = rowY(g, g.rows - 1);
  const inner = g.sx * 1.9;
  const leftPath = `M 6 ${topY} L ${g.cx - inner} ${topY} L 6 ${botY - g.sy * 1.2} Z`;
  const rightPath = `M ${width - 6} ${topY} L ${g.cx + inner} ${topY} L ${width - 6} ${botY - g.sy * 1.2} Z`;
  return (
    <Svg width={width} height={g.height} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="pinGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.35} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="pinFace" cx="38%" cy="32%" r="70%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#C9D6E0" />
        </RadialGradient>
      </Defs>
      <Path d={leftPath} fill="none" stroke="#0A3D66" strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="2 4" strokeLinejoin="round" />
      <Path d={rightPath} fill="none" stroke="#0A3D66" strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="2 4" strokeLinejoin="round" />
      {pins}
    </Svg>
  );
});

type Ball = { id: number; risk: PlinkoRisk; payout: number; multiplier: number; anim: Animated.Value; frames: ReturnType<typeof ballKeyframes> };
type Floater = { id: number; x: number; y: number; text: string; anim: Animated.Value };
type Popover = 'pins' | 'stake' | 'auto' | 'menu' | null;
type Sheet = 'rules' | 'limits' | null;

export default function PlinkoScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();
  const { backendUser } = useAuth();

  const [config, setConfig] = useState<PlinkoConfig | null>(null);
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [stake, setStake] = useState(DEFAULT_STAKE);
  const [boardSize, setBoardSize] = useState<{ w: number; h: number } | null>(null);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [recent, setRecent] = useState<{ id: number; m: number; risk: PlinkoRisk }[]>([]);
  const [localBalance, setLocalBalance] = useState(coins);
  const [bigWin, setBigWin] = useState<{ m: number; amount: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [popover, setPopover] = useState<Popover>(null);
  const [autoRisk, setAutoRisk] = useState<PlinkoRisk>('LOW');
  const [autoLeft, setAutoLeft] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [lastResultsOpen, setLastResultsOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [lang, setLang] = useState<Lang>('en');
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<PlinkoBet[]>([]);
  const [seedHash, setSeedHash] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(0);

  const idRef = useRef(1);
  const inFlightRef = useRef(0);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoLeftRef = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const soundRef = useRef(true);
  soundRef.current = soundOn;
  const playersRef = useRef<{ tick: AudioPlayer; land: AudioPlayer; win: AudioPlayer } | null>(null);
  const lastTickRef = useRef(0);
  const soundTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const t = TEXT[lang];

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const busy = inFlight > 0 || autoLeft > 0;

  useEffect(() => {
    mountedRef.current = true;
    fetchPlinkoConfig()
      .then(setConfig)
      .catch(() => {});
    fetchFairnessStatus()
      .then((f) => setSeedHash(f.serverSeedHash))
      .catch(() => {});
    AsyncStorage.multiGet([SOUND_KEY, LANG_KEY])
      .then(([[, snd], [, lng]]) => {
        if (snd === 'off') setSoundOn(false);
        if (lng === 'hi' || lng === 'en') setLang(lng);
      })
      .catch(() => {});
    try {
      setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
      playersRef.current = {
        tick: createAudioPlayer(require('../../assets/sounds/plinko-tick.wav')),
        land: createAudioPlayer(require('../../assets/sounds/plinko-land.wav')),
        win: createAudioPlayer(require('../../assets/sounds/plinko-win.wav')),
      };
    } catch {
      playersRef.current = null;
    }
    const timers = soundTimers.current;
    return () => {
      mountedRef.current = false;
      timers.forEach(clearTimeout);
      timers.clear();
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((pl) => pl.remove());
      if (autoTimer.current) clearTimeout(autoTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // The shown balance runs locally while balls fall (stake off on drop, win
  // on landing) so a win never shows early; it re-syncs when all have landed.
  useEffect(() => {
    if (inFlight === 0) setLocalBalance(coins);
  }, [coins, inFlight]);

  useEffect(() => {
    if (!bigWin) return;
    const id = setTimeout(() => setBigWin(null), BIG_WIN_MS);
    return () => clearTimeout(id);
  }, [bigWin]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }, []);

  const play = useCallback((name: 'tick' | 'land' | 'win') => {
    if (!soundRef.current) return;
    const player = playersRef.current?.[name];
    if (!player) return;
    if (name === 'tick') {
      const now = Date.now();
      if (now - lastTickRef.current < TICK_MIN_GAP_MS) return;
      lastTickRef.current = now;
    }
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // A missed sound effect is harmless.
    }
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    AsyncStorage.setItem(SOUND_KEY, next ? 'on' : 'off').catch(() => {});
  };

  const chooseLang = (l: Lang) => {
    setLang(l);
    setLangPickerOpen(false);
    AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
  };

  const geometry: Geometry | null = useMemo(() => {
    if (!boardSize) return null;
    const sx = (boardSize.w - 12) / (rows + 2);
    const tileH = Math.max(15, Math.min(22, sx * 0.5));
    const headroom = sx * 1.1 + 10;
    const avail = boardSize.h - headroom - tileH * 3 - 12;
    const sy = Math.min(sx * 1.05, avail / (rows - 1 + 0.45));
    const top = headroom + Math.max(0, (avail - (rows - 1 + 0.45) * sy) / 2);
    const pinR = Math.max(2.2, Math.min(6, sx * 0.13));
    const ballR = Math.max(5, Math.min(12, sx * 0.3));
    const tilesTop = top + (rows - 1) * sy + sy * 0.45;
    return { rows, cx: boardSize.w / 2, sx, sy, top, pinR, ballR, tilesTop, tileH, height: boardSize.h };
  }, [boardSize, rows]);

  // One bump value per tile (3 colour rows x slots).
  const tileAnims = useMemo(
    () => COLORS.map(() => Array.from({ length: rows + 1 }, () => new Animated.Value(0))),
    [rows]
  );

  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const tileAnimsRef = useRef(tileAnims);
  tileAnimsRef.current = tileAnims;

  const onLand = useCallback(
    (ball: Ball) => {
      if (!mountedRef.current) return;
      const g = geometryRef.current;
      const ri = RISK_INDEX[ball.risk];
      const bump = tileAnimsRef.current[ri]?.[ball.frames.slot];
      if (bump) {
        bump.setValue(1);
        Animated.timing(bump, { toValue: 0, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      }
      setBalls((prev) => prev.filter((b) => b.id !== ball.id));
      setLocalBalance((b) => round2(b + ball.payout));
      setRecent((prev) => [{ id: ball.id, m: ball.multiplier, risk: ball.risk }, ...prev].slice(0, HISTORY_LEN));
      if (g && ball.payout > 0) {
        const fid = idRef.current++;
        const anim = new Animated.Value(0);
        setFloaters((prev) => [
          ...prev,
          { id: fid, x: slotX(g, ball.frames.slot), y: g.tilesTop - 20, text: `+₹${ball.payout.toFixed(2)}`, anim },
        ]);
        Animated.timing(anim, { toValue: 1, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() =>
          setFloaters((prev) => prev.filter((f) => f.id !== fid))
        );
      }
      if (ball.multiplier >= BIG_WIN_MULTIPLIER) setBigWin({ m: ball.multiplier, amount: ball.payout });
      play(ball.multiplier > 1 ? 'win' : 'land');
      inFlightRef.current -= 1;
      setInFlight(inFlightRef.current);
      if (inFlightRef.current === 0) refreshWallet();
    },
    [refreshWallet, play]
  );

  const langRef = useRef(lang);
  langRef.current = lang;
  const localBalanceRef = useRef(localBalance);
  localBalanceRef.current = localBalance;
  const stakeRef = useRef(stake);
  stakeRef.current = stake;

  const drop = useCallback(
    async (risk: PlinkoRisk): Promise<boolean> => {
      const g = geometryRef.current;
      const amount = stakeRef.current;
      if (!g) return false;
      if (amount > localBalanceRef.current) {
        showToast(TEXT[langRef.current].insufficient);
        return false;
      }
      setPopover(null);
      inFlightRef.current += 1;
      setInFlight(inFlightRef.current);
      setLocalBalance((b) => round2(b - amount));
      try {
        const res = await dropPlinkoBall(amount, g.rows, risk);
        if (!mountedRef.current) return false;
        setSeedHash(res.serverSeedHash);
        const frames = ballKeyframes(g, res.path, RISK_INDEX[risk]);
        const ball: Ball = {
          id: idRef.current++,
          risk,
          payout: Number(res.payout),
          multiplier: Number(res.multiplier),
          anim: new Animated.Value(0),
          frames,
        };
        setBalls((prev) => [...prev, ball]);
        Animated.timing(ball.anim, {
          toValue: frames.segments,
          duration: frames.segments * SEGMENT_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(() => onLand(ball));
        // A tick each time the ball meets a pin (points 1..rows).
        for (let i = 1; i < frames.segments; i++) {
          const timer = setTimeout(() => {
            soundTimers.current.delete(timer);
            play('tick');
          }, i * SEGMENT_MS);
          soundTimers.current.add(timer);
        }
        return true;
      } catch (err) {
        inFlightRef.current -= 1;
        setInFlight(inFlightRef.current);
        setLocalBalance((b) => round2(b + amount));
        if (mountedRef.current) showToast(errorMessage(err));
        return false;
      }
    },
    [onLand, showToast, play]
  );

  const dropRef = useRef(drop);
  dropRef.current = drop;

  const stopAuto = () => {
    autoLeftRef.current = 0;
    setAutoLeft(0);
    if (autoTimer.current) clearTimeout(autoTimer.current);
  };

  const startAuto = (count: number) => {
    setPopover(null);
    autoLeftRef.current = count;
    setAutoLeft(count);
    const risk = autoRisk;
    const tick = async () => {
      if (!mountedRef.current || autoLeftRef.current <= 0) return;
      const ok = await dropRef.current(risk);
      if (!ok) return stopAuto();
      autoLeftRef.current -= 1;
      setAutoLeft(autoLeftRef.current);
      if (autoLeftRef.current > 0) autoTimer.current = setTimeout(tick, AUTO_GAP_MS);
    };
    tick();
  };

  const setStakeValue = (v: number) => setStake(round2(Math.min(Math.max(v, minStake), maxStake)));
  const stepStake = (dir: 1 | -1) =>
    setStakeValue(
      dir === 1
        ? STAKE_STEPS.find((s) => s > stake) ?? maxStake
        : [...STAKE_STEPS].reverse().find((s) => s < stake) ?? minStake
    );

  const rotateSeed = () => {
    if (busy) return showToast(t.waitBalls);
    rotateFairnessSeed()
      .then((r) => {
        setSeedHash(r.newServerSeedHash);
        Alert.alert(
          'Server seed revealed',
          `Previous seed:\n${r.revealedServerSeed}\n\nIts hash (shown before):\n${r.revealedServerSeedHash}\n\nNew hash:\n${r.newServerSeedHash}`
        );
      })
      .catch((err) => showToast(errorMessage(err)));
  };

  const openHistory = () => {
    setHistoryOpen(true);
    fetchPlinkoHistory(30)
      .then(setHistory)
      .catch(() => {});
  };

  const tileFont = geometry ? Math.max(7, Math.min(13, geometry.sx * 0.32)) : 10;

  return (
    <LinearGradient colors={['#0D5CA6', '#1291A6', '#1AAF9B']} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>PLINKO</Text>
        <View style={styles.seedRow}>
          <Pressable style={styles.seedTextWrap} onPress={() => seedHash && Alert.alert('Encrypted result', seedHash)}>
            <Text style={styles.seedLabel} numberOfLines={1}>
              Encrypted Result: <Text style={styles.seedHash}>{seedHash ?? '—'}</Text>
            </Text>
          </Pressable>
          <Pressable onPress={rotateSeed} style={styles.seedBtn} hitSlop={6}>
            <MaterialCommunityIcons name="autorenew" size={20} color="#CFF3FF" />
          </Pressable>
        </View>
        <View style={[styles.recentRow, lastResultsOpen && styles.recentPanel]}>
          {lastResultsOpen ? (
            <View style={styles.recentPanelBody}>
              <Text style={styles.recentTitle}>{t.lastResults}</Text>
              <View style={styles.recentWrap}>
                {recent.length === 0 ? (
                  <Text style={styles.recentEmpty}>{t.noResults}</Text>
                ) : (
                  recent.map((r) => (
                    <LinearGradient key={r.id} colors={COLORS[RISK_INDEX[r.risk]].tile} style={styles.recentChip}>
                      <Text style={styles.recentText}>{formatMult(r.m)}x</Text>
                    </LinearGradient>
                  ))
                )}
              </View>
            </View>
          ) : (
            <View style={styles.recentStrip}>
              {recent.map((r) => (
                <LinearGradient key={r.id} colors={COLORS[RISK_INDEX[r.risk]].tile} style={styles.recentChip}>
                  <Text style={styles.recentText}>{formatMult(r.m)}x</Text>
                </LinearGradient>
              ))}
            </View>
          )}
          <Pressable onPress={() => setLastResultsOpen((o) => !o)} style={[styles.historyBtn, lastResultsOpen && styles.historyBtnOpen]} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color="#CFF3FF" />
            <MaterialCommunityIcons name={lastResultsOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#CFF3FF" />
          </Pressable>
        </View>
      </View>

      <View style={styles.board} onLayout={(e) => setBoardSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {geometry && boardSize && <Board g={geometry} width={boardSize.w} />}

        {geometry &&
          config &&
          COLORS.map((c, ri) =>
            config.multipliers[c.risk][String(rows)].map((m, k) => {
              const bump = tileAnims[ri]?.[k];
              return (
                <Animated.View
                  key={`${rows}-${ri}-${k}`}
                  style={[
                    styles.tile,
                    {
                      left: slotX(geometry, k) - geometry.sx / 2 + 1,
                      top: geometry.tilesTop + ri * geometry.tileH,
                      width: geometry.sx - 2,
                      height: geometry.tileH - 1.5,
                      transform: bump ? [{ scale: bump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) }] : [],
                      zIndex: 1,
                    },
                  ]}
                >
                  <LinearGradient colors={c.tile} style={styles.tileFill}>
                    <Text style={[styles.tileText, { fontSize: tileFont }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                      {formatMult(m)}
                    </Text>
                  </LinearGradient>
                  {bump && (
                    <Animated.View pointerEvents="none" style={[styles.tileFlash, { opacity: bump }]} />
                  )}
                </Animated.View>
              );
            })
          )}

        {geometry &&
          balls.map((b) => {
            const tx = b.anim.interpolate({ inputRange: b.frames.input, outputRange: b.frames.xs });
            const ty = b.anim.interpolate({ inputRange: b.frames.input, outputRange: b.frames.ys });
            const r = geometry.ballR;
            const colors = COLORS[RISK_INDEX[b.risk]].ball;
            return (
              <Animated.View
                key={b.id}
                pointerEvents="none"
                style={[styles.ball, { width: r * 2, height: r * 2, borderRadius: r, left: -r, top: -r, shadowColor: colors[1], transform: [{ translateX: tx }, { translateY: ty }] }]}
              >
                <LinearGradient colors={colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ flex: 1, borderRadius: r, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.25)' }} />
                <View style={[styles.ballCore, { width: r * 0.9, height: r * 0.9, borderRadius: r, top: r * 0.55, left: r * 0.55 }]} />
                <View style={[styles.ballShine, { width: r * 0.55, height: r * 0.4, borderRadius: r, top: r * 0.25, left: r * 0.4 }]} />
              </Animated.View>
            );
          })}

        {floaters.map((f) => (
          <Animated.Text
            key={f.id}
            pointerEvents="none"
            style={[
              styles.floater,
              {
                left: Math.min(Math.max(f.x - 50, 4), (boardSize?.w ?? 400) - 104),
                top: f.y,
                opacity: f.anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                transform: [{ translateY: f.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -42] }) }],
              },
            ]}
          >
            {f.text}
          </Animated.Text>
        ))}

        {bigWin && (
          <View style={styles.bigWinWrap}>
            <LinearGradient colors={['#0B4C86', '#08335C']} style={styles.bigWinCard}>
              <Text style={styles.bigWinTitle}>BIG WIN</Text>
              <Text style={styles.bigWinMult}>x{formatMult(bigWin.m)}</Text>
              <Text style={styles.bigWinAmount}>₹{bigWin.amount.toFixed(2)}</Text>
            </LinearGradient>
            <Pressable onPress={() => setBigWin(null)} style={styles.bigWinClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        )}

        {toast && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </View>

      <Pressable onPress={() => !busy && setPopover(popover === 'pins' ? null : 'pins')} style={[styles.pinsPill, busy && styles.dim]}>
        <Text style={styles.pinsText}>{t.pins}: {rows}</Text>
      </Pressable>

      <View style={styles.panel}>
        <View style={styles.stakeRow}>
          <View style={styles.stakeBox}>
            <Text style={styles.stakeLabel}>{t.bet}</Text>
            <View style={styles.stakeValueBox}>
              <Text style={styles.stakeValue}>{stake.toFixed(2)} INR</Text>
            </View>
          </View>
          <Pressable onPress={() => stepStake(-1)} style={styles.roundBtn}>
            <MaterialCommunityIcons name="minus" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={() => setPopover(popover === 'stake' ? null : 'stake')} style={styles.roundBtn}>
            <MaterialCommunityIcons name="database-outline" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={() => stepStake(1)} style={styles.roundBtn}>
            <MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => (autoLeft > 0 ? stopAuto() : setPopover(popover === 'auto' ? null : 'auto'))}
            style={[styles.autoBtn, autoLeft > 0 && styles.autoBtnActive]}
          >
            <MaterialCommunityIcons name={autoLeft > 0 ? 'stop' : 'autorenew'} size={34} color="#FFFFFF" />
            {autoLeft > 0 ? (
              <View style={styles.autoBadge}>
                <Text style={styles.autoBadgeText}>{autoLeft}</Text>
              </View>
            ) : (
              <MaterialCommunityIcons name="play" size={14} color="#FFFFFF" style={styles.autoPlayIcon} />
            )}
          </Pressable>
          {COLORS.map((c) => (
            <Pressable
              key={c.risk}
              disabled={autoLeft > 0}
              onPress={() => drop(c.risk)}
              style={({ pressed }) => [styles.colorBtnWrap, pressed && styles.pressed, autoLeft > 0 && styles.dim]}
            >
              <LinearGradient colors={c.button} style={[styles.colorBtn, { borderColor: c.border }]}>
                <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']} style={styles.colorShine} />
                <Text style={styles.colorText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} allowFontScaling={false}>
                  {c.label}
                </Text>
              </LinearGradient>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.gamePill}>
          <MaterialCommunityIcons name="chevron-left" size={20} color="#FFFFFF" />
          <Text style={styles.gamePillText}>PLINKO</Text>
        </Pressable>
        <Pressable onPress={() => setSheet('rules')} style={styles.helpBtn}>
          <Text style={styles.helpText}>?</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Text style={styles.balanceText}>
          {localBalance.toFixed(2)} <Text style={styles.balanceUnit}>INR</Text>
        </Text>
        <Pressable
          onPress={() => {
            setLangPickerOpen(false);
            setPopover(popover === 'menu' ? null : 'menu');
          }}
          style={styles.menuBtn}
        >
          <MaterialCommunityIcons name="menu" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Popovers */}
      {popover !== null && <Pressable style={StyleSheet.absoluteFill} onPress={() => setPopover(null)} />}
      {popover === 'pins' && (
        <View style={[styles.popover, { bottom: insets.bottom + 200 }]}>
          <Text style={styles.popoverTitle}>{t.pins}</Text>
          <View style={styles.popoverGrid}>
            {Array.from({ length: 9 }, (_, i) => 8 + i).map((n) => (
              <Pressable
                key={n}
                onPress={() => {
                  setRows(n);
                  setPopover(null);
                }}
                style={[styles.popoverOption, styles.popoverThird, n === rows && styles.popoverOptionActive]}
              >
                <Text style={styles.popoverOptionText}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {popover === 'stake' && (
        <View style={[styles.popover, { bottom: insets.bottom + 200 }]}>
          <Text style={styles.popoverTitle}>Bet INR</Text>
          <View style={styles.popoverGrid}>
            {QUICK_STAKES.map((a) => {
              const allowed = a >= minStake && a <= maxStake;
              return (
                <Pressable
                  key={a}
                  disabled={!allowed}
                  onPress={() => {
                    setStakeValue(a);
                    setPopover(null);
                  }}
                  style={[styles.popoverOption, a === stake && styles.popoverOptionActive, !allowed && styles.dim]}
                >
                  <Text style={styles.popoverOptionText}>{a.toFixed(2)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      {popover === 'auto' && (
        <View style={[styles.popover, { bottom: insets.bottom + 140 }]}>
          <Text style={styles.popoverTitle}>{t.autoColour}</Text>
          <View style={styles.popoverGrid}>
            {COLORS.map((c) => (
              <Pressable key={c.risk} onPress={() => setAutoRisk(c.risk)} style={[styles.popoverOption, styles.popoverThird, autoRisk === c.risk && { backgroundColor: c.tile[1], borderColor: '#FFFFFF' }]}>
                <Text style={styles.popoverOptionText}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.popoverTitle, { marginTop: 12 }]}>{t.autoBalls}</Text>
          <View style={styles.popoverGrid}>
            {AUTO_OPTIONS.map((n) => (
              <Pressable key={n} onPress={() => startAuto(n)} style={[styles.popoverOption, styles.popoverQuarter]}>
                <Text style={styles.popoverOptionText}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {popover === 'menu' && (
        <View style={[styles.menu, { bottom: insets.bottom + 56 }]}>
          <Text style={styles.menuUser} numberOfLines={1}>
            {backendUser ? `${backendUser.firstName}${backendUser.uid ? ` · UID ${backendUser.uid}` : ''}` : 'Player'}
          </Text>
          <Pressable onPress={toggleSound} style={styles.menuItem}>
            <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={22} color="#FFFFFF" />
            <Text style={styles.menuLabel}>{t.sound}</Text>
            <View style={[styles.switchTrack, soundOn && styles.switchTrackOn]}>
              <View style={[styles.switchKnob, soundOn && styles.switchKnobOn]} />
            </View>
          </Pressable>
          <Pressable
            onPress={() => {
              setPopover(null);
              openHistory();
            }}
            style={styles.menuItem}
          >
            <MaterialCommunityIcons name="history" size={22} color="#FFFFFF" />
            <Text style={styles.menuLabel}>{t.betsHistory}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setPopover(null);
              setSheet('rules');
            }}
            style={styles.menuItem}
          >
            <MaterialCommunityIcons name="text-box-outline" size={22} color="#FFFFFF" />
            <Text style={styles.menuLabel}>{t.gameRules}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setPopover(null);
              setSheet('limits');
            }}
            style={styles.menuItem}
          >
            <MaterialCommunityIcons name="cash" size={22} color="#FFFFFF" />
            <Text style={styles.menuLabel}>{t.gameLimits}</Text>
          </Pressable>
          <Pressable onPress={() => setLangPickerOpen((o) => !o)} style={styles.menuItem}>
            <MaterialCommunityIcons name="web" size={22} color="#FFFFFF" />
            <Text style={styles.menuLabel}>{t.language}</Text>
            <Text style={styles.menuValue}>{LANG_NAMES[lang]}</Text>
            <MaterialCommunityIcons name={langPickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#C9CBD0" />
          </Pressable>
          {langPickerOpen && (
            <View style={styles.langRow}>
              {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
                <Pressable key={l} onPress={() => chooseLang(l)} style={[styles.langOption, l === lang && styles.langOptionActive]}>
                  <Text style={styles.langText}>{LANG_NAMES[l]}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <View style={styles.backdrop}>
          {/* Sibling, not parent, of the sheet so its ScrollView can scroll. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{sheet === 'limits' ? t.limitsTitle : t.howToPlay}</Text>
              <Pressable onPress={() => setSheet(null)} style={styles.sheetClose} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              {sheet === 'rules' && (
              <>
              <View style={styles.logoRow}>
                <MaterialCommunityIcons name="triangle-outline" size={40} color="#22D3D8" />
                <Text style={styles.logoText}>PLINKO</Text>
              </View>
              <View style={styles.demo}>
                {[6, 7, 8].map((n, row) => (
                  <View key={row} style={styles.demoPinRow}>
                    {Array.from({ length: n }, (_, i) => (
                      <View key={i} style={styles.demoPin} />
                    ))}
                  </View>
                ))}
                {COLORS.map((c, ri) => (
                  <View key={c.risk} style={styles.demoTileRow}>
                    {Array.from({ length: 8 }, (_, i) => (
                      <LinearGradient key={i} colors={c.tile} style={styles.demoTile}>
                        {ri === 1 && i === 4 && <Text style={styles.demoTileText}>3.2</Text>}
                      </LinearGradient>
                    ))}
                  </View>
                ))}
                <View style={styles.demoDisc}>
                  <LinearGradient colors={COLORS[1].ball} style={{ flex: 1, borderRadius: 16 }} />
                </View>
              </View>
              <Text style={styles.sheetText}>{t.rules1}</Text>
              <Text style={styles.sheetText}>{t.rules2}</Text>
              <Text style={styles.sheetText}>{t.rules3}</Text>
              <Text style={styles.limitsTitle}>{t.limitsTitle}</Text>
              </>
              )}
              {sheet === 'limits' && <Text style={styles.limitsIntro}>{t.limitsIntro}</Text>}
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>{t.maxBet}</Text>
                <Text style={styles.limitValue}>{maxStake.toFixed(2)}</Text>
              </View>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>{t.minBet}</Text>
                <Text style={styles.limitValue}>{minStake.toFixed(2)}</Text>
              </View>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>{t.maxWin}</Text>
                <Text style={styles.limitValue}>{maxPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>{t.rtp}</Text>
                <Text style={styles.limitValue}>{config?.rtpPercent ?? 90}%</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={historyOpen} transparent animationType="fade" onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.backdrop}>
          {/* Sibling, not parent, of the sheet so its ScrollView can scroll. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHistoryOpen(false)} />
          <View style={[styles.sheet, { maxHeight: '70%' }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t.myBets}</Text>
              <Pressable onPress={() => setHistoryOpen(false)} style={styles.sheetClose} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              {history.length === 0 ? (
                <Text style={styles.sheetText}>{t.noBets}</Text>
              ) : (
                history.map((h) => {
                  const c = COLORS[RISK_INDEX[h.risk]];
                  const won = Number(h.payout) >= Number(h.stake);
                  return (
                    <View key={h.id} style={styles.historyRow}>
                      <View style={[styles.historyDot, { backgroundColor: c.tile[0] }]} />
                      <Text style={styles.historyPins}>{h.rows} {t.pins}</Text>
                      <Text style={styles.historyStake}>₹{Number(h.stake).toFixed(2)}</Text>
                      <Text style={[styles.historyResult, { color: won ? '#7CFFB2' : '#FF8A95' }]}>
                        {Number(h.multiplier)}x · ₹{Number(h.payout).toFixed(2)}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 12, gap: 8 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  seedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seedTextWrap: { flex: 1 },
  seedLabel: { color: '#E6F7FF', fontSize: 13 },
  seedHash: { color: '#FFFFFF', fontWeight: '600' },
  seedBtn: {
    width: 44,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,70,90,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(160,230,255,0.35)',
  },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recentPanel: {
    alignItems: 'flex-start',
    padding: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(8,90,110,0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(8,60,80,0.9)',
  },
  recentPanelBody: { flex: 1, paddingLeft: 6 },
  recentTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 5, marginBottom: 8 },
  recentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, maxHeight: 60, overflow: 'hidden' },
  recentEmpty: { color: 'rgba(230,247,255,0.7)', fontSize: 12 },
  historyBtnOpen: { backgroundColor: 'rgba(8,60,80,0.9)' },
  menu: {
    position: 'absolute',
    right: 10,
    width: '64%',
    padding: 10,
    gap: 8,
    borderRadius: 16,
    backgroundColor: '#2A2B2F',
    borderWidth: 1,
    borderColor: '#3A3C42',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  menuUser: { color: '#E6E7EA', fontSize: 16, paddingHorizontal: 6, paddingVertical: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, backgroundColor: '#1D1E21' },
  menuLabel: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  menuValue: { color: '#C9CBD0', fontSize: 13 },
  switchTrack: { width: 42, height: 22, borderRadius: 11, padding: 3, justifyContent: 'center', backgroundColor: '#5D6270' },
  switchTrackOn: { backgroundColor: '#5FB012' },
  switchKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF' },
  switchKnobOn: { alignSelf: 'flex-end' },
  langRow: { flexDirection: 'row', gap: 8 },
  langOption: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#1D1E21', borderWidth: 1, borderColor: '#3A3C42' },
  langOptionActive: { borderColor: '#5FB012', backgroundColor: '#23301A' },
  langText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  limitsIntro: { color: '#B9BBC1', fontSize: 14, lineHeight: 20 },
  recentStrip: {
    flex: 1,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(8,60,90,0.45)',
  },
  recentChip: { paddingHorizontal: 7, height: 22, borderRadius: 11, justifyContent: 'center' },
  recentText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(8,70,90,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(160,230,255,0.35)',
  },
  board: { flex: 1, overflow: 'hidden' },
  tile: { position: 'absolute', borderRadius: 3, overflow: 'hidden' },
  tileFill: { flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1.5, borderBottomColor: 'rgba(0,0,0,0.25)' },
  tileText: { color: '#1C1C1C', fontWeight: '700' },
  tileFlash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#FFFFFF' },
  ball: { position: 'absolute', zIndex: 5, elevation: 6, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  ballCore: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.18)' },
  ballShine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.7)' },
  floater: {
    position: 'absolute',
    width: 100,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    zIndex: 6,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  bigWinWrap: { position: 'absolute', top: '20%', alignSelf: 'center', alignItems: 'center', zIndex: 7 },
  bigWinCard: { alignItems: 'center', paddingHorizontal: 34, paddingVertical: 14, borderRadius: 18, borderWidth: 2, borderColor: '#35E0B0' },
  bigWinTitle: { color: '#FFD66B', fontSize: 15, fontWeight: '900', letterSpacing: 4 },
  bigWinMult: { color: '#35E0B0', fontSize: 30, fontWeight: '900' },
  bigWinAmount: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  bigWinClose: {
    marginTop: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#08335C',
    borderWidth: 2,
    borderColor: '#35E0B0',
  },
  toast: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    zIndex: 8,
  },
  toastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  pinsPill: {
    alignSelf: 'center',
    width: '52%',
    paddingVertical: 6,
    marginVertical: 8,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(10,110,120,0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(8,70,80,0.9)',
  },
  pinsText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  panel: {
    marginHorizontal: 6,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: 'rgba(12,80,130,0.55)',
    gap: 14,
  },
  stakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 34,
    backgroundColor: 'rgba(10,110,120,0.6)',
    borderWidth: 1.5,
    borderColor: 'rgba(8,70,80,0.8)',
  },
  stakeBox: { flex: 1, alignItems: 'center' },
  stakeLabel: { color: '#FFFFFF', fontSize: 14, marginBottom: 3 },
  stakeValueBox: { alignSelf: 'stretch', paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(6,70,80,0.8)', alignItems: 'center' },
  stakeValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,110,120,0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(8,70,80,0.9)',
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  autoBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E6FE0',
    borderWidth: 3,
    borderColor: '#0B3A80',
  },
  autoBtnActive: { backgroundColor: '#C62828', borderColor: '#5A0B0B' },
  autoPlayIcon: { position: 'absolute' },
  autoBadge: { position: 'absolute', top: -4, right: -6, minWidth: 24, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD23F' },
  autoBadgeText: { color: '#1A2B55', fontSize: 11, fontWeight: '900' },
  colorBtnWrap: { flex: 1 },
  colorBtn: { height: 64, borderRadius: 32, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 3, overflow: 'hidden' },
  colorShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  colorText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.3, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  pressed: { transform: [{ scale: 0.96 }] },
  dim: { opacity: 0.5 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingTop: 8, backgroundColor: 'rgba(10,90,110,0.55)' },
  gamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34%',
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(10,110,120,0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(8,70,80,0.9)',
  },
  gamePillText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  helpBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F28C12', borderWidth: 1.5, borderColor: '#7A3E00' },
  helpText: { color: '#3A1C00', fontSize: 16, fontWeight: '800' },
  balanceText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  balanceUnit: { color: '#BFEAF5', fontSize: 14, fontWeight: '500' },
  menuBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,110,120,0.9)', borderWidth: 1.5, borderColor: 'rgba(8,70,80,0.9)' },
  popover: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#0A3F5C',
    borderWidth: 1,
    borderColor: '#07304A',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  popoverTitle: { color: '#FFFFFF', fontSize: 15, textAlign: 'center', marginBottom: 10 },
  popoverGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  popoverOption: { width: '48%', flexGrow: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E5578', borderWidth: 1, borderColor: '#0A4563' },
  popoverThird: { width: '30%' },
  popoverQuarter: { width: '22%' },
  popoverOptionActive: { backgroundColor: '#1592A8', borderColor: '#7FE3F0' },
  popoverOptionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 14 },
  sheet: { maxHeight: '85%', borderRadius: 20, backgroundColor: '#212327', overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#34363C' },
  sheetTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  sheetClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16181B', borderWidth: 1, borderColor: '#4A4D55' },
  sheetBody: { padding: 18, gap: 12 },
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  logoText: { color: '#FFFFFF', fontSize: 28 },
  demo: { alignSelf: 'center', alignItems: 'center', marginVertical: 14 },
  demoPinRow: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  demoPin: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#F2F4F7' },
  demoTileRow: { flexDirection: 'row', gap: 3, marginTop: 3 },
  demoTile: { width: 26, height: 22, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  demoTileText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  demoDisc: { position: 'absolute', top: 58, left: '44%', width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: 'rgba(0,0,0,0.3)', overflow: 'hidden' },
  sheetText: { color: '#E6E7EA', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  limitsTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginTop: 8 },
  limitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderRadius: 10, backgroundColor: '#17181B' },
  limitLabel: { flex: 1, color: '#C9CBD0', fontSize: 14 },
  limitValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14, overflow: 'hidden', backgroundColor: '#4A4E5A' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#3A3D44' },
  historyDot: { width: 10, height: 10, borderRadius: 5 },
  historyPins: { color: '#FFFFFF', fontSize: 13, width: 56 },
  historyStake: { color: '#C9CBD0', fontSize: 13, flex: 1 },
  historyResult: { fontSize: 13, fontWeight: '800' },
});
