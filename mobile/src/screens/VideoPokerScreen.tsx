import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Pattern, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { PokerConfig, PokerHand, PokerRound, dealPoker, drawPoker, fetchActivePoker, fetchPokerConfig, fetchPokerHistory } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const AMBER = '#FFE58A';
const SAPPHIRE = '#0B1B7A';
const ROSE = '#FF5C8A';
const INK = '#EEF1FF';
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♣', '♦'];
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const SOUND_KEY = 'novaplay:videopoker:sound';
const TOAST_MS = 1900;
const HAND_NAME: Record<PokerHand, string> = {
  ROYAL_FLUSH: 'Royal Flush',
  STRAIGHT_FLUSH: 'Straight Flush',
  FOUR_OF_A_KIND: 'Four of a Kind',
  FULL_HOUSE: 'Full House',
  FLUSH: 'Flush',
  STRAIGHT: 'Straight',
  THREE_OF_A_KIND: 'Three of a Kind',
  TWO_PAIR: 'Two Pair',
  JACKS_OR_BETTER: 'Jacks or Better',
  NOTHING: 'No win',
};
const FALLBACK_PAYTABLE: PokerConfig['paytable'] = [
  { hand: 'ROYAL_FLUSH', multiplier: 500 },
  { hand: 'STRAIGHT_FLUSH', multiplier: 50 },
  { hand: 'FOUR_OF_A_KIND', multiplier: 20 },
  { hand: 'FULL_HOUSE', multiplier: 7 },
  { hand: 'FLUSH', multiplier: 5 },
  { hand: 'STRAIGHT', multiplier: 3.5 },
  { hand: 'THREE_OF_A_KIND', multiplier: 2.5 },
  { hand: 'TWO_PAIR', multiplier: 2 },
  { hand: 'JACKS_OR_BETTER', multiplier: 1 },
];
const NO_HOLDS = [false, false, false, false, false];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function fmtMult(m: number): string {
  return `${Number.isInteger(m) ? m : m.toFixed(1)}x`;
}

function fmtMoney(n: number): string {
  return n >= 1000 ? `₹${Math.floor(n).toLocaleString('en-IN')}` : `₹${n.toFixed(2)}`;
}

const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

/** Which of the five cards make the paid hand. */
function winningCards(hand: number[], result: PokerHand): boolean[] {
  if (result === 'NOTHING') return hand.map(() => false);
  if (result === 'STRAIGHT' || result === 'FLUSH' || result === 'FULL_HOUSE' || result === 'STRAIGHT_FLUSH' || result === 'ROYAL_FLUSH') return hand.map(() => true);
  const counts = new Array<number>(13).fill(0);
  hand.forEach((c) => counts[c % 13]++);
  return hand.map((c) => counts[c % 13] >= 2);
}

// ---------- art ----------

const CardFace = memo(function CardFace({ card, w }: { card: number; w: number }) {
  const h = w * 1.4;
  const rank = card % 13;
  const suit = Math.floor(card / 13);
  const red = suit === 1 || suit === 3;
  const color = red ? '#D1142F' : '#15161C';
  const label = RANKS[rank];
  const court = rank >= 10;
  const corner = (
    <>
      <Text style={{ color, fontWeight: '900', fontSize: w * (label.length > 1 ? 0.22 : 0.26), lineHeight: w * 0.28 }}>{label}</Text>
      <Text style={{ color, fontSize: w * 0.19, lineHeight: w * 0.21 }}>{SUITS[suit]}</Text>
    </>
  );
  return (
    <LinearGradient colors={['#FFFFFF', '#F7F5EE', '#E9E4D6']} style={[styles.card, { width: w, height: h, borderRadius: w * 0.08 }]}>
      <View style={[styles.cardCorner, { top: w * 0.05, left: w * 0.07 }]}>{corner}</View>
      <View style={[styles.cardCorner, { bottom: w * 0.05, right: w * 0.07, transform: [{ rotate: '180deg' }] }]}>{corner}</View>
      {court ? (
        <View style={[styles.courtFrame, { width: w * 0.54, height: h * 0.54, borderRadius: w * 0.06, borderColor: red ? '#EBA7B2' : '#B7BACB' }]}>
          <MaterialCommunityIcons name="crown" size={w * 0.17} color="#B8862B" />
          <Text style={{ color, fontWeight: '900', fontFamily: 'serif', fontSize: w * 0.3, lineHeight: w * 0.34 }}>{label}</Text>
          <Text style={{ color, fontSize: w * 0.15, lineHeight: w * 0.17 }}>{SUITS[suit]}</Text>
        </View>
      ) : (
        <Text style={{ color, fontSize: w * (rank === 0 ? 0.66 : 0.54), lineHeight: w * (rank === 0 ? 0.74 : 0.62) }}>{SUITS[suit]}</Text>
      )}
    </LinearGradient>
  );
});

const CardBack = memo(function CardBack({ w }: { w: number }) {
  const h = w * 1.4;
  const inset = w * 0.08;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id="vpBack" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2A47D8" />
          <Stop offset="1" stopColor="#0A1664" />
        </SvgLinearGradient>
        <Pattern id="vpLattice" width={w * 0.16} height={w * 0.16} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Rect x={0} y={0} width={w * 0.16} height={w * 0.16} fill="none" stroke={GOLD} strokeOpacity={0.35} strokeWidth={0.8} />
        </Pattern>
      </Defs>
      <Rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={w * 0.08} fill="url(#vpBack)" stroke={GOLD} strokeWidth={1.5} />
      <Rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={w * 0.05} fill="url(#vpLattice)" stroke={GOLD} strokeOpacity={0.7} strokeWidth={1} />
      <Circle cx={w / 2} cy={h / 2} r={w * 0.2} fill="#081052" stroke={GOLD} strokeWidth={1.2} />
      <SvgText x={w / 2} y={h / 2 + w * 0.1} fontSize={w * 0.28} fill={GOLD} textAnchor="middle">
        ♠
      </SvgText>
    </Svg>
  );
});

function Background({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="vpBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0A1450" />
          <Stop offset="0.5" stopColor="#070E38" />
          <Stop offset="1" stopColor="#03061C" />
        </SvgLinearGradient>
        <RadialGradient id="vpSpot" cx="50%" cy="30%" r="60%">
          <Stop offset="0" stopColor="#5B7CFF" stopOpacity={0.28} />
          <Stop offset="1" stopColor="#5B7CFF" stopOpacity={0} />
        </RadialGradient>
        <Pattern id="vpDiamond" width={34} height={34} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Rect x={0} y={0} width={34} height={34} fill="none" stroke="#FFFFFF" strokeOpacity={0.035} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#vpBg)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#vpDiamond)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#vpSpot)" />
      {/* Faint suits in the corners */}
      <SvgText x={w * 0.06} y={h * 0.62} fontSize={w * 0.2} fill="#FFFFFF" opacity={0.04}>
        ♠
      </SvgText>
      <SvgText x={w * 0.76} y={h * 0.66} fontSize={w * 0.2} fill={ROSE} opacity={0.06}>
        ♥
      </SvgText>
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.2} viewBox="0 0 300 60">
      <Defs>
        <SvgLinearGradient id="vpLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF6D2" />
          <Stop offset="0.55" stopColor={GOLD} />
          <Stop offset="1" stopColor="#B7791F" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={150} y={31} fontSize={28} fontWeight="bold" fontFamily="serif" fill="url(#vpLogo)" stroke="#3A1F00" strokeWidth={0.8} textAnchor="middle" letterSpacing={3}>
        VIDEO POKER
      </SvgText>
      <Path d="M34 46 L74 46 M226 46 L266 46" stroke={GOLD} strokeOpacity={0.5} strokeWidth={1.2} />
      <SvgText x={150} y={50} fontSize={11} fontWeight="bold" fill={AMBER} textAnchor="middle" letterSpacing={2.5}>
        JACKS OR BETTER
      </SvgText>
    </Svg>
  );
}

/** Home tile art: a fanned royal flush in spades. */
export function VideoPokerTileArt({ size }: { size: number }) {
  const w = size * 0.26;
  const cards = [9, 10, 11, 12, 0];
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="vptBg" cx="50%" cy="38%" r="70%">
            <Stop offset="0" stopColor="#2A47D8" />
            <Stop offset="1" stopColor="#060C3A" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#vptBg)" />
      </Svg>
      {cards.map((c, i) => (
        <View key={c} style={{ position: 'absolute', left: size / 2 - w / 2 + (i - 2) * size * 0.13, top: size * 0.14 + Math.abs(i - 2) * size * 0.025, transform: [{ rotate: `${(i - 2) * 9}deg` }] }}>
          <CardFace card={c} w={w} />
        </View>
      ))}
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub: string };

export default function VideoPokerScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<PokerConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [round, setRound] = useState<PokerRound | null>(null);
  const [cards, setCards] = useState<(number | null)[]>([null, null, null, null, null]);
  const [faceUp, setFaceUp] = useState<boolean[]>(NO_HOLDS);
  const [held, setHeld] = useState<boolean[]>(NO_HOLDS);
  const [busy, setBusy] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'history' | 'rules' | null>(null);
  const [history, setHistory] = useState<PokerRound[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [trayY, setTrayY] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flips = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(1))).current;
  const lifts = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0))).current;
  const glow = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const paytable = config?.paytable ?? FALLBACK_PAYTABLE;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const live = round?.status === 'ACTIVE';
  const settled = !!round && !live && !busy;

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

  const showHand = useCallback(
    (r: PokerRound) => {
      setCards(r.hand);
      setFaceUp([true, true, true, true, true]);
      flips.forEach((v) => v.setValue(1));
    },
    [flips]
  );

  useEffect(() => {
    mountedRef.current = true;
    fetchPokerConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchActivePoker()
      .then(({ round: open }) => {
        if (!open || !mountedRef.current) return;
        setRound(open);
        setBet(Number(open.stake));
        showHand(open);
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
        Animated.timing(glow, { toValue: 1, duration: 650, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 650, useNativeDriver: false }),
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
  }, [glow, showHand]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  // Held cards sit a little higher.
  useEffect(() => {
    held.forEach((h, i) => Animated.spring(lifts[i], { toValue: h ? 1 : 0, friction: 6, tension: 160, useNativeDriver: true }).start());
  }, [held, lifts]);

  const showBanner = useCallback(
    (b: Banner) => {
      setBanner(b);
      bannerAnim.setValue(0);
      Animated.sequence([
        Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.delay(1500),
        Animated.timing(bannerAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(() => mountedRef.current && setBanner(null));
    },
    [bannerAnim]
  );

  /** Turns card i over to show `card`. */
  const flipTo = useCallback(
    async (i: number, card: number) => {
      await run(Animated.timing(flips[i], { toValue: 0, duration: 70, useNativeDriver: true }));
      setCards((cs) => cs.map((c, k) => (k === i ? card : c)));
      setFaceUp((f) => f.map((u, k) => (k === i ? true : u)));
      play('tick');
      await run(Animated.timing(flips[i], { toValue: 1, duration: 110, useNativeDriver: true }));
    },
    [flips, play]
  );

  /** Turns the given cards face down. */
  const turnDown = useCallback(
    async (which: number[]) => {
      await Promise.all(which.map((i) => run(Animated.timing(flips[i], { toValue: 0, duration: 110, useNativeDriver: true }))));
      setFaceUp((f) => f.map((u, k) => (which.includes(k) ? false : u)));
      which.forEach((i) => flips[i].setValue(1));
    },
    [flips]
  );

  const finishBusy = () => {
    busyRef.current = false;
    setBusy(false);
    setDealing(false);
  };

  const doDeal = useCallback(async () => {
    if (busyRef.current) return;
    if (bet > balanceRef.current) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setDealing(true);
    setBanner(null);
    setHeld(NO_HOLDS);
    const previous = round;
    await turnDown([0, 1, 2, 3, 4].filter((i) => faceUp[i]));
    let r: PokerRound;
    try {
      r = await dealPoker(bet);
    } catch (err) {
      showToast(errorMessage(err));
      if (previous && mountedRef.current) showHand(previous);
      finishBusy();
      return;
    }
    if (!mountedRef.current) return;
    setShownBalance((b) => round2(b - bet));
    setRound(r);
    for (let i = 0; i < 5; i++) await flipTo(i, r.hand[i]);
    if (!mountedRef.current) return;
    finishBusy();
  }, [bet, faceUp, flipTo, round, showHand, showToast, turnDown]);

  const doDraw = useCallback(async () => {
    if (busyRef.current || !round || round.status !== 'ACTIVE') return;
    busyRef.current = true;
    setBusy(true);
    const holds = [0, 1, 2, 3, 4].filter((i) => held[i]);
    const replace = [0, 1, 2, 3, 4].filter((i) => !held[i]);
    await turnDown(replace);
    let r: PokerRound;
    try {
      r = await drawPoker(round.id, holds);
    } catch (err) {
      showToast(errorMessage(err));
      if (mountedRef.current) showHand(round);
      fetchActivePoker()
        .then(({ round: open }) => {
          if (!mountedRef.current) return;
          if (open) setRound(open);
          else refreshWallet().catch(() => {});
        })
        .catch(() => {});
      finishBusy();
      return;
    }
    if (!mountedRef.current) return;
    for (const i of replace) await flipTo(i, r.hand[i]);
    if (!mountedRef.current) return;
    setHeld(NO_HOLDS);
    setRound(r);
    const payout = Number(r.payout);
    const stake = Number(r.stake);
    if (payout > 0) {
      setShownBalance((b) => round2(b + payout));
      if (payout > stake) {
        play('win');
        showBanner({ title: HAND_NAME[r.result].toUpperCase(), sub: `${fmtMoney(payout)}  ·  ${fmtMult(Number(r.multiplier))}` });
      } else play('tick');
    } else play('land');
    refreshWallet().catch(() => {});
    finishBusy();
  }, [flipTo, held, play, refreshWallet, round, showBanner, showHand, showToast, turnDown]);

  const toggleHold = (i: number) => {
    if (!live || busy || !faceUp[i]) return;
    setHeld((h) => h.map((x, k) => (k === i ? !x : x)));
    play('tick');
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
      fetchPokerHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const contentW = Math.min(W - 24, 460);
  const headerH = insets.top + 50;
  const compact = H < 760;
  const logoW = Math.min(contentW * 0.72, 300);
  const gap = 7;
  const trayPad = 10;
  // Each card has a 2px frame on both sides for the held / winning glow.
  const cardW = Math.min((contentW - trayPad * 2 - 4 * gap) / 5 - 4, 86);
  const cardH = cardW * 1.4;
  const lift = Math.round(cardW * 0.14);
  const logoH = compact ? 0 : logoW * 0.2 + 2;
  const trayH = trayPad * 2 + lift + cardH + 4 + 30 + 28;
  const rowSpace = H - headerH - insets.bottom - 10 - logoH - trayH - 118 - 16 - 36;
  const rowH = Math.max(21, Math.min(32, Math.floor(rowSpace / 9)));
  const allUp = faceUp.every(Boolean);
  // The paytable lights up the dealt hand while holding, and the paid hand once drawn.
  const litHand = round && allUp && !busy && round.result !== 'NOTHING' ? round.result : null;
  const wins = settled && allUp ? winningCards(round.hand, round.result) : null;
  const heldCount = held.filter(Boolean).length;

  let status: React.ReactNode;
  if (!round) status = <Text style={styles.statusText}>Place your bet and deal five cards</Text>;
  else if (busy) status = <Text style={styles.statusText}>{dealing ? 'Dealing…' : 'Drawing…'}</Text>;
  else if (live)
    status = (
      <Text style={styles.statusText}>
        {round.result !== 'NOTHING' ? <Text style={{ color: AMBER }}>{HAND_NAME[round.result]} dealt · </Text> : null}
        Tap cards to hold, then draw
      </Text>
    );
  else {
    const payout = Number(round.payout);
    const stake = Number(round.stake);
    status =
      payout > 0 ? (
        <Text style={[styles.statusText, { color: GOLD }]}>
          {HAND_NAME[round.result]} · {payout > stake ? `WIN ${fmtMoney(payout)}` : `bet back ${fmtMoney(payout)}`}
        </Text>
      ) : (
        <Text style={styles.statusText}>No win this time</Text>
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
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My hands">
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
        <LinearGradient colors={['#1330B8', SAPPHIRE, '#071052']} style={styles.paytable}>
          {paytable.map(({ hand, multiplier }) => {
            const lit = litHand === hand;
            const paid = lit && settled;
            const win = Math.min(floor2(bet * multiplier), maxPayout);
            return (
              <Animated.View
                key={hand}
                style={[
                  styles.payRow,
                  { height: rowH },
                  lit && !paid && { borderColor: 'rgba(255,229,138,0.8)', backgroundColor: 'rgba(255,229,138,0.12)' },
                  paid && { backgroundColor: glow.interpolate({ inputRange: [0, 1], outputRange: ['#E6A919', '#FFE58A'] }), borderColor: '#FFF6D2' },
                ]}
              >
                <Text style={[styles.payHand, { fontSize: rowH < 25 ? 12 : 13.5 }, paid && styles.payDark]} numberOfLines={1}>
                  {HAND_NAME[hand].toUpperCase()}
                </Text>
                <Text style={[styles.payMult, { fontSize: rowH < 25 ? 12 : 13.5 }, paid && styles.payDark]}>{fmtMult(multiplier)}</Text>
                <Text style={[styles.payWin, { fontSize: rowH < 25 ? 12 : 13.5 }, paid && styles.payDark]} numberOfLines={1}>
                  {fmtMoney(win)}
                </Text>
              </Animated.View>
            );
          })}
        </LinearGradient>

        {/* Cards */}
        <View style={[styles.tray, { padding: trayPad }]} onLayout={(e) => setTrayY(e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2)}>
          <View style={[styles.cardRow, { gap, paddingTop: lift }]}>
            {[0, 1, 2, 3, 4].map((i) => {
              const card = cards[i];
              const win = wins?.[i] ?? false;
              const dim = !!wins && round?.result !== 'NOTHING' && !win;
              return (
                <Pressable key={i} onPress={() => toggleHold(i)} disabled={!live || busy} accessibilityLabel={`Card ${i + 1}`}>
                  <Animated.View style={{ transform: [{ translateY: lifts[i].interpolate({ inputRange: [0, 1], outputRange: [0, -lift] }) }, { scaleX: flips[i] }], opacity: dim ? 0.45 : 1 }}>
                    <View style={[styles.cardShadow, { borderRadius: cardW * 0.08 }, win && styles.cardWin, held[i] && live && styles.cardHeld]}>{faceUp[i] && card !== null ? <CardFace card={card} w={cardW} /> : <CardBack w={cardW} />}</View>
                  </Animated.View>
                  <View style={[styles.heldTag, { opacity: held[i] && live ? 1 : 0 }]}>
                    <Text style={styles.heldText}>HELD</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.statusBox}>{status}</View>
        </View>

        {/* Controls */}
        <View>
          <View style={[styles.betRow, (live || busy) && styles.dim]}>
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
          <Pressable onPress={live ? doDraw : doDeal} disabled={busy} style={({ pressed }) => [styles.mainBtn, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel={live ? 'Draw' : 'Deal'}>
            <LinearGradient colors={live ? ['#FF9DB8', ROSE, '#C2185B'] : ['#FFF1B0', GOLD, '#C98A10']} style={styles.mainInner}>
              <MaterialCommunityIcons name={live ? 'cards' : 'cards-playing-outline'} size={22} color={live ? '#3A0015' : '#2A1600'} />
              <Text style={[styles.mainText, { color: live ? '#3A0015' : '#2A1600' }]}>{live ? 'DRAW' : 'DEAL'}</Text>
              <Text style={[styles.mainSub, { color: live ? 'rgba(58,0,21,0.7)' : 'rgba(42,22,0,0.7)' }]}>{live ? `${heldCount} held` : `₹${bet}`}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      {banner && (
        <View pointerEvents="none" style={[styles.bannerWrap, { top: (trayY ?? H * 0.6) - 40 }]}>
          <Animated.View style={{ opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <LinearGradient colors={['#1B3AD0', '#081052']} style={styles.bannerCard}>
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
                  ['history', 'MY HANDS'],
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

function Rules({ config }: { config: PokerConfig | null }) {
  const paytable = config?.paytable ?? FALLBACK_PAYTABLE;
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Place your bet and deal five cards from a single 52-card deck. Tap the cards you want to keep so they show HELD, then draw: every card you didn't hold is replaced from the same deck.</Text>
      <Text style={styles.ruleLine}>Your final hand is paid from the table below. Aces count high or low in a straight. A pair must be jacks, queens, kings or aces to win.</Text>
      <Text style={styles.ruleHead}>Paytable</Text>
      <View style={styles.ruleBox}>
        {paytable.map(({ hand, multiplier }) => (
          <View key={hand} style={styles.ruleRow}>
            <Text style={styles.ruleKey}>{HAND_NAME[hand]}</Text>
            <Text style={styles.ruleVal}>{fmtMult(multiplier)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Payouts are the total returned for your bet, so Jacks or Better gives your bet back. The return with perfect play is {config?.rtpPercent ?? 89.97}%. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}; max win per hand ₹{config?.maxPayout ?? 10000}.
      </Text>
      <Text style={styles.ruleLine}>The deal and the draw come from your provably-fair seeds, fixed when the cards are dealt (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ rounds }: { rounds: PokerRound[] | null }) {
  if (rounds === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (rounds.length === 0) return <Text style={styles.ruleLine}>No hands yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {rounds.map((r) => {
        const payout = Number(r.payout);
        const stake = Number(r.stake);
        const wins = winningCards(r.hand, r.result);
        return (
          <View key={r.id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.histCards}>
                {r.hand.map((c, i) => (
                  <View key={i} style={{ opacity: r.result !== 'NOTHING' && !wins[i] ? 0.45 : 1 }}>
                    <CardFace card={c} w={28} />
                  </View>
                ))}
              </View>
              <Text style={styles.histMain}>{HAND_NAME[r.result]}</Text>
              <Text style={styles.histSub}>
                ₹{stake.toFixed(2)} · {new Date(r.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > stake ? GOLD : 'rgba(238,241,255,0.5)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : `-₹${stake.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#03061C' },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 3 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,16,70,0.9)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(8,16,70,0.92)', borderWidth: 1.2, borderColor: GOLD },
  headBalanceText: { color: GOLD, fontWeight: '900', fontSize: 14 },
  body: { flex: 1, justifyContent: 'space-between' },
  paytable: { borderRadius: 14, paddingVertical: 7, paddingHorizontal: 7, borderWidth: 2, borderColor: GOLD, shadowColor: '#3F5BFF', shadowOpacity: 0.6, shadowRadius: 16, elevation: 8 },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: 7, borderWidth: 1, borderColor: 'transparent' },
  payHand: { flex: 1, color: AMBER, fontWeight: '900', letterSpacing: 0.8 },
  payMult: { width: 56, textAlign: 'right', color: AMBER, fontWeight: '900' },
  payWin: { width: 84, textAlign: 'right', color: '#FFFFFF', fontWeight: '800' },
  payDark: { color: '#2A1600' },
  card: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },
  cardCorner: { position: 'absolute', alignItems: 'center' },
  courtFrame: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.2 },
  tray: { borderRadius: 18, backgroundColor: 'rgba(3,6,30,0.55)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.28)' },
  cardRow: { flexDirection: 'row', justifyContent: 'center' },
  cardShadow: { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6, borderWidth: 2, borderColor: 'transparent' },
  cardHeld: { borderColor: GOLD, shadowColor: GOLD, shadowOpacity: 0.8, shadowRadius: 10 },
  cardWin: { borderColor: GOLD, shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 12 },
  heldTag: { alignSelf: 'center', marginTop: 7, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, backgroundColor: GOLD, borderWidth: 1, borderColor: '#FFF6D2' },
  heldText: { color: '#2A1600', fontWeight: '900', fontSize: 11, letterSpacing: 1.5 },
  statusBox: { alignItems: 'center', marginTop: 8, minHeight: 20 },
  statusText: { color: 'rgba(238,241,255,0.85)', fontWeight: '800', fontSize: 13.5, textAlign: 'center' },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  betBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(8,16,70,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.45)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },
  betValueBox: { flex: 1, alignItems: 'center' },
  betLabel: { color: 'rgba(238,241,255,0.55)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.5 },
  betValue: { color: INK, fontSize: 18, fontWeight: '900' },
  chip: { width: 50, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,16,70,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.45)' },
  chipText: { color: GOLD, fontWeight: '900', fontSize: 16 },
  mainBtn: { height: 62, borderRadius: 20, overflow: 'hidden', marginTop: 10, shadowColor: GOLD, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
  mainInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  mainText: { fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  mainSub: { fontSize: 12, fontWeight: '900' },
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bannerCard: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 18, borderWidth: 2, borderColor: GOLD, alignItems: 'center', minWidth: 230 },
  bannerTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 23, letterSpacing: 3, fontFamily: 'serif' },
  bannerSub: { color: GOLD, fontWeight: '900', fontSize: 17, marginTop: 2 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  sheet: { borderRadius: 18, backgroundColor: '#0A1250', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,107,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,214,107,0.14)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(238,241,255,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(238,241,255,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  ruleBox: { borderRadius: 12, padding: 10, backgroundColor: 'rgba(255,214,107,0.07)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.25)', gap: 6 },
  ruleRow: { flexDirection: 'row', alignItems: 'center' },
  ruleKey: { flex: 1, color: INK, fontWeight: '800', fontSize: 12.5 },
  ruleVal: { color: GOLD, fontWeight: '900', fontSize: 12.5 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.15)' },
  histCards: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(238,241,255,0.5)', fontSize: 11, marginTop: 3 },
  histPay: { fontWeight: '900', fontSize: 14, marginLeft: 8 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: GOLD, maxWidth: '86%', zIndex: 6 },
  toastText: { color: INK, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
