import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/AppText';
import TapPressable from '../components/TapPressable';
import { LcdGeometry, LcdRow, lcdInt, lcdNumber } from '../components/LcdDigits';
import { ApiClientError } from '../api/client';
import { RedButtonConfig, RedButtonPlay, fetchRedButtonConfig, fetchRedButtonHistory, playRedButton } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import { NO_LIMIT, winLimit } from '../utils/limits';
import { GameCue, GamePlayers, createGamePlayers, noteResult, setSoundEnabled, useSoundEnabled } from '../sound/engine';
import { withPopupSound, withTapSound } from '../sound/ui';

/*
 * Red Button: a retro control panel. Four toggle switches pick the multiplier (x2, x10, x100, x250), the green keys set the bet,
 * the big red button pushes, and the LCD shows the result. The red rocker switch is AUTO: it pushes the button for you every
 * 10 seconds. Everything is drawn from pictures made by scripts/art (assets/redbutton) with the digits drawn live as SVG.
 */

const A = {
  bg: require('../../assets/redbutton/panel-bg.webp'),
  lcd: require('../../assets/redbutton/lcd.webp'),
  rockerOff: require('../../assets/redbutton/rocker-off.webp'),
  rockerOn: require('../../assets/redbutton/rocker-on.webp'),
  keysFrame: require('../../assets/redbutton/keys-frame.webp'),
  key: require('../../assets/redbutton/key.webp'),
  bezel: require('../../assets/redbutton/bigbutton.webp'),
  domeUp: require('../../assets/redbutton/dome-up.webp'),
  domeDown: require('../../assets/redbutton/dome-down.webp'),
  nut: require('../../assets/redbutton/toggle-nut.webp'),
  lever: require('../../assets/redbutton/toggle-lever.webp'),
};

// ---------- layout: everything is placed in the units of the reference panel (914 wide) and scaled to the phone ----------
const REF_W = 914;
const REF_H = 1470;
const LCD_AT = { x: 66, y: 88 }; // the 780 x 455 LCD picture
const GLASS = { x: 42, y: 36, w: 696, h: 369 }; // the glass inside that picture
const ROCKER_AT = { x: 146, y: 532 }; // 240 x 140
const KEYS_AT = { x: 528, y: 532 }; // 238 x 140
const KEY_X = [596, 700];
const KEY_Y = 598;
const LED_AT = { x: 456, y: 597 };
const BTN_AT = { x: 456, y: 938 }; // centre of the 500 x 500 bezel
const TOGGLE_X = [190, 368, 546, 724];
const TOGGLE_FRAME = { x: 108, y: 1212, w: 698, h: 146 };
const LEVER_REST = 8; // degrees: the levers hang a little to the left (a turn to the right is a swing to the left)

// ---------- the LCD (units of the glass) ----------
const G_MULT: LcdGeometry = { w: 27, h: 42, t: 5.6, gap: 4, skew: 0.17 };
const G_RESULT: LcdGeometry = { w: 54, h: 100, t: 11.5, gap: 8, skew: 0.17 };
const G_SMALL: LcdGeometry = { w: 23, h: 49, t: 5.2, gap: 4, skew: 0.17 };
const LCD_INK = '#1b2a1f';
const RESULT_CELLS = 9; // 7 + 2
const BALANCE_CELLS = 11; // 9 + 2
const BET_CELLS = 6; // 4 + 2

const GOLD = '#F5B942';
const WIN = '#35F5A0';
const LOSE = '#FF5A6A';
const INK = '#E9E9EC';

const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const DEFAULT_BET = 20;
const FALLBACK_SWITCHES = [2, 10, 100, 250];
const AUTO_SECONDS = 10;
const MIN_ROLL_MS = 950;
const LOCK_STEP_MS = 60;
const TOAST_MS = 2200;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}
function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const randomDigits = (n: number) => Array.from({ length: n }, () => String(Math.floor(Math.random() * 10))).join('');

type Led = 'idle' | 'busy' | 'win' | 'lose';
const LED_COLOR: Record<Led, string> = { idle: '#8FA8C4', busy: '#FFB020', win: '#35F58A', lose: '#FF4D5A' };

/** The status lamp between the rocker and the keys. */
function StatusLamp({ size, mode }: { size: number; mode: Led }) {
  const c = LED_COLOR[mode];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" pointerEvents="none">
      <Defs>
        <RadialGradient id="lampLens" cx="45%" cy="38%" r="65%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
          <Stop offset="0.35" stopColor={c} />
          <Stop offset="1" stopColor={c} stopOpacity={0.55} />
        </RadialGradient>
        <RadialGradient id="lampGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0.35" stopColor={c} stopOpacity={mode === 'idle' ? 0.12 : 0.65} />
          <Stop offset="1" stopColor={c} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={50} fill="url(#lampGlow)" />
      <Circle cx={50} cy={50} r={33} fill="#161617" stroke="#6A6A6E" strokeWidth={3.5} />
      <Circle cx={50} cy={50} r={28.5} fill="none" stroke="#000" strokeOpacity={0.7} strokeWidth={2} />
      <Circle cx={50} cy={50} r={20} fill="url(#lampLens)" />
      <Circle cx={43} cy={42} r={6} fill="#FFFFFF" fillOpacity={0.55} />
    </Svg>
  );
}

/** A toggle's lamp: dull amber when off; when on, a bright lens (opacity 0..1 via `lit`) and a glow. */
function ToggleLamp({ size, lit }: { size: number; lit: Animated.Value }) {
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="tlOff" cx="45%" cy="38%" r="65%">
            <Stop offset="0" stopColor="#E08A4C" />
            <Stop offset="0.5" stopColor="#A5471C" />
            <Stop offset="1" stopColor="#5B2210" />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={50} r={25} fill="#0E0E0F" stroke="#454548" strokeWidth={3} />
        <Circle cx={50} cy={50} r={19} fill="url(#tlOff)" />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: lit }]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="tlOn" cx="45%" cy="38%" r="65%">
              <Stop offset="0" stopColor="#FFFBD0" />
              <Stop offset="0.45" stopColor="#FFC93A" />
              <Stop offset="1" stopColor="#E8801A" />
            </RadialGradient>
            <RadialGradient id="tlGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0.2" stopColor="#FFB82E" stopOpacity={0.85} />
              <Stop offset="1" stopColor="#FFB82E" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill="url(#tlGlow)" />
          <Circle cx={50} cy={50} r={19} fill="url(#tlOn)" />
          <Circle cx={44} cy={43} r={5} fill="#FFFFFF" fillOpacity={0.8} />
        </Svg>
      </Animated.View>
    </View>
  );
}

function Triangle({ up, size }: { up: boolean; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" pointerEvents="none">
      <Path d={up ? 'M20 8 L33 31 L7 31 Z' : 'M20 32 L33 9 L7 9 Z'} fill="#FFFFFF" stroke="#0A5A44" strokeOpacity={0.5} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

// ---------- the screen ----------

type Display = { kind: 'dash' } | { kind: 'chars'; chars: string };

export default function RedButtonScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();
  const soundOn = useSoundEnabled();

  const [config, setConfig] = useState<RedButtonConfig | null>(null);
  const [sel, setSel] = useState(0);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [count, setCount] = useState(AUTO_SECONDS);
  const [display, setDisplay] = useState<Display>({ kind: 'dash' });
  const [lcdBlink, setLcdBlink] = useState(true);
  const [led, setLed] = useState<Led>('idle');
  const [shownBalance, setShownBalance] = useState(coins);
  const [menu, setMenu] = useState<'rules' | 'history' | null>(null);
  const [history, setHistory] = useState<RedButtonPlay[] | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'win' | 'lose' | 'info' } | null>(null);
  const [lastWin, setLastWin] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const autoRef = useRef(false);
  autoRef.current = auto;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const playersRef = useRef<GamePlayers | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const doPlayRef = useRef<() => void>(() => {});

  const press = useRef(new Animated.Value(0)).current; // the big button: 0 up, 1 pressed
  const flash = useRef(new Animated.Value(0)).current; // the panel lights up on a win
  const lit = useRef([0, 1, 2, 3].map((i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const wobble = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  const rtp = config?.rtpPercent ?? 90;
  const minStake = config?.minStake ?? 1;
  const maxPayout = config?.maxPayout ?? NO_LIMIT;
  const switches = config?.switches ?? FALLBACK_SWITCHES.map((multiplier) => ({ multiplier, chancePercent: round2((rtp / multiplier)), maxStake: 100000 }));
  const mult = switches[sel]?.multiplier ?? 2;
  const maxBet = Math.min(config?.maxStake ?? 100000, switches[sel]?.maxStake ?? 100000);
  const levels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxBet), [minStake, maxBet]);

  const stateRef = useRef({ bet, mult });
  stateRef.current = { bet, mult };

  const play = useCallback((name: GameCue) => {
    const p = playersRef.current?.[name];
    if (!p) return;
    try {
      p.play();
    } catch {
      // A missed sound effect is harmless.
    }
  }, []);

  const showToast = useCallback((text: string, tone: 'win' | 'lose' | 'info' = 'info', ms = TOAST_MS) => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchRedButtonConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    try {
      playersRef.current = createGamePlayers('redbutton');
    } catch {
      playersRef.current = null;
    }
    return () => {
      mountedRef.current = false;
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (rollTimer.current) clearInterval(rollTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  // A bet the chosen switch does not allow comes down to the highest it does.
  useEffect(() => {
    if (levels.length && bet > levels[levels.length - 1]) setBet(levels[levels.length - 1]);
    else if (levels.length && bet < levels[0]) setBet(levels[0]);
  }, [levels, bet]);

  // ---------- the controls ----------
  const clearResult = () => setDisplay((d) => (d.kind === 'dash' ? d : { kind: 'dash' }));

  const chooseSwitch = (i: number) => {
    if (busyRef.current || i === sel) return;
    play('step');
    setSel(i);
    clearResult();
    lit.forEach((v, j) => Animated.timing(v, { toValue: j === i ? 1 : 0, duration: 140, useNativeDriver: true }).start());
    Animated.sequence([
      Animated.timing(wobble[i], { toValue: 1, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(wobble[i], { toValue: 0, friction: 4, tension: 220, useNativeDriver: true }),
    ]).start();
  };

  const stepBet = useCallback(
    (dir: -1 | 1) => {
      if (busyRef.current) return;
      setBet((b) => {
        const i = levels.indexOf(b);
        const next = i < 0 ? levels.find((x) => (dir > 0 ? x > b : x < b)) ?? b : levels[Math.min(levels.length - 1, Math.max(0, i + dir))];
        return next ?? b;
      });
      play('step');
      setDisplay((d) => (d.kind === 'dash' ? d : { kind: 'dash' }));
    },
    [levels, play]
  );

  // Holding a green key keeps stepping.
  const repeat = useRef<{ wait: ReturnType<typeof setTimeout> | null; every: ReturnType<typeof setInterval> | null }>({ wait: null, every: null });
  const stopRepeat = () => {
    if (repeat.current.wait) clearTimeout(repeat.current.wait);
    if (repeat.current.every) clearInterval(repeat.current.every);
    repeat.current = { wait: null, every: null };
  };
  // A tap steps once; holding the key (after 0.4 s) keeps stepping.
  const startRepeat = (dir: -1 | 1) => {
    stopRepeat();
    stepBet(dir);
    repeat.current.every = setInterval(() => stepBet(dir), 110);
  };
  useEffect(() => stopRepeat, []);

  const toggleAuto = () => {
    if (auto) {
      setAuto(false);
    } else {
      setCount(AUTO_SECONDS);
      setAuto(true);
    }
    play('step');
  };

  // ---------- the rolling digits ----------
  const startRolling = () => {
    if (rollTimer.current) clearInterval(rollTimer.current);
    rollTimer.current = setInterval(() => {
      if (mountedRef.current) setDisplay({ kind: 'chars', chars: ' ' + randomDigits(RESULT_CELLS - 1) });
    }, 55);
  };
  const stopRolling = () => {
    if (rollTimer.current) clearInterval(rollTimer.current);
    rollTimer.current = null;
  };
  /** Lets the digits settle from the left, one after the other, on `final`. */
  const lockDigits = (final: string) =>
    new Promise<void>((resolve) => {
      stopRolling();
      let locked = 0;
      const id = setInterval(() => {
        locked++;
        if (!mountedRef.current) {
          clearInterval(id);
          resolve();
          return;
        }
        const chars = final.slice(0, locked) + randomDigits(RESULT_CELLS).slice(locked);
        setDisplay({ kind: 'chars', chars: locked >= RESULT_CELLS ? final : chars });
        if (locked >= RESULT_CELLS) {
          clearInterval(id);
          resolve();
        }
      }, LOCK_STEP_MS);
    });

  // ---------- one push ----------
  const doPlay = useCallback(async () => {
    if (busyRef.current) return;
    const { bet: stake, mult: m } = stateRef.current;
    if (stake > balanceRef.current) {
      showToast('Not enough balance', 'lose');
      setAuto(false);
      return;
    }
    if (floor2(stake * m) > maxPayout) {
      showToast(`The most a push can win is ${winLimit(maxPayout)}. Lower the bet or pick a smaller switch.`, 'lose');
      setAuto(false);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setLastWin(null);
    setLed('busy');
    setShownBalance((b) => round2(b - stake));
    play('start');
    startRolling();
    const started = Date.now();

    let res: RedButtonPlay;
    try {
      res = await playRedButton(stake, m);
    } catch (err) {
      stopRolling();
      setDisplay({ kind: 'dash' });
      setShownBalance((v) => round2(v + stake));
      setAuto(false);
      setLed('idle');
      showToast(errorMessage(err), 'lose');
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;

    const payout = Number(res.payout);
    await sleep(Math.max(0, MIN_ROLL_MS - (Date.now() - started)));
    if (!mountedRef.current) return;
    play('land');
    await lockDigits(lcdNumber(payout, 7, 2));
    if (!mountedRef.current) return;

    if (res.won) {
      noteResult('redbutton', m);
      play('big');
      setLed('win');
      setLastWin(payout);
      setShownBalance((v) => round2(v + payout));
      showToast(`${m >= 100 ? 'BIG WIN' : 'YOU WIN'}  ₹${payout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'win', m >= 100 ? 3600 : 2800);
      flash.setValue(0);
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]).start();
      // The result blinks.
      for (let i = 0; i < 4 && mountedRef.current; i++) {
        setLcdBlink(false);
        await sleep(130);
        setLcdBlink(true);
        await sleep(150);
      }
    } else {
      play('lose');
      setLed('lose');
    }
    refreshWallet().catch(() => {});
    setHistory(null);
    busyRef.current = false;
    setBusy(false);
    await sleep(res.won ? 500 : 700);
    if (mountedRef.current) setLed('idle');
    if (autoRef.current && mountedRef.current) setCount(AUTO_SECONDS);
  }, [flash, maxPayout, play, refreshWallet, showToast]);
  doPlayRef.current = doPlay;

  // AUTO: the clock counts down and the panel pushes the button.
  useEffect(() => {
    if (!auto || busy) return;
    const id = setTimeout(() => {
      if (count <= 1) {
        setCount(0);
        doPlayRef.current();
      } else {
        setCount((c) => c - 1);
        if (count <= 4) play('tick');
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [auto, busy, count, play]);

  const pushDown = () => {
    Animated.timing(press, { toValue: 1, duration: 60, useNativeDriver: true }).start();
  };
  const pushUp = () => {
    Animated.timing(press, { toValue: 0, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };

  const openMenu = (tab: 'rules' | 'history') => {
    setMenu(tab);
    if (tab === 'history') {
      setHistory(null);
      fetchRedButtonHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const headerH = insets.top + 52;
  const availH = H - headerH - insets.bottom - 4;
  const k = Math.min(Math.min(W, 520) / REF_W, availH / REF_H);
  const extra = Math.max(0, availH / k - REF_H); // spare height (in panel units) goes between the sections
  const dy = [extra * 0.12, extra * 0.3, extra * 0.58, extra * 0.82];
  const panelW = REF_W * k;
  const panelH = (REF_H + extra) * k;
  const u = (n: number) => n * k;
  const box = (x: number, y: number, w: number, h: number, section = 0) => ({ position: 'absolute' as const, left: u(x), top: u(y + dy[section]), width: u(w), height: u(h) });

  const shownResult = display.kind === 'dash' ? 'none' : `${display.chars.slice(0, 7).trim() || '0'}.${display.chars.slice(7)}`;
  const label = `Result ${shownResult}. Balance ${shownBalance.toFixed(2)}. Bet ${bet.toFixed(2)}. Multiplier ${mult}.`;
  const resultChars = display.kind === 'dash' ? '-'.repeat(RESULT_CELLS) : display.chars;

  return (
    <View style={styles.root}>
      <Image source={A.bg} style={styles.fillImg} resizeMode="cover" fadeDuration={0} />

      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={withTapSound(() => navigation.goBack())} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={GOLD} />
        </Pressable>
        <Text style={styles.title}>RED BUTTON</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={withTapSound(() => (navigation as any).navigate('Deposit'))} style={styles.deposit} accessibilityLabel="Deposit">
          <MaterialCommunityIcons name="wallet-plus" size={18} color={GOLD} />
          <Text style={styles.depositText}>Deposit</Text>
        </Pressable>
      </View>

      <View style={{ position: 'absolute', top: headerH, left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
        <View style={{ width: panelW, height: panelH }}>
          {/* the LCD */}
          <View style={box(LCD_AT.x, LCD_AT.y, 780, 455, 0)} accessible accessibilityLabel={label} testID="rb-lcd">
            <Image source={A.lcd} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
            <View style={{ position: 'absolute', left: u(GLASS.x), top: u(GLASS.y), width: u(GLASS.w), height: u(GLASS.h) }} pointerEvents="none">
              <Svg width={u(GLASS.w)} height={u(GLASS.h)} viewBox={`0 0 ${GLASS.w} ${GLASS.h}`}>
                {/* the multiplier of the switch that is on */}
                <SvgText x={70} y={84} fontSize={31} fontWeight="900" fontStyle="italic" fill={LCD_INK} fillOpacity={0.92}>
                  X
                </SvgText>
                <LcdRow x={108} y={43} geo={G_MULT} chars={lcdInt(mult, 3)} lit={LCD_INK} />
                <SvgText x={352} y={84} fontSize={31} fontWeight="900" fontStyle="italic" textAnchor="middle" fill={LCD_INK} fillOpacity={0.92}>
                  RESULT
                </SvgText>
                {/* the AUTO clock */}
                <Circle cx={527} cy={68} r={12} fill="none" stroke={LCD_INK} strokeOpacity={auto ? 0.9 : 0.16} strokeWidth={3} />
                <Path d="M527 60 L527 68 L533 72" fill="none" stroke={LCD_INK} strokeOpacity={auto ? 0.9 : 0.16} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                <LcdRow x={553} y={43} geo={G_MULT} chars={lcdInt(count, 3)} on={auto} lit={LCD_INK} />
                {/* the result */}
                <LcdRow x={50} y={122} geo={G_RESULT} chars={resultChars} dotAfter={6} dotLit on={lcdBlink} lit={LCD_INK} />
                <SvgText x={62} y={283} fontSize={29} fontWeight="900" fontStyle="italic" fill={LCD_INK} fillOpacity={0.92}>
                  BALANCE
                </SvgText>
                <SvgText x={640} y={283} fontSize={29} fontWeight="900" fontStyle="italic" textAnchor="end" fill={LCD_INK} fillOpacity={0.92}>
                  BET
                </SvgText>
                <LcdRow x={64} y={290} geo={G_SMALL} chars={lcdNumber(shownBalance, 9, 2)} dotAfter={8} dotLit lit={LCD_INK} />
                <LcdRow x={460} y={290} geo={G_SMALL} chars={lcdNumber(bet, 4, 2)} dotAfter={3} dotLit lit={LCD_INK} />
              </Svg>
            </View>
          </View>

          {/* the menu button */}
          <Pressable
            onPress={withTapSound(() => openMenu('rules'))}
            style={[box(7, 14, 92, 92, 0), styles.menuBtn]}
            hitSlop={8}
            accessibilityLabel="Menu"
          >
            <Svg width={u(52)} height={u(52)} viewBox="0 0 52 52">
              {[14, 26, 38].map((y) => (
                <Rect key={y} x={4} y={y - 3} width={44} height={6.5} rx={3.2} fill="#FFFFFF" />
              ))}
            </Svg>
          </Pressable>

          {/* AUTO: the red rocker */}
          <View style={box(ROCKER_AT.x, ROCKER_AT.y, 240, 140, 1)}>
            <Image source={auto ? A.rockerOn : A.rockerOff} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
            <Pressable onPress={toggleAuto} style={StyleSheet.absoluteFill} accessibilityLabel="Auto" accessibilityState={{ checked: auto }} />
          </View>

          {/* the status lamp and the wire down to the button */}
          <View style={box(LED_AT.x - 46, LED_AT.y - 46, 92, 92, 1)} pointerEvents="none">
            <StatusLamp size={u(92)} mode={led} />
          </View>
          <View style={[box(LED_AT.x - 1.5, LED_AT.y + 34, 3, 96, 1), { backgroundColor: '#58585C' }]} pointerEvents="none" />

          {/* the green keys */}
          <View style={box(KEYS_AT.x, KEYS_AT.y, 238, 140, 1)} pointerEvents="none">
            <Image source={A.keysFrame} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
          </View>
          {[-1, 1].map((dir, i) => (
            <Pressable
              key={dir}
              onPress={() => stepBet(dir as -1 | 1)}
              onLongPress={() => startRepeat(dir as -1 | 1)}
              delayLongPress={400}
              onPressOut={stopRepeat}
              style={({ pressed }) => [box(KEY_X[i] - 50, KEY_Y - 48, 100, 96, 1), { transform: [{ translateY: pressed ? u(3) : 0 }, { scale: pressed ? 0.975 : 1 }] }]}
              hitSlop={4}
              accessibilityLabel={dir < 0 ? 'Lower bet' : 'Raise bet'}
            >
              <Image source={A.key} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
              <View style={{ position: 'absolute', left: u(22), top: u(18), width: u(56), height: u(52), alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
                <Triangle up={dir > 0} size={u(48)} />
              </View>
            </Pressable>
          ))}

          {/* the big red button */}
          <View style={box(BTN_AT.x - 250, BTN_AT.y - 250, 500, 500, 2)} pointerEvents="none">
            <Image source={A.bezel} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
          </View>
          <Pressable
            onPressIn={pushDown}
            onPressOut={pushUp}
            onPress={() => doPlay()}
            style={box(BTN_AT.x - 196, BTN_AT.y - 196, 392, 392, 2)}
            accessibilityRole="button"
            accessibilityLabel="Push the red button"
          >
            <Animated.View style={{ position: 'absolute', left: u(3), top: u(5), width: u(396), height: u(396), transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, u(5)] }) }] }}>
              <Animated.Image source={A.domeUp} style={[styles.fillImg, { opacity: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} resizeMode="stretch" fadeDuration={0} />
              <Animated.Image source={A.domeDown} style={[styles.fillImg, { opacity: press }]} resizeMode="stretch" fadeDuration={0} />
              {busy ? <View style={[StyleSheet.absoluteFill, { borderRadius: u(198), backgroundColor: 'rgba(0,0,0,0.18)' }]} pointerEvents="none" /> : null}
            </Animated.View>
          </Pressable>

          {/* the four toggle switches */}
          <View style={box(TOGGLE_FRAME.x, TOGGLE_FRAME.y, TOGGLE_FRAME.w, TOGGLE_FRAME.h, 3)} pointerEvents="none">
            <Svg width={u(TOGGLE_FRAME.w)} height={u(TOGGLE_FRAME.h)} viewBox={`0 0 ${TOGGLE_FRAME.w} ${TOGGLE_FRAME.h}`}>
              <Rect x={1.5} y={1.5} width={TOGGLE_FRAME.w - 3} height={TOGGLE_FRAME.h - 3} rx={50} fill="none" stroke="#000" strokeOpacity={0.6} strokeWidth={5} />
              <Rect x={1.5} y={1.5} width={TOGGLE_FRAME.w - 3} height={TOGGLE_FRAME.h - 3} rx={50} fill="none" stroke="#4E4E52" strokeWidth={2.4} />
            </Svg>
          </View>
          {TOGGLE_X.map((cx, i) => {
            const on = i === sel;
            const m = switches[i]?.multiplier ?? FALLBACK_SWITCHES[i];
            return (
              <React.Fragment key={cx}>
                <View style={box(cx - 26, TOGGLE_FRAME.y - 24, 52, 52, 3)} pointerEvents="none">
                  <ToggleLamp size={u(52)} lit={lit[i]} />
                </View>
                <View style={box(cx - 50, TOGGLE_FRAME.y + 30, 100, 100, 3)} pointerEvents="none">
                  <Image source={A.nut} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
                </View>
                <Animated.View
                  style={[
                    box(cx - 25.6, TOGGLE_FRAME.y + 81 - 160, 51.2, 320, 3),
                    { transform: [{ rotate: wobble[i].interpolate({ inputRange: [0, 1], outputRange: [`${LEVER_REST}deg`, `${LEVER_REST - 20}deg`] }) }] },
                  ]}
                  pointerEvents="none"
                >
                  <Image source={A.lever} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
                </Animated.View>
                <Text style={[box(cx + 4, TOGGLE_FRAME.y + 150, 110, 44, 3), styles.togLabel, on && styles.togLabelOn]} pointerEvents="none" numberOfLines={1}>
                  ×{m}
                </Text>
                <Pressable
                  onPress={() => chooseSwitch(i)}
                  style={box(cx - 86, TOGGLE_FRAME.y - 30, 172, 250, 3)}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch x${m}`}
                  accessibilityState={{ selected: on }}
                />
              </React.Fragment>
            );
          })}

          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFE9A8', opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }) }]} />
        </View>
      </View>

      {toast && (
        <View style={[styles.toast, { top: headerH + u((658 + dy[1] + 706 + dy[2]) / 2) - 17 }, toast.tone === 'win' ? styles.toastWin : toast.tone === 'lose' ? styles.toastLose : null]} pointerEvents="none">
          <Text style={[styles.toastText, toast.tone === 'win' && { color: WIN }, toast.tone === 'lose' && { color: '#FFC0C6' }]}>{toast.text}</Text>
        </View>
      )}

      <Modal visible={menu !== null} transparent animationType="fade" onRequestClose={() => setMenu(null)} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={styles.scrim} onPress={() => setMenu(null)}>
          <Pressable style={[styles.sheet, { maxHeight: H * 0.84, width: Math.min(W - 24, 470) }]} onPress={() => {}}>
            <View style={styles.tabs}>
              {(
                [
                  ['rules', 'HOW TO PLAY'],
                  ['history', 'MY PUSHES'],
                ] as const
              ).map(([id, text]) => (
                <TapPressable key={id} onPress={() => openMenu(id)} style={[styles.tab, menu === id && styles.tabOn]}>
                  <Text style={[styles.tabText, menu === id && styles.tabTextOn]}>{text}</Text>
                </TapPressable>
              ))}
              <View style={{ flex: 1 }} />
              <Pressable onPress={withPopupSound(() => setMenu(null))} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={20} color={GOLD} />
              </Pressable>
            </View>
            <View style={styles.soundRow}>
              <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={18} color={GOLD} />
              <Text style={styles.soundLabel}>Game sounds</Text>
              <Switch value={soundOn} onValueChange={withTapSound(setSoundEnabled)} trackColor={{ false: '#3E3E42', true: '#8A6A1E' }} thumbColor={soundOn ? GOLD : '#BDBDC2'} accessibilityLabel="Game sounds" />
            </View>
            <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: 14 }}>
              {menu === 'history' ? <History plays={history} /> : <Rules config={config} />}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Rules({ config }: { config: RedButtonConfig | null }) {
  const rtp = config?.rtpPercent ?? 90;
  const list = config?.switches ?? FALLBACK_SWITCHES.map((multiplier) => ({ multiplier, chancePercent: round2(rtp / multiplier), maxStake: 0 }));
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Flip one of the four switches (×2, ×10, ×100 or ×250), set your bet with the green keys, then push the big red button.</Text>
      <Text style={styles.ruleLine}>If the push wins, the LCD shows your win: your bet × the switch. If it does not, the LCD shows 0.00. The bigger the switch, the rarer the win.</Text>
      <Text style={styles.ruleHead}>Chance of winning</Text>
      <View style={styles.exampleBox}>
        {list.map((s) => (
          <View key={s.multiplier} style={styles.exampleRow}>
            <Text style={styles.exampleText}>×{s.multiplier} switch</Text>
            <Text style={[styles.exampleText, { color: GOLD }]}>{s.chancePercent}% chance</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleHead}>AUTO</Text>
      <Text style={styles.ruleLine}>Flip the red switch on the left to switch AUTO on: the clock on the LCD counts down {AUTO_SECONDS} seconds and the panel pushes the button for you, over and over. Flip the switch again, or run out of balance, to stop.</Text>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {rtp}% on every switch. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 100000} (the biggest switches allow less when the max win would be passed). Max win per push {winLimit(config?.maxPayout)}.
      </Text>
      <Text style={styles.ruleLine}>Every push is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ plays }: { plays: RedButtonPlay[] | null }) {
  if (plays === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (plays.length === 0) return <Text style={styles.ruleLine}>No pushes yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {plays.map((p) => {
        const payout = Number(p.payout);
        const stake = Number(p.stake);
        return (
          <View key={p.id} style={styles.histRow}>
            <View style={[styles.histChip, { borderColor: p.won ? WIN : LOSE }]}>
              <Text style={[styles.histChipText, { color: p.won ? WIN : LOSE }]}>×{p.multiplier}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.histMain}>{p.won ? 'Win' : 'No win'}</Text>
              <Text style={styles.histSub}>
                Bet ₹{stake.toFixed(2)} · {new Date(p.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: p.won ? WIN : 'rgba(233,233,236,0.5)' }]}>{p.won ? `+₹${payout.toFixed(2)}` : `-₹${stake.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // An explicit 100% size: on the website an Image keeps its own pixel size otherwise.
  fillImg: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  root: { flex: 1, backgroundColor: '#101011' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8, zIndex: 2, backgroundColor: 'rgba(8,8,9,0.82)', borderBottomWidth: 1, borderBottomColor: 'rgba(245,185,66,0.28)' },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,30,32,0.9)', borderWidth: 1, borderColor: 'rgba(245,185,66,0.45)' },
  title: { color: INK, fontWeight: '900', fontSize: 17, letterSpacing: 2.5, fontStyle: 'italic' },
  deposit: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(60,18,22,0.92)', borderWidth: 1.2, borderColor: 'rgba(245,185,66,0.6)' },
  depositText: { color: GOLD, fontWeight: '800', fontSize: 14 },
  menuBtn: { borderRadius: 999, backgroundColor: '#050505', borderWidth: 2, borderColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center' },
  togLabel: { color: '#A3A3A8', fontSize: 15, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#000', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 }, opacity: 0.8 },
  togLabelOn: { color: '#FFD27A', opacity: 1 },
  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.88)', borderWidth: 1, borderColor: 'rgba(233,233,236,0.4)', maxWidth: '88%', zIndex: 3 },
  toastWin: { borderColor: WIN, backgroundColor: 'rgba(2,34,22,0.92)' },
  toastLose: { borderColor: LOSE, backgroundColor: 'rgba(40,6,10,0.92)' },
  toastText: { color: INK, fontSize: 14, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 18, backgroundColor: '#1A1A1C', borderWidth: 1.5, borderColor: 'rgba(245,185,66,0.7)', overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(245,185,66,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(245,185,66,0.12)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(233,233,236,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  soundLabel: { flex: 1, color: INK, fontWeight: '700', fontSize: 13 },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  ruleLine: { color: 'rgba(233,233,236,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  exampleBox: { marginTop: 6, borderRadius: 12, padding: 10, backgroundColor: 'rgba(245,185,66,0.06)', borderWidth: 1, borderColor: 'rgba(245,185,66,0.2)', gap: 6 },
  exampleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  exampleText: { color: INK, fontWeight: '800', fontSize: 13 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(245,185,66,0.15)' },
  histChip: { minWidth: 62, paddingHorizontal: 6, height: 30, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  histChipText: { fontWeight: '900', fontSize: 14 },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(233,233,236,0.5)', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 14 },
});
