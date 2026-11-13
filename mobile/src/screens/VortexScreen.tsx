import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import {
  VortexConfig,
  VortexElement,
  VortexRound,
  VortexSpinResult,
  VortexSymbol,
  cashOutVortex,
  fetchVortexConfig,
  fetchVortexCurrent,
  fetchVortexHistory,
  partPayoutVortex,
  spinVortex,
} from '../api/backend';
import {
  BoardBase,
  BoardFlash,
  BoardRings,
  ELEMENT_LOOK,
  FILL_KEY,
  SYMBOL_NAME,
  SectionFlash,
  SpinGlyph,
  SymbolOrb,
  VortexBackdrop,
  VortexFill,
  VortexLogo,
  WELL,
  WellGlow,
  WellShade,
  sectionLabel,
} from '../components/VortexArt';
import { RootStackParamList } from '../navigation/types';
import { useGameState } from '../state/GameStateContext';
import { fonts } from '../theme';
import { NO_LIMIT, winLimit } from '../utils/limits';

// Same rings as the server (vortexService.ts); the server's own settings
// replace this as soon as they load.
const FALLBACK_CONFIG: VortexConfig = {
  minStake: 1,
  maxStake: 100000,
  maxPayout: NO_LIMIT,
  rtpPercent: 85,
  maxSpins: 1000,
  skullChancePercent: 8,
  firePremiums: [100, 200, 300, 400, 500],
  rings: [
    { element: 'WATER', ladder: [1.55, 4.85, 10], bonus: 7, chances: [26.05, 15.99, 12.97, 11.65] },
    { element: 'EARTH', ladder: [2.5, 7.7, 16, 27.5, 44], bonus: 20.5, chances: [11.05, 9.16, 8.34, 8.18, 7.25, 7.79] },
    { element: 'FIRE', ladder: [3.9, 12.5, 28, 52, 85, 133, 200], bonus: 0, chances: [4.36, 5.6, 5.54, 5.88, 6.33, 5.85, 5.99, 1.84] },
  ],
};

const ELEMENTS: VortexElement[] = ['WATER', 'EARTH', 'FIRE'];
const EMPTY: VortexFill = { water: 0, earth: 0, fire: 0 };
const STAKE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
const DEFAULT_STAKE = 10;
const GOLD = '#FFD66B';
const DANGER = '#FF2D55';
const SOUND_KEY = 'novaplay:vortex:sound:v1';
const FAST_KEY = 'novaplay:vortex:fast:v1';
const WIN_CARD_MS = 2600;
const TOAST_MS = 2000;
/** The opening card stays at least this long, and at most SPLASH_MAX_MS while the game loads. */
const SPLASH_MIN_MS = 1100;
const SPLASH_MAX_MS = 4000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function fillOf(round: Pick<VortexRound, 'water' | 'earth' | 'fire'> | null): VortexFill {
  return round ? { water: round.water, earth: round.earth, fire: round.fire } : EMPTY;
}

/** What the board is worth (x the bet): each ring's last filled section. */
function boardMultiplier(config: VortexConfig, fill: VortexFill): number {
  return config.rings.reduce((sum, ring) => {
    const level = Math.min(fill[FILL_KEY[ring.element]], ring.ladder.length);
    return sum + (level > 0 ? ring.ladder[level - 1] : 0);
  }, 0);
}

/** What PART PAYOUT pays (x the bet): the last step of every ring with two or more sections. */
function partMultiplier(config: VortexConfig, fill: VortexFill): number {
  return config.rings.reduce((sum, ring) => {
    const level = Math.min(fill[FILL_KEY[ring.element]], ring.ladder.length);
    return sum + (level >= 2 ? ring.ladder[level - 1] - ring.ladder[level - 2] : 0);
  }, 0);
}

function filledSections(config: VortexConfig, fill: VortexFill): SectionFlash[] {
  return config.rings.flatMap((ring) =>
    Array.from({ length: Math.min(fill[FILL_KEY[ring.element]], ring.ladder.length) }, (_, index) => ({ element: ring.element, index }))
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- the symbols in the well ----------

type ReelHandle = {
  /** Symbols run through the well until `land`. */
  start: () => void;
  /** Slows down onto `symbol`. */
  land: (symbol: VortexSymbol, ms: number) => Promise<void>;
};

const LOOP: VortexSymbol[] = ['WATER', 'WIND', 'EARTH', 'SKULL', 'FIRE'];
const LOOP_STRIP: VortexSymbol[] = [...LOOP, ...LOOP, ...LOOP, ...LOOP];

/** A strip of symbols falling through the well; the one in the middle is the spin's result. */
const Reel = forwardRef<ReelHandle, { size: number }>(function Reel({ size }, ref) {
  const d = WELL * 2 * size;
  const pitch = size * 0.312;
  const orb = size * 0.25;
  const [strip, setStrip] = useState<VortexSymbol[]>(['FIRE', 'WATER', 'EARTH']);
  // Which item of the strip is in the middle of the well.
  const pos = useRef(new Animated.Value(1)).current;
  const loop = useRef<Animated.CompositeAnimation | null>(null);
  // Runs once the strip it was set with is on screen.
  const afterRender = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const run = afterRender.current;
    afterRender.current = null;
    run?.();
  }, [strip]);

  useEffect(() => () => loop.current?.stop(), []);

  useImperativeHandle(
    ref,
    () => ({
      start: () => {
        afterRender.current = () => {
          pos.setValue(12);
          loop.current = Animated.loop(Animated.timing(pos, { toValue: 7, duration: 340, easing: Easing.linear, useNativeDriver: true }));
          loop.current.start();
        };
        setStrip([...LOOP_STRIP]);
      },
      land: (symbol, ms) =>
        new Promise<void>((resolve) => {
          loop.current?.stop();
          loop.current = null;
          const others = LOOP.filter((s) => s !== symbol);
          const pick = () => others[Math.floor(Math.random() * others.length)];
          afterRender.current = () => {
            pos.setValue(4);
            Animated.timing(pos, { toValue: 1, duration: ms, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }).start(() => resolve());
          };
          setStrip([pick(), symbol, pick(), pick(), pick(), pick()]);
        }),
    }),
    [pos]
  );

  const translateY = pos.interpolate({ inputRange: [0, 20], outputRange: [d / 2 - 0.5 * pitch, d / 2 - 20.5 * pitch] });
  return (
    <View style={{ width: d, height: d, borderRadius: d / 2, overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: d, transform: [{ translateY }] }}>
        {strip.map((symbol, i) => (
          <View key={i} style={{ height: pitch, alignItems: 'center', justifyContent: 'center' }}>
            <SymbolOrb symbol={symbol} size={orb} />
          </View>
        ))}
      </Animated.View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <WellShade size={size} />
      </View>
    </View>
  );
});

// ---------- cards over the board ----------

type WinInfo = { title: string; amount: number; note?: string };

function WinCard({ win, onClose }: { win: WinInfo; onClose: () => void }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [pop]);
  return (
    <Animated.View style={[styles.winWrap, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
      <Pressable onPress={onClose}>
        <LinearGradient colors={['#FFE9A8', '#C8922A', '#7A4E0E']} style={styles.winEdge}>
          <LinearGradient colors={['#2B2F3B', '#15171D']} style={styles.winCard}>
            <Text style={styles.winTitle}>{win.title}</Text>
            <Text style={styles.winAmount}>{money(win.amount)}</Text>
            {!!win.note && <Text style={styles.winNote}>{win.note}</Text>}
          </LinearGradient>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

type BonusInfo = { premium: number; base: number; amount: number; premiums: number[] };

/** The Fire bonus: a light runs over the premiums and stops on the one the spin picked. */
function BonusCard({ bonus, fast, onDone }: { bonus: BonusInfo; fast: boolean; onDone: () => void }) {
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
    const target = bonus.premiums.indexOf(bonus.premium);
    // Two times round, then on to the pick.
    const steps = bonus.premiums.length * (fast ? 1 : 2) + target;
    let step = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = () => {
      setAt(step % bonus.premiums.length);
      if (step >= steps) {
        setPicked(true);
        timers.push(setTimeout(() => done.current(), fast ? 1400 : 2600));
        return;
      }
      step += 1;
      // Slower towards the end.
      timers.push(setTimeout(tick, 70 + (step / steps) ** 3 * 260));
    };
    timers.push(setTimeout(tick, 350));
    return () => timers.forEach(clearTimeout);
  }, [bonus, fast, pop]);

  return (
    <Animated.View style={[styles.bonusWrap, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
      <Pressable onPress={() => picked && onDone()}>
        <LinearGradient colors={['#FFCB73', '#FF6A1F', '#8A1505']} style={styles.winEdge}>
          <LinearGradient colors={['#33170F', '#150A07']} style={styles.bonusCard}>
            <View style={styles.bonusHead}>
              <SymbolOrb symbol="FIRE" size={30} />
              <Text style={styles.bonusTitle}>FIRE BONUS</Text>
            </View>
            <View style={styles.bonusRow}>
              {bonus.premiums.map((p, i) => (
                <View key={p} style={[styles.bonusChip, i === at && styles.bonusChipOn, picked && i === at && styles.bonusChipPicked]}>
                  <Text style={[styles.bonusChipText, i === at && styles.bonusChipTextOn]}>x{p}</Text>
                </View>
              ))}
            </View>
            {picked ? (
              <>
                <Text style={styles.bonusSum}>
                  x{bonus.base} + x{bonus.premium} = x{bonus.base + bonus.premium}
                </Text>
                <Text style={styles.winAmount}>{money(bonus.amount)}</Text>
              </>
            ) : (
              <Text style={styles.bonusSum}>x{bonus.base} + ?</Text>
            )}
          </LinearGradient>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

/** The date and time under the game. */
const Clock = memo(function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = now.toLocaleTimeString('en-GB', { hour12: false });
  return (
    <Text style={styles.footText}>
      {date} | {time}
    </Text>
  );
});

// ---------- screen ----------

type Flash = { sections: SectionFlash[]; color: string };
type Queued = 'cashout' | 'part' | null;

export default function VortexScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<VortexConfig>(FALLBACK_CONFIG);
  /** The round in play: the board has sections on it. */
  const [round, setRound] = useState<VortexRound | null>(null);
  /** The board as drawn (it follows the round once a spin's symbol has landed). */
  const [shown, setShown] = useState<VortexFill>(EMPTY);
  const [stake, setStake] = useState(DEFAULT_STAKE);
  const [balance, setBalance] = useState(coins);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [fast, setFast] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [glow, setGlow] = useState('#FFFFFF');
  const [floater, setFloater] = useState<string | null>(null);
  const [last, setLast] = useState<VortexSymbol | null>(null);
  const [win, setWin] = useState<WinInfo | null>(null);
  const [bonus, setBonus] = useState<BonusInfo | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'rules' | 'history'>(null);
  const [history, setHistory] = useState<VortexRound[]>([]);
  const [splash, setSplash] = useState(true);

  // The latest of each, for a spin that runs on from the one before (auto).
  const configRef = useRef(config);
  configRef.current = config;
  const roundRef = useRef(round);
  const stakeRef = useRef(stake);
  stakeRef.current = stake;
  const balanceRef = useRef(balance);
  const shownRef = useRef(shown);
  const busyRef = useRef(false);
  const autoRef = useRef(false);
  const fastRef = useRef(fast);
  fastRef.current = fast;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const mountedRef = useRef(true);
  const queued = useRef<Queued>(null);
  const reel = useRef<ReelHandle>(null);
  const players = useRef<{ tick: AudioPlayer; land: AudioPlayer; win: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bonusDone = useRef<(() => void) | null>(null);
  const splashFade = useRef(new Animated.Value(1)).current;

  const flashOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const turn = useRef(new Animated.Value(0)).current;

  const putRound = useCallback((next: VortexRound | null) => {
    roundRef.current = next;
    setRound(next);
  }, []);
  const putShown = useCallback((next: VortexFill) => {
    shownRef.current = next;
    setShown(next);
  }, []);
  const putBalance = useCallback((next: number) => {
    balanceRef.current = next;
    setBalance(next);
  }, []);
  const putBusy = useCallback((next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  }, []);
  const putAuto = useCallback((next: boolean) => {
    autoRef.current = next;
    setAuto(next);
    if (!next && autoTimer.current) {
      clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const play = useCallback((name: 'tick' | 'land' | 'win') => {
    if (!soundRef.current) return;
    try {
      const player = players.current?.[name];
      player?.seekTo(0);
      player?.play();
    } catch {
      // A missed sound effect is harmless.
    }
  }, []);

  const loadHistory = useCallback(() => {
    fetchVortexHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
  }, []);

  /** Puts the screen back on what the server has (after a request failed). */
  const resync = useCallback(() => {
    fetchVortexCurrent()
      .then((res) => {
        if (!mountedRef.current) return;
        putRound(res.round);
        putShown(fillOf(res.round));
      })
      .catch(() => {});
    refreshWallet().catch(() => {});
  }, [putRound, putShown, refreshWallet]);

  // The wallet as the rest of the app knows it, whenever no spin is running here.
  useEffect(() => {
    if (!busyRef.current) putBalance(coins);
  }, [coins, putBalance]);

  useEffect(() => {
    mountedRef.current = true;
    const openedAt = Date.now();
    const configLoad = fetchVortexConfig()
      .then((c) => {
        if (mountedRef.current) setConfig(c);
      })
      .catch(() => {});
    const currentLoad = fetchVortexCurrent()
      .then((res) => {
        if (!mountedRef.current) return;
        putRound(res.round);
        putShown(fillOf(res.round));
        if (res.round) setStake(Number(res.round.stake));
        if (res.legacyPayout > 0) {
          showToast(`Your earlier round was cashed out: ${money(res.legacyPayout)}`);
          refreshWallet().catch(() => {});
        }
      })
      .catch(() => {});
    // The opening card goes once the settings and the player's board are in.
    Promise.race([Promise.all([configLoad, currentLoad]), wait(SPLASH_MAX_MS)]).then(() => {
      splashTimer.current = setTimeout(() => {
        if (!mountedRef.current) return;
        Animated.timing(splashFade, { toValue: 0, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
          if (mountedRef.current) setSplash(false);
        });
      }, Math.max(0, SPLASH_MIN_MS - (Date.now() - openedAt)));
    });
    AsyncStorage.multiGet([SOUND_KEY, FAST_KEY])
      .then(([[, snd], [, fst]]) => {
        if (!mountedRef.current) return;
        if (snd === 'off') setSoundOn(false);
        if (fst === 'on') setFast(true);
      })
      .catch(() => {});
    try {
      setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
      players.current = {
        tick: createAudioPlayer(require('../../assets/sounds/plinko-tick.wav')),
        land: createAudioPlayer(require('../../assets/sounds/plinko-land.wav')),
        win: createAudioPlayer(require('../../assets/sounds/plinko-win.wav')),
      };
    } catch {
      players.current = null;
    }
    return () => {
      mountedRef.current = false;
      autoRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (autoTimer.current) clearTimeout(autoTimer.current);
      if (splashTimer.current) clearTimeout(splashTimer.current);
      const p = players.current;
      players.current = null;
      if (p) Object.values(p).forEach((pl) => pl.remove());
    };
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!win) return;
    const id = setTimeout(() => setWin(null), WIN_CARD_MS);
    return () => clearTimeout(id);
  }, [win]);

  // The spin button's spiral turns while a spin runs.
  useEffect(() => {
    if (!busy && !auto) return;
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      turn.setValue(0);
    };
  }, [busy, auto, turn]);

  // ---- effects on the board ----

  const flashNow = useCallback(
    (sections: SectionFlash[], color: string, ms = 700) => {
      if (sections.length === 0) return;
      setFlash({ sections, color });
      flashOpacity.setValue(1);
      Animated.timing(flashOpacity, { toValue: 0, duration: ms, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
    },
    [flashOpacity]
  );

  const glowNow = useCallback(
    (color: string) => {
      setGlow(color);
      glowOpacity.setValue(0.9);
      Animated.timing(glowOpacity, { toValue: 0, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      pop.setValue(1.12);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    },
    [glowOpacity, pop]
  );

  const shakeNow = useCallback(() => {
    shake.setValue(0);
    Animated.sequence(
      [7, -7, 5, -5, 3, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, easing: Easing.linear, useNativeDriver: true }))
    ).start();
  }, [shake]);

  const floatNow = useCallback(
    (text: string) => {
      setFloater(text);
      floatAnim.setValue(0);
      Animated.timing(floatAnim, { toValue: 1, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished && mountedRef.current) setFloater(null);
      });
    },
    [floatAnim]
  );

  /** What a spin's symbol does, once it has landed in the well. */
  const showResult = useCallback(
    async (res: VortexSpinResult, quick: boolean) => {
      const cfg = configRef.current;
      const ended = res.round.status !== 'PENDING';
      const next = ended ? EMPTY : fillOf(res.round);
      const symbol = res.symbol;
      setLast(symbol);
      putBalance(res.balance);

      if (symbol === 'WIND') {
        await wait(quick ? 60 : 200);
      } else if (symbol === 'SKULL') {
        // Every ring loses the section it stood on.
        const lost = ELEMENTS.filter((el) => res.before[FILL_KEY[el]] > 0).map((el) => ({ element: el, index: res.before[FILL_KEY[el]] - 1 }));
        glowNow(DANGER);
        shakeNow();
        flashNow(lost, DANGER, 800);
        putShown(next);
        play('tick');
        await wait(quick ? 220 : 520);
      } else {
        const ring = cfg.rings.find((r) => r.element === symbol);
        const full = ring ? ring.ladder.length : 0;
        const was = res.before[FILL_KEY[symbol]];
        glowNow(ELEMENT_LOOK[symbol].color);
        if (was < full) {
          putShown(next);
          flashNow([{ element: symbol, index: was }], ELEMENT_LOOK[symbol].bright);
          play('land');
          await wait(quick ? 180 : 420);
        } else if (res.premium == null) {
          // A hit on a full ring: its bonus is paid at once.
          flashNow([{ element: symbol, index: full }], GOLD, 900);
          if (res.instant > 0) floatNow(`+${money(res.instant)}`);
          play('win');
          await wait(quick ? 420 : 900);
        } else {
          flashNow([{ element: symbol, index: full }], GOLD, 900);
          play('win');
          putAuto(false);
          const picked = res.premium;
          await new Promise<void>((resolve) => {
            bonusDone.current = resolve;
            setBonus({ premium: picked, base: ring ? ring.ladder[full - 1] : 0, amount: res.instant, premiums: cfg.firePremiums });
          });
          if (!mountedRef.current) return;
          setBonus(null);
          putShown(next);
        }
      }

      if (res.cashedOut > 0) {
        flashNow(filledSections(cfg, shownRef.current), GOLD, 900);
        play('win');
        setWin({
          title: res.round.endReason === 'MAX_PAYOUT' ? 'MAX WIN' : 'CASHED OUT',
          amount: res.cashedOut,
          note: res.round.endReason === 'SPIN_LIMIT' ? `${cfg.maxSpins} spins: the round was closed` : undefined,
        });
      }
      putShown(next);
      putRound(ended ? null : res.round);
      if (ended) loadHistory();
    },
    [flashNow, floatNow, glowNow, loadHistory, play, putAuto, putBalance, putRound, putShown, shakeNow]
  );

  // ---- actions ----

  const cashOutRef = useRef<() => void>(() => {});
  const partRef = useRef<() => void>(() => {});
  const spinRef = useRef<() => void>(() => {});

  const spin = useCallback(async () => {
    if (busyRef.current) return;
    const cfg = configRef.current;
    const current = roundRef.current;
    const bet = current ? Number(current.stake) : stakeRef.current;
    if (!current && (bet < cfg.minStake || bet > cfg.maxStake)) {
      putAuto(false);
      return showToast(`Bet must be ₹${cfg.minStake} – ₹${cfg.maxStake}`);
    }
    if (bet > balanceRef.current + 1e-9) {
      putAuto(false);
      return showToast('Not enough money');
    }
    putBusy(true);
    setWin(null);
    const before = balanceRef.current;
    putBalance(round2(before - bet));
    reel.current?.start();
    play('tick');
    const started = Date.now();
    try {
      const res = await spinVortex(bet);
      if (!mountedRef.current) return;
      const quick = fastRef.current;
      await wait(Math.max(0, (quick ? 180 : 520) - (Date.now() - started)));
      if (!mountedRef.current) return;
      await reel.current?.land(res.symbol, quick ? 300 : 600);
      if (!mountedRef.current) return;
      await showResult(res, quick);
    } catch (err) {
      if (!mountedRef.current) return;
      putAuto(false);
      queued.current = null;
      putBalance(before);
      await reel.current?.land('WIND', 250);
      showToast(errorMessage(err));
      resync();
    } finally {
      if (mountedRef.current) {
        putBusy(false);
        const then = queued.current;
        queued.current = null;
        if (then === 'cashout') cashOutRef.current();
        else if (then === 'part') partRef.current();
        else if (autoRef.current) autoTimer.current = setTimeout(() => spinRef.current(), fastRef.current ? 140 : 380);
        else refreshWallet().catch(() => {});
      }
    }
  }, [play, putAuto, putBalance, putBusy, refreshWallet, resync, showResult, showToast]);
  spinRef.current = spin;

  const cashOut = useCallback(async () => {
    const current = roundRef.current;
    if (!current) return;
    putAuto(false);
    if (busyRef.current) {
      // Taken as soon as the spin that is running has landed.
      queued.current = 'cashout';
      return;
    }
    putBusy(true);
    try {
      const cfg = configRef.current;
      const multiplier = boardMultiplier(cfg, shownRef.current);
      const res = await cashOutVortex(current.id);
      if (!mountedRef.current) return;
      flashNow(filledSections(cfg, shownRef.current), GOLD, 900);
      play('win');
      putBalance(res.balance);
      putShown(EMPTY);
      putRound(null);
      setWin({ title: 'CASH OUT', amount: res.paid, note: `x${round2(multiplier)}` });
      loadHistory();
    } catch (err) {
      if (mountedRef.current) {
        showToast(errorMessage(err));
        resync();
      }
    } finally {
      if (mountedRef.current) {
        putBusy(false);
        refreshWallet().catch(() => {});
      }
    }
  }, [flashNow, loadHistory, play, putAuto, putBalance, putBusy, putRound, putShown, refreshWallet, resync, showToast]);
  cashOutRef.current = cashOut;

  const takePart = useCallback(async () => {
    const current = roundRef.current;
    if (!current) return;
    if (partMultiplier(configRef.current, shownRef.current) <= 0) return showToast('Part payout needs two sections on a ring');
    putAuto(false);
    if (busyRef.current) {
      queued.current = 'part';
      return;
    }
    putBusy(true);
    try {
      const cfg = configRef.current;
      const was = shownRef.current;
      const res = await partPayoutVortex(current.id);
      if (!mountedRef.current) return;
      const taken = cfg.rings
        .filter((ring) => was[FILL_KEY[ring.element]] >= 2)
        .map((ring) => ({ element: ring.element, index: Math.min(was[FILL_KEY[ring.element]], ring.ladder.length) - 1 }));
      flashNow(taken, GOLD, 900);
      floatNow(`+${money(res.paid)}`);
      play('win');
      putBalance(res.balance);
      const live = res.round.status === 'PENDING';
      putShown(live ? fillOf(res.round) : EMPTY);
      putRound(live ? res.round : null);
    } catch (err) {
      if (mountedRef.current) {
        showToast(errorMessage(err));
        resync();
      }
    } finally {
      if (mountedRef.current) {
        putBusy(false);
        refreshWallet().catch(() => {});
      }
    }
  }, [flashNow, floatNow, play, putAuto, putBalance, putBusy, putRound, putShown, refreshWallet, resync, showToast]);
  partRef.current = takePart;

  const toggleAuto = () => {
    if (autoRef.current) return putAuto(false);
    putAuto(true);
    if (!busyRef.current) spin();
  };

  const stepStake = (dir: 1 | -1) => {
    if (round || busy) return showToast('Bet can be changed when the board is clear');
    const up = STAKE_STEPS.find((s) => s > stake);
    const down = [...STAKE_STEPS].reverse().find((s) => s < stake);
    const next = dir === 1 ? up ?? stake : down ?? stake;
    setStake(Math.max(config.minStake, Math.min(config.maxStake, next)));
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    AsyncStorage.setItem(SOUND_KEY, next ? 'on' : 'off').catch(() => {});
  };

  const toggleFast = () => {
    const next = !fast;
    setFast(next);
    showToast(next ? 'Fast spins on' : 'Fast spins off');
    AsyncStorage.setItem(FAST_KEY, next ? 'on' : 'off').catch(() => {});
  };

  // ---- sizes ----
  const short = H < 720;
  const topH = 46;
  const infoH = 40;
  const spinSize = Math.max(88, Math.min(118, W * 0.27));
  const sideSize = spinSize * 0.66;
  const controlsH = spinSize + (short ? 92 : 104);
  const footH = 22;
  const minLogoH = short ? 40 : 56;
  const avail = H - insets.top - insets.bottom - topH - infoH - minLogoH - controlsH - footH - 10;
  const S = Math.max(210, Math.min(W - 18, avail, 520));
  // On a tall screen the logo takes some of the room the board leaves.
  const logoH = minLogoH + Math.max(0, Math.min(36, (avail - S) * 0.4));
  const wellSize = WELL * 2 * S;

  const bet = round ? Number(round.stake) : stake;
  const payout = round2(bet * boardMultiplier(config, shown));
  const part = round2(bet * partMultiplier(config, shown));
  const canCash = !!round && payout > 0;
  const canPart = !!round && part > 0;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#262933', '#191B22', '#101116']} style={StyleSheet.absoluteFill} />
      <VortexBackdrop width={W} height={H} />

      {/* Top bar */}
      <LinearGradient colors={['#3B1119', '#22090E']} style={{ paddingTop: insets.top }}>
        <View style={[styles.topBar, { height: topH }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialCommunityIcons name="chevron-left" size={30} color="#F0B93D" />
            <Text style={styles.brand}>NOVAPLAY</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Deposit')} style={styles.deposit} accessibilityRole="button" accessibilityLabel="Deposit">
            <MaterialCommunityIcons name="wallet-plus" size={18} color={GOLD} />
            <Text style={styles.depositText}>Deposit</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {/* Balance and switches */}
      <View style={[styles.info, { height: infoH }]}>
        <View style={styles.balance}>
          <MaterialCommunityIcons name="wallet-outline" size={20} color="#FFFFFF" />
          <Text style={styles.balanceText} numberOfLines={1} testID="vortex-balance">
            {money(balance)}
          </Text>
        </View>
        <View style={styles.switches}>
          <Pressable onPress={() => setSheet('rules')} hitSlop={8} accessibilityRole="button" accessibilityLabel="How to play">
            <MaterialCommunityIcons name="help-circle-outline" size={25} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={toggleFast} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fast spins">
            <MaterialCommunityIcons name={fast ? 'lightning-bolt' : 'lightning-bolt-outline'} size={25} color={fast ? GOLD : '#FFFFFF'} />
          </Pressable>
          <Pressable onPress={toggleSound} hitSlop={8} accessibilityRole="button" accessibilityLabel="Sound">
            <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={25} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => {
              loadHistory();
              setSheet('history');
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="My bets"
          >
            <MaterialCommunityIcons name="history" size={25} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={{ height: logoH, alignItems: 'center', justifyContent: 'center' }}>
        <VortexLogo height={logoH} />
      </View>

      {/* The board */}
      <View style={styles.boardArea}>
        <Animated.View style={{ width: S, height: S, transform: [{ translateX: shake }] }}>
          <View pointerEvents="none" style={[styles.boardShadow, { width: S, height: S, borderRadius: S / 2 }]} />
          <BoardBase size={S} rings={config.rings} />
          <BoardRings size={S} rings={config.rings} fill={shown} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: flashOpacity }]}>
            {flash && <BoardFlash size={S} rings={config.rings} sections={flash.sections} color={flash.color} />}
          </Animated.View>

          <View style={[styles.well, { left: S / 2 - wellSize / 2, top: S / 2 - wellSize / 2, width: wellSize, height: wellSize }]}>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: glowOpacity }]}>
              <WellGlow size={S} color={glow} />
            </Animated.View>
            <Animated.View style={{ transform: [{ scale: pop }] }}>
              <Reel ref={reel} size={S} />
            </Animated.View>
          </View>

          {floater && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.floater,
                {
                  top: S * 0.3,
                  opacity: floatAnim.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                  transform: [{ translateY: floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -S * 0.2] }) }],
                },
              ]}
            >
              <Text style={[styles.floaterText, { fontSize: S * 0.085 }]}>{floater}</Text>
            </Animated.View>
          )}
          {bonus && <BonusCard bonus={bonus} fast={fast} onDone={() => bonusDone.current?.()} />}
          {win && !bonus && <WinCard win={win} onClose={() => setWin(null)} />}
        </Animated.View>
      </View>

      {/* Controls */}
      <View style={[styles.controls, { height: controlsH }]}>
        {toast && (
          <View style={styles.toastWrap} pointerEvents="none">
            <View style={styles.toast}>
              <MaterialCommunityIcons name="information" size={16} color="#FFFFFF" />
              <Text style={styles.toastText}>{toast}</Text>
            </View>
            <View style={styles.toastTip} />
          </View>
        )}
        <Pressable onPress={() => setSheet('rules')} style={styles.betLabelRow} hitSlop={6}>
          <Text style={styles.betLabel}>Bet Amount</Text>
          <MaterialCommunityIcons name="information" size={14} color="#7C8296" />
        </Pressable>
        <View style={styles.betRow}>
          <Pressable onPress={() => stepStake(-1)} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Lower bet">
            <LinearGradient colors={['#30333F', '#1A1C23']} style={styles.stepFace}>
              <MaterialCommunityIcons name="minus" size={22} color={round ? '#555A69' : '#C9CEDB'} />
            </LinearGradient>
          </Pressable>
          <Text style={styles.betValue} numberOfLines={1} adjustsFontSizeToFit testID="vortex-bet">
            ₹{bet.toLocaleString('en-IN')}
          </Text>
          <Pressable onPress={() => stepStake(1)} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Raise bet">
            <LinearGradient colors={['#30333F', '#1A1C23']} style={styles.stepFace}>
              <MaterialCommunityIcons name="plus" size={22} color={round ? '#555A69' : '#C9CEDB'} />
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.actionRow}>
          <View style={styles.sideCol}>
            <Pressable onPress={cashOut} disabled={!canCash} style={({ pressed }) => [pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Cash out">
              <LinearGradient
                colors={canCash ? ['#FFE9A8', '#E3A92E', '#8F5A0C'] : ['#30333F', '#1A1C23']}
                style={[styles.sideBtn, { width: sideSize, height: sideSize, borderRadius: sideSize / 2 }]}
              >
                <LinearGradient
                  colors={canCash ? ['#3A2F12', '#1C1608'] : ['#262933', '#17191F']}
                  style={[styles.sideFace, { borderRadius: sideSize / 2 }]}
                >
                  <Text style={[styles.cashText, { fontSize: sideSize * 0.2, lineHeight: sideSize * 0.23 }, canCash && styles.cashTextOn]}>{'CASH\nOUT'}</Text>
                </LinearGradient>
              </LinearGradient>
            </Pressable>
            <Text style={styles.sideLabel}>Payout</Text>
            <Text style={[styles.sideValue, canCash && { color: GOLD }]} numberOfLines={1} adjustsFontSizeToFit testID="vortex-payout">
              {money(payout)}
            </Text>
          </View>

          <Pressable onPress={spin} disabled={busy || auto} style={({ pressed }) => [pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Spin" testID="vortex-spin">
            <LinearGradient colors={['#3A3D4A', '#14151A']} style={{ width: spinSize, height: spinSize, borderRadius: spinSize / 2, padding: spinSize * 0.055 }}>
              <LinearGradient colors={['#B46BFF', '#7A1FF2', '#4A0DB5']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.spinFace, { borderRadius: spinSize / 2 }]}>
                <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
                  <SpinGlyph size={spinSize * 0.74} />
                </Animated.View>
              </LinearGradient>
            </LinearGradient>
          </Pressable>

          <View style={styles.sideCol}>
            <Pressable onPress={toggleAuto} style={({ pressed }) => [pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Auto spin" accessibilityState={{ selected: auto }}>
              <LinearGradient
                colors={auto ? ['#D9BEFF', '#8A3CFF', '#4A0DB5'] : ['#30333F', '#1A1C23']}
                style={[styles.sideBtn, { width: sideSize, height: sideSize, borderRadius: sideSize / 2 }]}
              >
                <LinearGradient colors={auto ? ['#3B1A75', '#1D0B40'] : ['#262933', '#17191F']} style={[styles.sideFace, { borderRadius: sideSize / 2 }]}>
                  <MaterialCommunityIcons name={auto ? 'stop' : 'autorenew'} size={sideSize * 0.4} color={auto ? '#FFFFFF' : '#6E7486'} />
                  <Text style={[styles.autoText, auto && { color: '#FFFFFF' }]}>{auto ? 'STOP' : 'AUTO'}</Text>
                </LinearGradient>
              </LinearGradient>
            </Pressable>
            <Text style={styles.sideLabel}>Part Payout</Text>
            <Pressable onPress={takePart} disabled={!canPart} hitSlop={6} accessibilityRole="button" accessibilityLabel="Part payout">
              <View style={[styles.partPill, canPart && styles.partPillOn]}>
                <Text style={[styles.sideValue, canPart && { color: '#1B1405' }]} numberOfLines={1} adjustsFontSizeToFit testID="vortex-part">
                  {canPart ? money(part) : '-'}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={[styles.foot, { height: footH, marginBottom: insets.bottom }]}>
        <Text style={styles.footText}>NovaPlay · Vortex{last ? ` · ${SYMBOL_NAME[last]}` : ''}</Text>
        <Clock />
      </View>

      {splash && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.splash, { opacity: splashFade }]}>
          <Image source={require('../../assets/novaplay-badge.webp')} style={{ width: Math.min(132, W * 0.32), height: Math.min(132, W * 0.32) }} />
          <Text style={styles.splashBrand}>NOVAPLAY GAMES</Text>
          <View style={styles.splashBadgeWrap}>
            <View style={styles.splashBadgeShadow} />
            <View style={styles.splashBadge}>
              <VortexLogo height={34} />
              <Text style={styles.splashBadgeText}>Official Game</Text>
              <MaterialCommunityIcons name="shield-check-outline" size={24} color={DANGER} />
            </View>
          </View>
          <Text style={styles.splashNote}>Provably fair · {config.rtpPercent}% RTP</Text>
          <ActivityIndicator color="#B46BFF" style={{ marginTop: 26 }} />
        </Animated.View>
      )}

      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <View style={styles.sheetRoot}>
          {/* Sibling, not parent, of the sheet so its ScrollView can scroll. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{sheet === 'history' ? 'MY BETS' : 'HOW TO PLAY'}</Text>
              <Pressable onPress={() => setSheet(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView nestedScrollEnabled contentContainerStyle={styles.sheetBody}>
              {sheet === 'rules' && <Rules config={config} seedHash={round?.serverSeedHash} />}
              {sheet === 'history' &&
                (history.length === 0 ? (
                  <Text style={styles.ruleText}>No rounds yet.</Text>
                ) : (
                  history.map((h) => {
                    const staked = Number(h.totalStake);
                    const paid = Number(h.payout);
                    const up = paid >= staked;
                    return (
                      <View key={h.id} style={styles.histRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.histTime}>{new Date(h.createdAt).toLocaleString()}</Text>
                          <Text style={styles.histInfo}>
                            {h.spins} {h.spins === 1 ? 'spin' : 'spins'} × ₹{Number(h.stake).toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.histStake}>Bet {money(staked)}</Text>
                          <Text style={[styles.histResult, { color: up ? '#7EE2A3' : paid > 0 ? GOLD : '#FF7A8A' }]}>Won {money(paid)}</Text>
                        </View>
                      </View>
                    );
                  })
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const Rules = memo(function Rules({ config, seedHash }: { config: VortexConfig; seedHash?: string }) {
  const ring = (el: VortexElement) => config.rings.find((r) => r.element === el);
  const water = ring('WATER');
  const earth = ring('EARTH');
  const fire = ring('FIRE');
  const top = (r?: { ladder: number[] }) => (r ? r.ladder[r.ladder.length - 1] : 0);
  const maxPremium = Math.max(...config.firePremiums);
  const lines = [
    'Choose your bet and tap the purple button. Every spin costs your bet and lands one symbol in the middle.',
    'Water, Earth and Fire each fill the next section of their own ring. Wind does nothing. A Skull takes one section off every ring.',
    'A ring is worth the number on its last filled section × your bet. CASH OUT pays all three rings together and clears the board.',
    'PART PAYOUT needs two or more sections on a ring. It pays the step between the last two sections of each such ring and moves it back one section — you keep playing.',
    `Land Water on a full Water ring and +${water?.bonus ?? 7}x is paid at once; Earth on a full Earth ring pays +${earth?.bonus ?? 20.5}x. The ring stays full.`,
    `Land Fire on a full Fire ring for the BONUS: x${top(fire)} plus ${config.firePremiums.map((p) => `x${p}`).join(', ')} — up to x${top(fire) + maxPremium}. The Fire ring then starts again.`,
    'The bet can be changed only when the board is clear. If you leave, your board is kept for when you come back.',
  ];
  return (
    <>
      {lines.map((line, i) => (
        <View key={i} style={styles.ruleLine}>
          <Text style={styles.ruleNum}>{i + 1}</Text>
          <Text style={styles.ruleText}>{line}</Text>
        </View>
      ))}
      <Text style={styles.sheetSection}>RINGS</Text>
      {config.rings.map((r) => (
        <View key={r.element} style={styles.ringRow}>
          <SymbolOrb symbol={r.element} size={26} />
          <Text style={styles.ringInfo}>{Array.from({ length: r.ladder.length + 1 }, (_, i) => sectionLabel(r, i).toLowerCase()).join(' · ')}</Text>
        </View>
      ))}
      <View style={styles.ringRow}>
        <SymbolOrb symbol="WIND" size={26} />
        <Text style={styles.ringInfo}>Wind — nothing changes</Text>
      </View>
      <View style={styles.ringRow}>
        <SymbolOrb symbol="SKULL" size={26} />
        <Text style={styles.ringInfo}>Skull — every ring goes back one section ({config.skullChancePercent}% of spins)</Text>
      </View>
      <Text style={styles.sheetSection}>CHANCES</Text>
      <Text style={styles.ruleText}>
        An element's chance depends on how full its ring is (empty ring first, full ring last). Every spin returns {config.rtpPercent}% of the bet on average, however you play.
      </Text>
      {config.rings.map((r) => (
        <View key={r.element} style={styles.limitRow}>
          <Text style={styles.limitKey}>{ELEMENT_LOOK[r.element].name}</Text>
          <Text style={[styles.limitVal, { flex: 1, textAlign: 'right' }]}>{r.chances.map((c) => `${c}%`).join(' · ')}</Text>
        </View>
      ))}
      <Text style={styles.sheetSection}>GAME LIMITS</Text>
      {[
        ['Minimum bet', `₹${config.minStake}`],
        ['Maximum bet', `₹${config.maxStake.toLocaleString('en-IN')}`],
        ['Maximum win per round', winLimit(config.maxPayout)],
        ['Spins in one round', `${config.maxSpins} (then it is cashed out for you)`],
        ['Return to player', `${config.rtpPercent}%`],
      ].map(([k, v]) => (
        <View key={k} style={styles.limitRow}>
          <Text style={styles.limitKey}>{k}</Text>
          <Text style={styles.limitVal}>{v}</Text>
        </View>
      ))}
      <Text style={styles.sheetSection}>PROVABLY FAIR</Text>
      <Text style={styles.ruleText}>
        Every spin comes from your server seed (shown as a hash before you play), your client seed and the round's number, so each result can be checked after you change your seed.
      </Text>
      {!!seedHash && <Text style={styles.hash}>Seed hash: {seedHash}</Text>}
    </>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101116' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4, paddingRight: 10, borderBottomWidth: 1, borderBottomColor: '#5A1A24' },
  back: { flexDirection: 'row', alignItems: 'center' },
  brand: { fontFamily: fonts.italic, fontSize: 16, color: '#D9DCE5', letterSpacing: 1 },
  deposit: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(240,185,61,0.45)' },
  depositText: { fontFamily: fonts.bold, fontSize: 13, color: GOLD },

  info: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  balanceText: { fontFamily: fonts.extra, fontSize: 17, color: '#FFFFFF' },
  switches: { flexDirection: 'row', alignItems: 'center', gap: 16 },

  boardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  boardShadow: { position: 'absolute', backgroundColor: '#0B0C10', shadowColor: '#000000', shadowOpacity: 0.7, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  well: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  floater: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  floaterText: { fontFamily: fonts.black, color: GOLD, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },

  controls: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  toastWrap: { position: 'absolute', top: -40, alignSelf: 'center', alignItems: 'center', zIndex: 5 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 32, borderRadius: 10, backgroundColor: '#4A4F60' },
  toastTip: { width: 10, height: 10, marginTop: -5, backgroundColor: '#4A4F60', transform: [{ rotate: '45deg' }] },
  toastText: { fontFamily: fonts.semi, fontSize: 13, color: '#FFFFFF' },
  betLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  betLabel: { fontFamily: fonts.bold, fontSize: 13, color: '#7C8296' },
  betRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2, marginBottom: 4 },
  stepBtn: { width: 42, height: 42, borderRadius: 21 },
  stepFace: { flex: 1, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#0D0E12' },
  betValue: { width: 112, textAlign: 'center', fontFamily: fonts.extra, fontSize: 19, color: '#FFFFFF' },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 14 },
  sideCol: { width: 104, alignItems: 'center', paddingTop: 12 },
  sideBtn: { padding: 2 },
  sideFace: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cashText: { fontFamily: fonts.black, color: '#565B6B', textAlign: 'center', letterSpacing: 0.5 },
  cashTextOn: { color: GOLD },
  autoText: { fontFamily: fonts.bold, fontSize: 9, color: '#6E7486', letterSpacing: 1, marginTop: -2 },
  sideLabel: { fontFamily: fonts.semi, fontSize: 12, color: '#7C8296', marginTop: 6 },
  sideValue: { fontFamily: fonts.extra, fontSize: 14, color: '#FFFFFF', maxWidth: 100 },
  partPill: { minWidth: 44, height: 22, paddingHorizontal: 8, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  partPillOn: { backgroundColor: GOLD },
  spinFace: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(217,190,255,0.55)' },
  pressed: { transform: [{ scale: 0.95 }] },

  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  footText: { fontFamily: fonts.semi, fontSize: 11, color: '#6E7486' },

  splash: { backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  splashBrand: { fontFamily: fonts.italic, fontSize: 22, color: '#FFFFFF', letterSpacing: 2, marginTop: 10 },
  splashBadgeWrap: { marginTop: 26 },
  splashBadgeShadow: { position: 'absolute', left: 6, top: 6, right: -6, bottom: -6, borderRadius: 6, backgroundColor: DANGER },
  splashBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 54, borderRadius: 6, borderWidth: 2, borderColor: DANGER, backgroundColor: '#0B0B0E' },
  splashBadgeText: { fontFamily: fonts.extra, fontSize: 17, color: '#FFFFFF' },
  splashNote: { fontFamily: fonts.semi, fontSize: 13, color: '#C9CEDB', marginTop: 18 },
  winWrap: { position: 'absolute', left: 0, right: 0, top: '32%', alignItems: 'center' },
  winEdge: { borderRadius: 18, padding: 2 },
  winCard: { alignItems: 'center', paddingHorizontal: 30, paddingVertical: 14, borderRadius: 16 },
  winTitle: { fontFamily: fonts.black, fontSize: 14, color: GOLD, letterSpacing: 2 },
  winAmount: { fontFamily: fonts.black, fontSize: 28, color: '#FFFFFF', marginTop: 2 },
  winNote: { fontFamily: fonts.bold, fontSize: 13, color: '#B9BFCE', marginTop: 1 },
  bonusWrap: { position: 'absolute', left: 0, right: 0, top: '24%', alignItems: 'center' },
  bonusCard: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16 },
  bonusHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bonusTitle: { fontFamily: fonts.black, fontSize: 18, color: '#FFCB73', letterSpacing: 2 },
  bonusRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  bonusChip: { paddingHorizontal: 8, height: 34, minWidth: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1.5, borderColor: 'rgba(255,203,115,0.25)' },
  bonusChipOn: { backgroundColor: 'rgba(255,106,31,0.5)', borderColor: '#FFCB73' },
  bonusChipPicked: { backgroundColor: '#FFCB73' },
  bonusChipText: { fontFamily: fonts.extra, fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  bonusChipTextOn: { color: '#FFFFFF' },
  bonusSum: { fontFamily: fonts.bold, fontSize: 14, color: '#FFE2B0', marginTop: 12 },

  sheetRoot: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { maxHeight: '84%', borderRadius: 20, backgroundColor: '#1D2029', borderWidth: 1, borderColor: 'rgba(138,60,255,0.45)', overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  sheetTitle: { fontFamily: fonts.black, fontSize: 15, color: GOLD, letterSpacing: 2 },
  sheetBody: { padding: 16, gap: 10 },
  sheetSection: { fontFamily: fonts.black, fontSize: 12, color: '#C9A2FF', letterSpacing: 1.5, marginTop: 8 },
  ruleLine: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  ruleNum: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, color: '#1D2029', backgroundColor: GOLD, fontFamily: fonts.black, fontSize: 12, overflow: 'hidden' },
  ruleText: { flex: 1, color: '#D5D9E4', fontSize: 13, lineHeight: 19 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ringInfo: { flex: 1, color: '#D5D9E4', fontSize: 13, lineHeight: 18 },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  limitKey: { color: '#9EA4B5', fontSize: 13 },
  limitVal: { color: '#FFFFFF', fontSize: 13, fontFamily: fonts.bold },
  hash: { color: '#7C8296', fontSize: 10 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  histTime: { color: '#9EA4B5', fontSize: 11 },
  histInfo: { color: '#D5D9E4', fontSize: 12, marginTop: 2 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontFamily: fonts.bold },
  histResult: { fontSize: 13, fontFamily: fonts.extra },
});
