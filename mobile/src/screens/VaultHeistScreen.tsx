import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { VaultConfig, VaultRound, VaultTry, cashOutVault, crackVaultLock, fetchVaultConfig, fetchVaultCurrent, fetchVaultHistory, startVaultRound } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const STEEL = '#8A96A8';
const CYAN = '#3CE0FF';
const GOLD = '#FFD66B';
const GREEN = '#3DFF8A';
const RED = '#FF3B4E';
const INK = '#06090F';
const TEXT = '#E4ECF4';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const LOCKS = 5;
const DIGITS = 10;
const TOAST_MS = 1800;
const MODES = [2, 4, 6];
const MODE_NAME: Record<number, string> = { 2: 'EASY', 4: 'MEDIUM', 6: 'HARD' };
const MODE_COLOR: Record<number, string> = { 2: GREEN, 4: CYAN, 6: RED };
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
/** Angles (degrees, clockwise from the top) of the five locking bolts. */
const BOLT_ANGLES = [36, 108, 180, 252, 324];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function ladderFor(alarms: number): number[] {
  return Array.from({ length: LOCKS + 1 }, (_, n) => (n ? floor2(0.88 / Math.pow((DIGITS - alarms) / DIGITS, n)) : 1));
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- art ----------

/** The vault wall: riveted steel panels, the door frame and the alarm lamps. */
const Wall = memo(function Wall({ S, H, cx, cy, R, tile }: { S: number; H: number; cx: number; cy: number; R: number; tile?: boolean }) {
  const u = `vw${useId().replace(/:/g, '')}`;
  const panel = S / 3;
  return (
    <Svg width={S} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`${u}wall`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1E2633" />
          <Stop offset="1" stopColor="#0A0E16" />
        </SvgLinearGradient>
        <RadialGradient id={`${u}glow`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={CYAN} stopOpacity={0.22} />
          <Stop offset="1" stopColor={CYAN} stopOpacity={0} />
        </RadialGradient>
        <SvgLinearGradient id={`${u}frame`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5A6678" />
          <Stop offset="0.5" stopColor="#2A323E" />
          <Stop offset="1" stopColor="#141A22" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={S} height={H} fill={`url(#${u}wall)`} />
      {/* panels and rivets */}
      {Array.from({ length: 3 }, (_, i) =>
        Array.from({ length: Math.ceil(H / panel) }, (_, j) => (
          <G key={`${i}-${j}`}>
            <Rect x={i * panel + 2} y={j * panel + 2} width={panel - 4} height={panel - 4} rx={4} fill="none" stroke="#2A3442" strokeWidth={1.5} />
            {!tile &&
              [
                [6, 6],
                [panel - 6, 6],
                [6, panel - 6],
                [panel - 6, panel - 6],
              ].map(([x, y], k) => <Circle key={k} cx={i * panel + x} cy={j * panel + y} r={1.8} fill="#3A4656" />)}
          </G>
        )),
      )}
      <Circle cx={cx} cy={cy} r={R * 1.45} fill={`url(#${u}glow)`} />
      {/* door frame */}
      <Circle cx={cx} cy={cy} r={R * 1.12} fill={`url(#${u}frame)`} stroke="#0A0E16" strokeWidth={3} />
      <Circle cx={cx} cy={cy} r={R * 1.03} fill="#05070B" />
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * Math.PI * 2) / 16;
        return <Circle key={i} cx={cx + Math.cos(a) * R * 1.075} cy={cy + Math.sin(a) * R * 1.075} r={2.4} fill="#8A96A8" />;
      })}
    </Svg>
  );
});

/** The inside of the vault: gold bars and cash. */
const Treasure = memo(function Treasure({ R }: { R: number }) {
  const u = `vt${useId().replace(/:/g, '')}`;
  const d = R * 2;
  const bar = (x: number, y: number, k: number) => <Polygon key={k} points={`${x},${y} ${x + 26},${y} ${x + 22},${y - 9} ${x + 4},${y - 9}`} fill={`url(#${u}g)`} stroke="#7A5200" strokeWidth={0.8} />;
  return (
    <Svg width={d} height={d} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${u}bg`} cx="0.5" cy="0.45" r="0.6">
          <Stop offset="0" stopColor="#3A2E10" />
          <Stop offset="1" stopColor="#0A0804" />
        </RadialGradient>
        <SvgLinearGradient id={`${u}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF4C0" />
          <Stop offset="0.5" stopColor={GOLD} />
          <Stop offset="1" stopColor="#A06A00" />
        </SvgLinearGradient>
      </Defs>
      <Circle cx={50} cy={50} r={50} fill={`url(#${u}bg)`} />
      <Rect x={14} y={58} width={72} height={3} fill="#5A4A2A" />
      <Rect x={18} y={80} width={64} height={3} fill="#5A4A2A" />
      {[18, 44].map((x, i) => bar(x, 58, i))}
      {[31].map((x, i) => bar(x, 49, i + 5))}
      {[20, 46].map((x, i) => (
        <G key={`c${i}`}>
          <Rect x={x + 2} y={68} width={30} height={12} rx={1.5} fill="#2E8A4A" stroke="#14501E" strokeWidth={0.8} />
          <Rect x={x + 2} y={64} width={30} height={5} rx={1.5} fill="#3AA85A" stroke="#14501E" strokeWidth={0.8} />
          <Rect x={x + 14} y={64} width={6} height={16} fill="#F4E8C0" />
        </G>
      ))}
      <SvgText x={50} y={36} fontSize={11} fontWeight="900" fill={GOLD} textAnchor="middle">
        ₹ ₹ ₹
      </SvgText>
    </Svg>
  );
});

/** The vault door: brushed steel rings, rivets and the hinge. */
const Door = memo(function Door({ R }: { R: number }) {
  const u = `vd${useId().replace(/:/g, '')}`;
  const d = R * 2;
  return (
    <Svg width={d} height={d} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${u}m`} cx="0.38" cy="0.32" r="0.8">
          <Stop offset="0" stopColor="#E4ECF4" />
          <Stop offset="0.45" stopColor="#9AA6B8" />
          <Stop offset="1" stopColor="#3A4454" />
        </RadialGradient>
        <SvgLinearGradient id={`${u}r`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#C8D2E0" />
          <Stop offset="1" stopColor="#4A5466" />
        </SvgLinearGradient>
      </Defs>
      <Circle cx={50} cy={50} r={49} fill={`url(#${u}m)`} stroke="#1E2633" strokeWidth={1.2} />
      <Circle cx={50} cy={50} r={43} fill="none" stroke={`url(#${u}r)`} strokeWidth={2.5} />
      <Circle cx={50} cy={50} r={36} fill="none" stroke="#5A6678" strokeWidth={0.8} />
      {Array.from({ length: 60 }, (_, i) => (
        <Circle key={i} cx={50} cy={50} r={10 + i * 0.65} fill="none" stroke="#FFFFFF" strokeOpacity={i % 2 ? 0.03 : 0.06} strokeWidth={0.3} />
      ))}
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI * 2) / 24;
        return <Circle key={`r${i}`} cx={50 + Math.cos(a) * 46} cy={50 + Math.sin(a) * 46} r={1.1} fill="#3A4454" stroke="#C8D2E0" strokeWidth={0.3} />;
      })}
      {/* hinge */}
      <Rect x={0.5} y={30} width={5} height={14} rx={1.5} fill="#2A323E" />
      <Rect x={0.5} y={56} width={5} height={14} rx={1.5} fill="#2A323E" />
    </Svg>
  );
});

/** The combination dial face (rotates); the digits sit on the outer ring. */
const DialFace = memo(function DialFace({ r, highlight }: { r: number; highlight: Record<number, string> }) {
  const u = `vf${useId().replace(/:/g, '')}`;
  const d = r * 2;
  return (
    <Svg width={d} height={d} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${u}f`} cx="0.4" cy="0.35" r="0.75">
          <Stop offset="0" stopColor="#3A4250" />
          <Stop offset="1" stopColor="#0A0E14" />
        </RadialGradient>
        <RadialGradient id={`${u}k`} cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.5" stopColor="#B8C4D4" />
          <Stop offset="1" stopColor="#4A5466" />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={49} fill="#C8D2E0" />
      <Circle cx={50} cy={50} r={46.5} fill={`url(#${u}f)`} />
      {Array.from({ length: 50 }, (_, i) => {
        const a = (i * Math.PI * 2) / 50 - Math.PI / 2;
        const long = i % 5 === 0;
        return (
          <Line
            key={i}
            x1={50 + Math.cos(a) * 45}
            y1={50 + Math.sin(a) * 45}
            x2={50 + Math.cos(a) * (long ? 40 : 42.5)}
            y2={50 + Math.sin(a) * (long ? 40 : 42.5)}
            stroke="#C8D2E0"
            strokeWidth={long ? 1.2 : 0.6}
          />
        );
      })}
      {Array.from({ length: DIGITS }, (_, dgt) => {
        const a = (dgt * Math.PI * 2) / DIGITS - Math.PI / 2;
        const x = 50 + Math.cos(a) * 32;
        const y = 50 + Math.sin(a) * 32;
        const h = highlight[dgt];
        return (
          <G key={dgt}>
            {h && <Circle cx={x} cy={y} r={7} fill={h} opacity={0.35} stroke={h} strokeWidth={1} />}
            <SvgText x={x} y={y + 3.6} fontSize={10.5} fontWeight="900" fill={h ?? '#E4ECF4'} textAnchor="middle" rotation={(dgt * 360) / DIGITS} origin={`${x}, ${y}`}>
              {dgt}
            </SvgText>
          </G>
        );
      })}
      <Circle cx={50} cy={50} r={20} fill={`url(#${u}k)`} stroke="#2A323E" strokeWidth={1} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI * 2) / 12;
        return <Line key={`g${i}`} x1={50 + Math.cos(a) * 15} y1={50 + Math.sin(a) * 15} x2={50 + Math.cos(a) * 19.5} y2={50 + Math.sin(a) * 19.5} stroke="#5A6678" strokeWidth={1.2} />;
      })}
      <Circle cx={50} cy={50} r={9} fill="#2A323E" stroke="#C8D2E0" strokeWidth={1} />
    </Svg>
  );
});

/** Home tile art: the vault door and its dial. */
export function VaultHeistTileArt({ size }: { size: number }) {
  const R = size * 0.34;
  const cx = size / 2;
  const cy = size * 0.42;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Wall S={size} H={size} cx={cx} cy={cy} R={R} tile />
      <View style={{ position: 'absolute', left: cx - R, top: cy - R }}>
        <Door R={R} />
      </View>
      <View style={{ position: 'absolute', left: cx - R * 0.48, top: cy - R * 0.48, transform: [{ rotate: '-36deg' }] }}>
        <DialFace r={R * 0.48} highlight={{}} />
      </View>
    </View>
  );
}

// ---------- screen ----------

type Phase = 'idle' | 'aim' | 'dialling' | 'over';
type Banner = { title: string; sub?: string; tone: 'win' | 'lose' | 'click' };

export default function VaultHeistScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<VaultConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [alarms, setAlarms] = useState(4);
  const [round, setRound] = useState<VaultRound | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [lastTry, setLastTry] = useState<VaultTry | null>(null);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'info' | 'history' | null>(null);
  const [history, setHistory] = useState<VaultRound[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialDeg = useRef(0);
  const pulse = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const dial = useRef(new Animated.Value(0)).current;
  const alarmFlash = useRef(new Animated.Value(0)).current;
  const click = useRef(new Animated.Value(0)).current;
  const open = useRef(new Animated.Value(0)).current;
  const bolts = useRef(BOLT_ANGLES.map(() => new Animated.Value(0))).current;

  const S = Math.min(W - 12, 470);
  const H = Math.round(S * 1.02);
  const R = S * 0.36;
  const cx = S / 2;
  const cy = H * 0.55;
  const dialR = R * 0.56;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const activeAlarms = round?.alarms ?? alarms;
  const ladder = useMemo(() => config?.modes.find((m) => m.alarms === activeAlarms)?.multipliers ?? ladderFor(activeAlarms), [config, activeAlarms]);
  const stake = round ? Number(round.stake) : bet;
  const cracked = round?.cracked ?? 0;
  const pending = round?.status === 'PENDING';
  const lost = round?.status === 'LOST';
  const won = round?.status === 'WON';
  const cashValue = pending && cracked > 0 ? Math.min(floor2(stake * Number(round!.multiplier)), maxPayout) : 0;

  // Digits lit on the dial: the last lock's alarm digits in red, the digit that cracked it in green.
  const highlight = useMemo(() => {
    const h: Record<number, string> = {};
    if (lastTry) {
      lastTry.alarmDigits.forEach((d) => (h[d] = RED));
      if (lastTry.ok) h[lastTry.digit] = GREEN;
    }
    return h;
  }, [lastTry]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchVaultConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    // Pick up a heist left unfinished.
    fetchVaultCurrent()
      .then((r) => {
        if (!mountedRef.current || !r) return;
        setRound(r);
        setAlarms(r.alarms);
        setBet(Number(r.stake));
        bolts.forEach((b, i) => b.setValue(i < r.cracked ? 1 : 0));
        setPhase('aim');
      })
      .catch(() => {});
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      loop.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse, bolts]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const flashBanner = useCallback(
    async (b: Banner, hold = 1000) => {
      setBanner(b);
      bannerAnim.setValue(0);
      await run(Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }));
      await wait(hold);
      await run(Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim],
  );

  const settle = useCallback(
    (payout: number) => {
      setShownBalance((b) => round2(b + payout));
      setSessionNet((n) => round2(n + payout));
      refreshWallet();
      if (panel === 'history')
        fetchVaultHistory(30)
          .then((h) => mountedRef.current && setHistory(h))
          .catch(() => {});
    },
    [refreshWallet, panel],
  );

  const swingOpen = useCallback(() => run(Animated.timing(open, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })), [open]);

  const start = useCallback(async () => {
    if (busyRef.current || !config || pending) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    try {
      const r = await startVaultRound(bet, alarms);
      if (!mountedRef.current) return;
      setLastTry(null);
      setRound(r);
      setShownBalance((b) => round2(b - bet));
      setSessionNet((n) => round2(n - bet));
      // Close the door and throw every bolt.
      await run(
        Animated.parallel([
          Animated.timing(open, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
          ...bolts.map((b) => Animated.timing(b, { toValue: 0, duration: 300, useNativeDriver: true })),
          Animated.timing(alarmFlash, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
      );
      if (mountedRef.current) setPhase('aim');
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      busyRef.current = false;
    }
  }, [config, pending, bet, shownBalance, alarms, open, bolts, alarmFlash, showToast]);

  const tryDigit = useCallback(
    async (digit: number) => {
      if (busyRef.current || phase !== 'aim' || !round || round.status !== 'PENDING') return;
      busyRef.current = true;
      setPhase('dialling');
      setLastTry(null);
      // Spin the dial to the digit: a full turn and more, alternating direction lock by lock, like a real combination.
      const dir = round.cracked % 2 ? 1 : -1;
      const base = -digit * (360 / DIGITS);
      let target = base;
      while (dir * (target - dialDeg.current) < 360) target += dir * 360;
      while (dir * (target - dialDeg.current) > 720) target -= dir * 360;
      dialDeg.current = target;
      try {
        const [res] = await Promise.all([crackVaultLock(round.id, digit), run(Animated.timing(dial, { toValue: target, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }))]);
        if (!mountedRef.current) return;
        const { attempt } = res;
        const r = res.round;
        setLastTry(attempt);
        setRound(r);
        if (!attempt.ok) {
          setPhase('over');
          await run(
            Animated.sequence(
              [0, 1, 2].flatMap(() => [
                Animated.timing(alarmFlash, { toValue: 1, duration: 140, useNativeDriver: true }),
                Animated.timing(alarmFlash, { toValue: 0.15, duration: 160, useNativeDriver: true }),
              ]),
            ),
          );
          await flashBanner({ title: 'ALARM!', sub: `${digit} was an alarm digit`, tone: 'lose' }, 1100);
          Animated.timing(alarmFlash, { toValue: 0, duration: 600, useNativeDriver: true }).start();
          if (mountedRef.current) refreshWallet();
        } else {
          const lock = r.cracked - 1;
          click.setValue(0);
          await run(
            Animated.parallel([
              Animated.timing(bolts[lock], { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
              Animated.sequence([Animated.timing(click, { toValue: 1, duration: 120, useNativeDriver: true }), Animated.timing(click, { toValue: 0, duration: 500, useNativeDriver: true })]),
            ]),
          );
          if (r.status === 'WON') {
            const payout = Number(r.payout);
            setPhase('over');
            await swingOpen();
            await flashBanner({ title: r.cracked >= LOCKS ? 'VAULT OPEN!' : 'MAX WIN!', sub: `${Number(r.multiplier).toFixed(2)}x · ${money(payout)}`, tone: 'win' }, 1500);
            if (mountedRef.current) settle(payout);
          } else {
            await flashBanner({ title: 'CLICK!', sub: `Lock ${r.cracked} of ${LOCKS} · ${Number(r.multiplier).toFixed(2)}x`, tone: 'click' }, 650);
            if (mountedRef.current) setPhase('aim');
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          // Re-sync with the server in case the try went through.
          fetchVaultCurrent()
            .then((cur) => {
              if (!mountedRef.current) return;
              setRound(cur);
              if (cur) bolts.forEach((b, i) => b.setValue(i < cur.cracked ? 1 : 0));
              setPhase(cur ? 'aim' : 'idle');
              refreshWallet();
            })
            .catch(() => setPhase('aim'));
        }
      } finally {
        busyRef.current = false;
      }
    },
    [phase, round, dial, alarmFlash, click, bolts, flashBanner, swingOpen, settle, refreshWallet, showToast],
  );

  const cashOut = useCallback(async () => {
    if (busyRef.current || phase !== 'aim' || !round || round.status !== 'PENDING' || round.cracked <= 0) return;
    busyRef.current = true;
    try {
      const r = await cashOutVault(round.id);
      if (!mountedRef.current) return;
      setRound(r);
      setPhase('over');
      const payout = Number(r.payout);
      settle(payout);
      await flashBanner({ title: 'CASHED OUT', sub: `${Number(r.multiplier).toFixed(2)}x · ${money(payout)}`, tone: 'win' }, 1200);
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      busyRef.current = false;
    }
  }, [phase, round, settle, flashBanner, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (pending || phase === 'dialling') return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchVaultHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const canTry = phase === 'aim' && pending;
  const readout = pending ? `LOCK ${Math.min(cracked + 1, LOCKS)}/${LOCKS} · ${cracked ? `${ladder[cracked].toFixed(2)}x` : 'SEALED'}` : lost ? 'ALARM TRIPPED' : won ? 'VAULT OPEN' : 'VAULT SEALED';
  const prompt =
    phase === 'dialling'
      ? ' '
      : canTry
        ? cracked === 0
          ? 'TAP A DIGIT ON THE DIAL'
          : `NEXT LOCK ${ladder[cracked + 1]?.toFixed(2)}x · OR CASH OUT`
        : lost
          ? 'ALARM — START A NEW HEIST'
          : won
            ? `YOU WON ${money(Number(round!.payout))}`
            : 'CHOOSE ALARMS · START HEIST';
  const digitR = dialR * 0.64;
  const tap = dialR * 0.36;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#101826', '#04060A']} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={TEXT} />
          <MaterialCommunityIcons name="safe-square-outline" size={18} color={CYAN} />
          <Text style={styles.title}>VAULT HEIST</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }}>
        <View style={[styles.stage, { width: S, height: H }]}>
          <Wall S={S} H={H} cx={cx} cy={cy} R={R} />

          {/* Alarm lamps */}
          {[0.08, 0.92].map((x) => (
            <View key={x} style={[styles.lamp, { left: S * x - 14, top: 10 }]}>
              <Animated.View style={[styles.lampGlow, { opacity: alarmFlash }]} />
              <MaterialCommunityIcons name="alarm-light" size={22} color={lost ? RED : '#5A2A30'} />
            </View>
          ))}

          {/* LCD readout */}
          <View style={[styles.lcd, { top: 12, width: S * 0.62 }]}>
            <Text style={styles.lcdText} numberOfLines={1} adjustsFontSizeToFit>
              {readout}
            </Text>
          </View>

          {/* Lock lights */}
          <View style={[styles.lockRow, { top: 54 }]}>
            {Array.from({ length: LOCKS }, (_, i) => {
              const done = i < cracked;
              const tripped = lost && i === cracked;
              return (
                <View key={i} style={[styles.lockLight, done && styles.lockDone, tripped && styles.lockTripped]}>
                  <MaterialCommunityIcons name={done ? 'lock-open-variant' : tripped ? 'alert' : 'lock'} size={12} color={done || tripped ? INK : '#7A8698'} />
                </View>
              );
            })}
          </View>

          {/* The vault interior, seen when the door swings open */}
          <View pointerEvents="none" style={{ position: 'absolute', left: cx - R, top: cy - R }}>
            <Treasure R={R} />
          </View>

          {/* Bolts: steel rods from the door into the frame, drawn back as each lock cracks */}
          {BOLT_ANGLES.map((a, i) => (
            <View key={a} pointerEvents="none" style={{ position: 'absolute', left: cx, top: cy, width: 0, height: 0, transform: [{ rotate: `${a - 90}deg` }] }}>
              <Animated.View
                style={[
                  styles.bolt,
                  {
                    left: R * 0.86,
                    top: -R * 0.06,
                    width: R * 0.26,
                    height: R * 0.12,
                    borderRadius: R * 0.03,
                    transform: [{ translateX: bolts[i].interpolate({ inputRange: [0, 1], outputRange: [0, -R * 0.2] }) }],
                  },
                ]}
              >
                <LinearGradient colors={['#E4ECF4', '#8A96A8', '#3A4454']} style={StyleSheet.absoluteFill} />
              </Animated.View>
            </View>
          ))}

          {/* Door (swings open on its hinge) with the dial */}
          <Animated.View
            style={{
              position: 'absolute',
              left: cx - R,
              top: cy - R,
              width: R * 2,
              height: R * 2,
              transformOrigin: 'left center',
              transform: [{ perspective: 800 }, { rotateY: open.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-78deg'] }) }],
            }}
          >
            <Door R={R} />
            {/* Bolt status lights on the door */}
            {BOLT_ANGLES.map((a, i) => {
              const rad = ((a - 90) * Math.PI) / 180;
              return (
                <View key={`l${a}`} pointerEvents="none" style={[styles.boltLed, { left: R + Math.cos(rad) * R * 0.78 - 5, top: R + Math.sin(rad) * R * 0.78 - 5 }]}>
                  <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 5, backgroundColor: GREEN, opacity: bolts[i] }]} />
                </View>
              );
            })}
            {/* Pointer */}
            <View pointerEvents="none" style={[styles.pointer, { left: R - 7, top: R - dialR - 14 }]} />
            {/* Dial: the digits turn with it, and each one is a tap target */}
            <Animated.View
              style={{
                position: 'absolute',
                left: R - dialR,
                top: R - dialR,
                width: dialR * 2,
                height: dialR * 2,
                transform: [{ rotate: dial.interpolate({ inputRange: [-3600, 3600], outputRange: ['-3600deg', '3600deg'] }) }],
              }}
            >
              <DialFace r={dialR} highlight={highlight} />
              {Array.from({ length: DIGITS }, (_, dgt) => {
                const a = (dgt * Math.PI * 2) / DIGITS - Math.PI / 2;
                return (
                  <Pressable
                    key={dgt}
                    disabled={!canTry}
                    accessibilityLabel={`Dial ${dgt}`}
                    onPress={() => tryDigit(dgt)}
                    style={({ pressed }) => [
                      styles.digitHit,
                      { left: dialR + Math.cos(a) * digitR - tap / 2, top: dialR + Math.sin(a) * digitR - tap / 2, width: tap, height: tap, borderRadius: tap / 2 },
                      pressed && canTry && { backgroundColor: 'rgba(60,224,255,0.3)' },
                    ]}
                  />
                );
              })}
            </Animated.View>
            {/* Click ring */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.clickRing,
                {
                  left: R - dialR * 1.1,
                  top: R - dialR * 1.1,
                  width: dialR * 2.2,
                  height: dialR * 2.2,
                  borderRadius: dialR * 1.1,
                  opacity: click,
                  transform: [{ scale: click.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }) }],
                },
              ]}
            />
            {canTry && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.readyRing,
                  {
                    left: R - dialR * 1.04,
                    top: R - dialR * 1.04,
                    width: dialR * 2.08,
                    height: dialR * 2.08,
                    borderRadius: dialR * 1.04,
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.8] }),
                  },
                ]}
              />
            )}
          </Animated.View>

          {/* Alarm wash */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: RED, opacity: alarmFlash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] }) }]} />

          {phase !== 'dialling' && (
            <View pointerEvents="none" style={[styles.prompt, { top: H - 30 }]}>
              <Text style={styles.promptText}>{prompt}</Text>
            </View>
          )}
        </View>

        {/* Multiplier ladder */}
        <View style={[styles.ladder, { width: S }]}>
          {Array.from({ length: LOCKS }, (_, i) => {
            const n = i + 1;
            const reached = cracked >= n && (pending || won);
            const next = pending && cracked + 1 === n;
            return (
              <View key={n} style={[styles.rung, reached && styles.rungReached, next && styles.rungNext]}>
                <Text style={[styles.rungLabel, reached && { color: INK }]}>LOCK {n}</Text>
                <Text style={[styles.rungMult, reached && { color: INK }]} numberOfLines={1} adjustsFontSizeToFit>
                  {ladder[n]?.toFixed(2)}x
                </Text>
                <Text style={[styles.rungMoney, reached && { color: INK }]} numberOfLines={1} adjustsFontSizeToFit>
                  {money(Math.min(floor2(stake * (ladder[n] ?? 0)), maxPayout))}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Alarm digits per lock */}
        <View style={[styles.modeRow, { width: S }]}>
          {MODES.map((m) => {
            const on = activeAlarms === m;
            const locked = pending || phase === 'dialling';
            const top = (config?.modes.find((x) => x.alarms === m)?.multipliers ?? ladderFor(m))[LOCKS];
            return (
              <Pressable
                key={m}
                disabled={locked}
                onPress={() => setAlarms(m)}
                style={[styles.mode, on && { borderColor: MODE_COLOR[m], backgroundColor: 'rgba(255,255,255,0.06)' }, locked && !on && styles.dim]}
              >
                <Text style={[styles.modeName, { color: on ? MODE_COLOR[m] : '#C8D0E0' }]}>{MODE_NAME[m]}</Text>
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 3 }}>
                  {Array.from({ length: DIGITS }, (_, k) => (
                    <View key={k} style={[styles.digitDot, { backgroundColor: k < m ? MODE_COLOR[m] : '#2A3442' }]} />
                  ))}
                </View>
                <Text style={styles.modeSub}>
                  {m} alarms · up to {top.toFixed(2)}x
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Session (time played and net position, always on show) */}
        <View style={[styles.session, { width: S }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#C8D0E0" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? GREEN : sessionNet < 0 ? '#FF9AA6' : '#C8D0E0' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        {/* Controls: no autoplay */}
        <View style={[styles.controls, { width: S }]}>
          <Pressable onPress={() => setPanel('info')} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="information-outline" size={20} color={CYAN} />
            <Text style={styles.sideText}>RULES</Text>
          </Pressable>
          <View style={styles.betBox}>
            <Text style={styles.betLabel}>BET</Text>
            <View style={styles.betRow}>
              <Pressable onPress={() => stepBet(-1)} disabled={pending} style={[styles.betBtn, pending && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="minus" size={18} color={INK} />
              </Pressable>
              <Text style={styles.betValue}>{money(pending ? stake : bet)}</Text>
              <Pressable onPress={() => stepBet(1)} disabled={pending} style={[styles.betBtn, pending && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={18} color={INK} />
              </Pressable>
            </View>
          </View>
          {pending ? (
            <Pressable onPress={cashOut} disabled={cracked === 0 || phase !== 'aim'} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
              <LinearGradient colors={cracked === 0 || phase !== 'aim' ? ['#4A5466', '#1E2633'] : ['#7CFFB0', '#1AC860', '#0A7A3A']} style={styles.mainBtn}>
                <Text style={styles.mainSmall}>{cracked === 0 ? 'DIAL A' : 'CASH OUT'}</Text>
                <Text style={styles.mainBig} numberOfLines={1} adjustsFontSizeToFit>
                  {cracked === 0 ? 'DIGIT' : money(cashValue)}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable onPress={start} disabled={!config || phase === 'dialling'} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Animated.View style={[styles.mainHalo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }]} />
              <LinearGradient colors={!config ? ['#4A5466', '#1E2633'] : ['#C8F8FF', CYAN, '#0A7A9A']} style={styles.mainBtn}>
                <MaterialCommunityIcons name="safe" size={24} color={INK} />
                <Text style={styles.mainSmall}>START</Text>
              </LinearGradient>
            </Pressable>
          )}
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={CYAN} />
            <Text style={styles.sideText}>HISTORY</Text>
          </Pressable>
        </View>

        <GameInfoButton>
          RTP {config?.rtpPercent ?? 88}% at every cash-out point · bet {money(minStake)}–{money(maxStake)} · max {money(maxPayout)} per heist{'\n'}
          No autoplay · each lock's alarm digits are fixed by your provably-fair seeds before you dial
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View pointerEvents="none" style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
          <LinearGradient
            colors={banner.tone === 'lose' ? ['#5A0A14', '#200408'] : banner.tone === 'win' ? ['#FFF4C8', GOLD, '#B87800'] : ['#0A3A4A', '#04161E']}
            style={[styles.bannerInner, { borderColor: banner.tone === 'lose' ? RED : banner.tone === 'win' ? '#FFFFFF' : CYAN }]}
          >
            <MaterialCommunityIcons
              name={banner.tone === 'lose' ? 'alarm-light' : banner.tone === 'win' ? 'gold' : 'lock-open-variant'}
              size={32}
              color={banner.tone === 'lose' ? '#FFD0D4' : banner.tone === 'win' ? '#5A3A00' : GREEN}
            />
            <Text style={[styles.bannerText, banner.tone === 'win' && { color: '#3A2400' }]}>{banner.title}</Text>
            {banner.sub ? <Text style={[styles.bannerSub, banner.tone === 'win' && { color: '#5A3A00' }, banner.tone === 'lose' && { color: '#FF9AA6' }]}>{banner.sub}</Text> : null}
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
              <Text style={styles.modalTitle}>{panel === 'info' ? 'HOW TO PLAY' : 'MY HEISTS'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={TEXT} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'info' ? <Rules bet={bet} config={config} /> : <History rounds={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Rules({ bet, config }: { bet: number; config: VaultConfig | null }) {
  if (!config) return <Text style={styles.note}>Loading…</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.note}>
        The vault has {config.locks} locks. Choose how many of each dial's {config.digits} digits trip the alarm (2, 4 or 6) and your bet, then START. Tap a digit on the dial: a safe digit cracks the
        lock and your multiplier rises; an alarm digit trips the alarm and the bet is lost.
      </Text>
      <Text style={styles.note}>
        Cash out after any cracked lock. Crack all {config.locks} and the vault opens and pays out automatically. Each lock's alarm digits are drawn from your seeds before you dial, and every digit
        has the same chance. After each try the dial shows that lock's alarm digits.
      </Text>
      <Text style={styles.section}>MULTIPLIERS (at {money(bet)})</Text>
      <View style={styles.tRow}>
        <Text style={[styles.tHead, { width: 70, textAlign: 'left' }]}>ALARMS</Text>
        {Array.from({ length: config.locks }, (_, i) => (
          <Text key={i} style={styles.tHead}>
            {i + 1}
          </Text>
        ))}
      </View>
      {config.modes.map((m) => (
        <View key={m.alarms} style={styles.tRow}>
          <Text style={[styles.tName, { color: MODE_COLOR[m.alarms] }]}>
            {MODE_NAME[m.alarms]}
            {'\n'}
            <Text style={styles.tSub}>{m.alarms} of 10</Text>
          </Text>
          {m.multipliers.slice(1).map((x, i) => (
            <Text key={i} style={styles.tCell}>
              {x.toFixed(2)}x
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.section}>GAME INFO</Text>
      <Text style={styles.note}>
        Return to player {config.rtpPercent}% whenever you cash out. A heist pays at most {money(config.maxPayout)}; reaching it settles the round. No autoplay. Every lock is decided by your
        provably-fair seeds (server seed hash, client seed and nonce in each round).
      </Text>
    </View>
  );
}

function History({ rounds }: { rounds: VaultRound[] | null }) {
  if (rounds === null) return <Text style={styles.note}>Loading…</Text>;
  if (rounds.length === 0) return <Text style={styles.note}>No heists yet.</Text>;
  return (
    <View>
      {rounds.map((r) => {
        const payout = Number(r.payout);
        const d = new Date(r.createdAt);
        return (
          <View key={r.id} style={styles.histRow}>
            <Text style={styles.histTime}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.histStake}>{money(Number(r.stake))}</Text>
            <Text style={[styles.histMode, { color: MODE_COLOR[r.alarms] }]}>{MODE_NAME[r.alarms]}</Text>
            <View style={{ flexDirection: 'row', gap: 3, flex: 1 }}>
              {(r.tries ?? []).map((t, i) => (
                <Text key={i} style={[styles.histDigit, { color: t.ok ? GREEN : RED, borderColor: t.ok ? GREEN : RED }]}>
                  {t.digit}
                </Text>
              ))}
            </View>
            <Text style={[styles.histWin, { color: payout > 0 ? GREEN : '#8A8FA8' }]}>{payout > 0 ? `+${money(payout)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#04060A' },
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
    backgroundColor: 'rgba(60,224,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(60,224,255,0.45)',
  },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  stage: { borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: '#2A3442', marginTop: 4 },
  lamp: { position: 'absolute', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  lampGlow: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: RED },
  lcd: {
    position: 'absolute',
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#04140C',
    borderWidth: 2,
    borderColor: '#1E2633',
    alignItems: 'center',
  },
  lcdText: { color: GREEN, fontSize: 15, fontWeight: '900', fontFamily: MONO, letterSpacing: 1.5, textShadowColor: GREEN, textShadowRadius: 8 },
  lockRow: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', gap: 8 },
  lockLight: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#3A4656', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0E16' },
  lockDone: { backgroundColor: GREEN, borderColor: GREEN },
  lockTripped: { backgroundColor: RED, borderColor: RED },
  bolt: { position: 'absolute', overflow: 'hidden', borderWidth: 1, borderColor: '#1E2633' },
  boltLed: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: '#000000', backgroundColor: '#5A1A20', overflow: 'hidden' },
  pointer: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: RED,
  },
  digitHit: { position: 'absolute' },
  clickRing: { position: 'absolute', borderWidth: 4, borderColor: GREEN },
  readyRing: { position: 'absolute', borderWidth: 2, borderColor: CYAN },
  prompt: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)' },
  promptText: { color: TEXT, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  ladder: { flexDirection: 'row', gap: 5, marginTop: 10 },
  rung: { flex: 1, alignItems: 'center', paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, borderColor: '#1E2633', backgroundColor: 'rgba(14,20,30,0.9)' },
  rungReached: { backgroundColor: GREEN, borderColor: GREEN },
  rungNext: { borderColor: CYAN },
  rungLabel: { color: '#7A8698', fontSize: 8.5, fontWeight: '900', letterSpacing: 1 },
  rungMult: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  rungMoney: { color: GOLD, fontSize: 10, fontWeight: '800' },
  modeRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  mode: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, borderColor: '#1E2633' },
  modeName: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  modeSub: { color: '#7A8698', fontSize: 9, fontWeight: '700', marginTop: 2 },
  digitDot: { width: 5, height: 5, borderRadius: 2.5 },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  sessionText: { color: '#C8D0E0', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#5A6070', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideText: { color: CYAN, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: { color: '#A8B0C0', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  betRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(14,20,30,0.9)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#2A3442',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  betBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: TEXT, alignItems: 'center', justifyContent: 'center' },
  betValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'center' },
  dim: { opacity: 0.4 },
  mainWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  mainHalo: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: CYAN },
  mainBtn: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', paddingHorizontal: 6 },
  mainSmall: { color: INK, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  mainBig: { color: INK, fontSize: 15, fontWeight: '900' },
  banner: { position: 'absolute', top: '47%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 16, borderWidth: 3, alignItems: 'center' },
  bannerText: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: 2 },
  bannerSub: { color: CYAN, fontSize: 13, fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#0E1420', borderRadius: 16, borderWidth: 2, borderColor: '#2A3442', padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: TEXT, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  note: { color: '#C8D0E0', fontSize: 12, lineHeight: 17 },
  section: { color: CYAN, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  tHead: { flex: 1, color: '#7A8698', fontSize: 10, fontWeight: '900', textAlign: 'right' },
  tName: { width: 70, fontSize: 11, fontWeight: '900' },
  tSub: { color: '#7A8698', fontSize: 9, fontWeight: '700' },
  tCell: { flex: 1, color: '#FFFFFF', fontSize: 11, fontWeight: '800', textAlign: 'right' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 6 },
  histTime: { color: '#98A0B0', fontSize: 11, width: 64 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 58 },
  histMode: { fontSize: 9.5, fontWeight: '900', width: 50 },
  histDigit: { fontSize: 11, fontWeight: '900', borderWidth: 1, borderRadius: 4, paddingHorizontal: 3, fontFamily: MONO },
  histWin: { fontSize: 12, fontWeight: '900' },
});
