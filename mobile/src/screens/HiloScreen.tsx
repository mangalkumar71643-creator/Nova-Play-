import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Pattern, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { HiloAction, HiloChoice, HiloConfig, HiloRound, HiloStep, fetchActiveHilo, fetchHiloConfig, fetchHiloHistory, hiloAction, startHilo } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const CORAL = '#FF6B4A';
const MINT = '#34E3A0';
const GOLD = '#FFD66B';
const INK = '#F3F4F6';
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♣', '♦'];
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const SOUND_KEY = 'novaplay:hilo:sound';
const TOAST_MS = 1900;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

const CHOICE_LABEL: Record<HiloChoice, string> = { HIGHER: 'HIGHER', LOWER: 'LOWER', SAME: 'SAME' };

/** Button wording for a choice on this card: "or same" is part of higher/lower on 2-Q. */
function choiceTitle(card: number, choice: HiloChoice): string {
  const r = card % 13;
  if (choice === 'SAME') return 'SAME';
  if (r === 0 || r === 12) return CHOICE_LABEL[choice];
  return `${CHOICE_LABEL[choice]} OR SAME`;
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
        <SvgLinearGradient id="hlBack" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FF8A66" />
          <Stop offset="1" stopColor="#B7321B" />
        </SvgLinearGradient>
        <Pattern id="hlStripe" width={w * 0.12} height={w * 0.12} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Rect x={0} y={0} width={w * 0.05} height={w * 0.12} fill="#FFFFFF" opacity={0.12} />
        </Pattern>
      </Defs>
      <Rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={w * 0.08} fill="url(#hlBack)" stroke="#FFFFFF" strokeWidth={1.5} />
      <Rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={w * 0.05} fill="url(#hlStripe)" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={1} />
      <Circle cx={w / 2} cy={h / 2} r={w * 0.2} fill="#7A1E0F" stroke="#FFFFFF" strokeWidth={1.2} />
      <Path d={`M${w / 2 - w * 0.08} ${h / 2 - w * 0.02} L${w / 2} ${h / 2 - w * 0.11} L${w / 2 + w * 0.08} ${h / 2 - w * 0.02} Z`} fill={MINT} />
      <Path d={`M${w / 2 - w * 0.08} ${h / 2 + w * 0.02} L${w / 2} ${h / 2 + w * 0.11} L${w / 2 + w * 0.08} ${h / 2 + w * 0.02} Z`} fill="#FFD1C4" />
    </Svg>
  );
});

function Background({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="hlBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1A1F27" />
          <Stop offset="0.55" stopColor="#11151B" />
          <Stop offset="1" stopColor="#090B0F" />
        </SvgLinearGradient>
        <RadialGradient id="hlSpot" cx="50%" cy="40%" r="55%">
          <Stop offset="0" stopColor={CORAL} stopOpacity={0.2} />
          <Stop offset="1" stopColor={CORAL} stopOpacity={0} />
        </RadialGradient>
        <Pattern id="hlGrid" width={28} height={28} patternUnits="userSpaceOnUse">
          <Path d="M28 0 L0 0 0 28" fill="none" stroke="#FFFFFF" strokeOpacity={0.035} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#hlBg)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#hlGrid)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#hlSpot)" />
      {/* Giant faint up / down chevrons either side of the stage */}
      <Path d={`M${w * 0.06} ${h * 0.44} L${w * 0.14} ${h * 0.34} L${w * 0.22} ${h * 0.44}`} fill="none" stroke={MINT} strokeOpacity={0.07} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={`M${w * 0.78} ${h * 0.34} L${w * 0.86} ${h * 0.44} L${w * 0.94} ${h * 0.34}`} fill="none" stroke={CORAL} strokeOpacity={0.08} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.2} viewBox="0 0 300 60">
      <Defs>
        <SvgLinearGradient id="hlLogoL" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#D9FFF0" />
          <Stop offset="1" stopColor="#12B981" />
        </SvgLinearGradient>
        <SvgLinearGradient id="hlLogoR" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE0D6" />
          <Stop offset="1" stopColor="#E3462A" />
        </SvgLinearGradient>
      </Defs>
      <Line x1={8} y1={30} x2={50} y2={30} stroke={MINT} strokeOpacity={0.5} strokeWidth={1.5} />
      <Line x1={250} y1={30} x2={292} y2={30} stroke={CORAL} strokeOpacity={0.5} strokeWidth={1.5} />
      <SvgText x={106} y={45} fontSize={42} fontWeight="bold" fontFamily="serif" fill="url(#hlLogoL)" textAnchor="middle" letterSpacing={6}>
        HI
      </SvgText>
      <Circle cx={146} cy={32} r={4.5} fill={GOLD} />
      <SvgText x={196} y={45} fontSize={42} fontWeight="bold" fontFamily="serif" fill="url(#hlLogoR)" textAnchor="middle" letterSpacing={6}>
        LO
      </SvgText>
    </Svg>
  );
}

/** Home tile art: a card with the higher and lower arrows either side. */
export function HiloTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="hltBg" cx="50%" cy="38%" r="70%">
            <Stop offset="0" stopColor="#3A2522" />
            <Stop offset="1" stopColor="#0C0E12" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#hltBg)" />
        <Path d="M12 40 L21 28 L30 40" fill="none" stroke={MINT} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M70 30 L79 42 L88 30" fill="none" stroke={CORAL} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.34, top: size * 0.1, transform: [{ rotate: '-4deg' }] }}>
        <CardFace card={20} w={size * 0.32} />
      </View>
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub: string; tone: 'win' | 'lose' };

export default function HiloScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<HiloConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [round, setRound] = useState<HiloRound | null>(null);
  const [shownCard, setShownCard] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'history' | 'rules' | null>(null);
  const [history, setHistory] = useState<HiloRound[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stripRef = useRef<ScrollView>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const bump = useRef(new Animated.Value(1)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
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
    fetchHiloConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchActiveHilo()
      .then(({ round: open }) => {
        if (!open || !mountedRef.current) return;
        setRound(open);
        setBet(Number(open.stake));
        setShownCard(open.steps[open.steps.length - 1].card);
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
    return () => {
      mountedRef.current = false;
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

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

  /** A new card slides off the deck face down and turns over. */
  const dealCard = useCallback(
    async (card: number) => {
      flip.setValue(0);
      slide.setValue(1);
      setShownCard(card);
      play('tick');
      await run(Animated.timing(slide, { toValue: 0, duration: 230, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
      await run(Animated.timing(flip, { toValue: 1, duration: 230, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    },
    [flip, play, slide]
  );

  const doStart = useCallback(async () => {
    if (busyRef.current) return;
    if (bet > balanceRef.current) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setBanner(null);
    let r: HiloRound;
    try {
      r = await startHilo(bet);
    } catch (err) {
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;
    setShownBalance((b) => round2(b - bet));
    setRound({ ...r, options: [] });
    await dealCard(r.steps[0].card);
    if (!mountedRef.current) return;
    setRound(r);
    busyRef.current = false;
    setBusy(false);
  }, [bet, dealCard, showToast]);

  const doAction = useCallback(
    async (action: HiloAction) => {
      if (busyRef.current || !round) return;
      busyRef.current = true;
      setBusy(true);
      let r: HiloRound;
      try {
        r = await hiloAction(round.id, action);
      } catch (err) {
        showToast(errorMessage(err));
        fetchActiveHilo()
          .then(({ round: open }) => {
            if (!mountedRef.current) return;
            setRound(open);
            if (open) setShownCard(open.steps[open.steps.length - 1].card);
          })
          .catch(() => {});
        busyRef.current = false;
        setBusy(false);
        return;
      }
      if (!mountedRef.current) return;

      if (action === 'CASHOUT') {
        setRound(r);
        const payout = Number(r.payout);
        setShownBalance((b) => round2(b + payout));
        play('win');
        showBanner({ title: 'CASHED OUT', sub: `₹${payout.toFixed(2)}  ·  ${r.currentMultiplier || Number(r.multiplier)}x`, tone: 'win' });
        refreshWallet().catch(() => {});
        busyRef.current = false;
        setBusy(false);
        return;
      }

      // Keep the old buttons hidden while the new card comes in.
      setRound({ ...r, options: [], status: 'ACTIVE' });
      const last = r.steps[r.steps.length - 1];
      await dealCard(last.card);
      if (!mountedRef.current) return;
      requestAnimationFrame(() => stripRef.current?.scrollToEnd({ animated: true }));
      if (last.correct === false) {
        play('land');
        shake.setValue(0);
        Animated.timing(shake, { toValue: 1, duration: 420, easing: Easing.linear, useNativeDriver: true }).start();
        showBanner({ title: 'BUST', sub: `-₹${Number(r.stake).toFixed(2)}`, tone: 'lose' });
        refreshWallet().catch(() => {});
      } else if (last.correct === true) {
        play('win');
        glow.setValue(1);
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }).start();
        bump.setValue(1.25);
        Animated.spring(bump, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
        if (r.status === 'WON') {
          const payout = Number(r.payout);
          setShownBalance((b) => round2(b + payout));
          showBanner({ title: 'MAX WIN', sub: `₹${payout.toFixed(2)} cashed out`, tone: 'win' });
          refreshWallet().catch(() => {});
        }
      }
      setRound(r);
      busyRef.current = false;
      setBusy(false);
    },
    [bump, dealCard, glow, play, refreshWallet, round, shake, showBanner, showToast]
  );

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
      fetchHiloHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const contentW = Math.min(W - 24, 460);
  const headerH = insets.top + 50;
  const compact = H < 760;
  const cardW = Math.round(Math.min(W * 0.36, H * (compact ? 0.17 : 0.2), 170));
  const miniW = 34;
  const stripSteps: HiloStep[] = round ? (live ? round.steps.slice(0, -1) : round.steps) : [];
  const stake = round ? Number(round.stake) : bet;
  const lastStep = round?.steps[round.steps.length - 1];
  const lost = round?.status === 'LOST';
  const multiplierNow = round ? (round.status === 'WON' ? Number(round.multiplier) : round.currentMultiplier) : 0;

  return (
    <View style={styles.root}>
      <Background w={W} h={H} />

      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={CORAL} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={CORAL} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={CORAL} />
        </Pressable>
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My rounds">
          <MaterialCommunityIcons name="history" size={20} color={CORAL} />
        </Pressable>
        <Pressable onPress={() => openPanel('rules')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Rules">
          <MaterialCommunityIcons name="information-variant" size={22} color={CORAL} />
        </Pressable>
      </View>

      <View style={[styles.body, { paddingTop: headerH, paddingBottom: insets.bottom + 10, width: contentW, alignSelf: 'center' }]}>
        <View>
          <View style={{ alignItems: 'center' }} pointerEvents="none">
            <Logo width={Math.min(contentW * 0.56, 230)} />
          </View>
          {/* Cards so far this round */}
          <View style={styles.stripBox}>
            {stripSteps.length === 0 ? (
              <Text style={styles.stripEmpty}>Cards you play show here</Text>
            ) : (
              <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 8, alignItems: 'center' }} onContentSizeChange={() => stripRef.current?.scrollToEnd({ animated: false })}>
                {stripSteps.map((s, i) => (
                  <View key={i} style={{ alignItems: 'center' }}>
                    <View style={[styles.miniWrap, s.correct === true && { borderColor: MINT }, s.correct === false && { borderColor: CORAL }, s.action === 'SKIP' && { opacity: 0.55 }]}>
                      <CardFace card={s.card} w={miniW} />
                    </View>
                    <View style={[styles.stepTag, { backgroundColor: s.action === 'START' ? '#374151' : s.action === 'SKIP' ? '#4B5563' : s.correct ? MINT : CORAL }]}>
                      <MaterialCommunityIcons
                        name={s.action === 'START' ? 'flag-variant' : s.action === 'SKIP' ? 'debug-step-over' : s.action === 'HIGHER' ? 'arrow-up-bold' : s.action === 'LOWER' ? 'arrow-down-bold' : 'equal'}
                        size={10}
                        color="#0B0E13"
                      />
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>

        {/* Stage */}
        <View style={styles.stage}>
          <View style={styles.hintCol} pointerEvents="none">
            <MaterialCommunityIcons name="chevron-up" size={20} color={MINT} />
            <Text style={styles.hintText}>K</Text>
            <Text style={styles.hintSub}>HIGHEST</Text>
            <View style={styles.hintLine} />
            <Text style={styles.hintSub}>LOWEST</Text>
            <Text style={styles.hintText}>A</Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={CORAL} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <Animated.View
              style={{
                width: cardW,
                height: cardW * 1.4,
                transform: [
                  { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, cardW * 1.1] }) },
                  { translateX: shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -10, 9, -6, 3, 0] }) },
                  { rotate: slide.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '8deg'] }) },
                ],
              }}
            >
              {shownCard === null ? (
                <View style={[styles.placeholder, { width: cardW, height: cardW * 1.4, borderRadius: cardW * 0.08 }]}>
                  <MaterialCommunityIcons name="cards-outline" size={cardW * 0.3} color="rgba(255,255,255,0.25)" />
                  <Text style={styles.placeholderText}>Place a bet to draw</Text>
                </View>
              ) : (
                <>
                  <Animated.View style={[StyleSheet.absoluteFill, styles.shadow, { transform: [{ scaleX: flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] }) }] }]}>
                    <CardBack w={cardW} />
                  </Animated.View>
                  <Animated.View style={[StyleSheet.absoluteFill, styles.shadow, { transform: [{ scaleX: flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }) }] }]}>
                    <CardFace card={shownCard} w={cardW} />
                  </Animated.View>
                  <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: cardW * 0.08, borderWidth: 4, borderColor: MINT, opacity: glow }]} />
                  {lost && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: cardW * 0.08, borderWidth: 4, borderColor: CORAL, backgroundColor: 'rgba(255,60,40,0.12)' }]} />}
                </>
              )}
            </Animated.View>
            <Animated.View style={[styles.multPill, { transform: [{ scale: bump }] }, lost && { borderColor: CORAL }]}>
              <Text style={styles.multLabel}>{lost ? 'BUST' : round?.status === 'WON' ? 'CASHED OUT' : 'MULTIPLIER'}</Text>
              <Text style={[styles.multValue, lost && { color: CORAL }]}>{multiplierNow > 0 ? `${multiplierNow.toFixed(2)}x` : '—'}</Text>
            </Animated.View>
          </View>
          {/* Deck the cards come from */}
          <View style={[styles.deck, { width: cardW * 0.42 }]} pointerEvents="none">
            {[2, 1, 0].map((k) => (
              <View key={k} style={{ position: 'absolute', top: k * 3, left: k * 3 }}>
                <CardBack w={cardW * 0.42} />
              </View>
            ))}
          </View>
        </View>

        {/* Controls */}
        <View>
          {live ? (
            <>
              <View style={styles.choiceRow}>
                {(round?.options ?? []).map((o) => {
                  const up = o.choice === 'HIGHER';
                  const same = o.choice === 'SAME';
                  const colors: [string, string] = same ? ['#FFE9A8', '#D6A331'] : up ? ['#7CF5C9', '#10A56E'] : ['#FF9C84', '#D23B1F'];
                  return (
                    <Pressable key={o.choice} onPress={() => doAction(o.choice)} disabled={busy} style={({ pressed }) => [styles.choiceBtn, pressed && { transform: [{ scale: 0.97 }] }, busy && styles.dim]} accessibilityLabel={choiceTitle(lastStep?.card ?? 0, o.choice)}>
                      <LinearGradient colors={colors} style={styles.choiceInner}>
                        <View style={styles.row}>
                          <MaterialCommunityIcons name={same ? 'equal' : up ? 'arrow-up-bold' : 'arrow-down-bold'} size={20} color="#0B0E13" />
                          <Text style={styles.choiceTitle} numberOfLines={1}>
                            {choiceTitle(lastStep?.card ?? 0, o.choice)}
                          </Text>
                        </View>
                        <Text style={styles.choiceMult}>{o.multiplier.toFixed(2)}x</Text>
                        <Text style={styles.choiceChance}>
                          {o.chance.toFixed(2)}% · win ₹{Math.min(Math.floor(stake * o.multiplier * 100) / 100, config?.maxPayout ?? 10000).toFixed(2)}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.liveRow}>
                <Pressable onPress={() => doAction('SKIP')} disabled={busy || (round?.skipsLeft ?? 0) <= 0} style={[styles.skipBtn, (busy || (round?.skipsLeft ?? 0) <= 0) && styles.dim]} accessibilityLabel="Skip card">
                  <MaterialCommunityIcons name="debug-step-over" size={18} color={INK} />
                  <View>
                    <Text style={styles.skipText}>SKIP</Text>
                    <Text style={styles.skipSub}>{round?.skipsLeft ?? 0} left</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => doAction('CASHOUT')} disabled={busy || !round || round.wins === 0} style={({ pressed }) => [styles.cashBtn, (busy || !round || round.wins === 0) && styles.dim, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Cash out">
                  <LinearGradient colors={['#FFF1B0', GOLD, '#C98A10']} style={styles.cashInner}>
                    <Text style={styles.cashText}>CASH OUT</Text>
                    <Text style={styles.cashSub}>{round && round.wins > 0 ? `₹${round.cashOut.toFixed(2)}` : 'after 1 right guess'}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.betRow}>
                <View style={styles.betBox}>
                  <Pressable onPress={() => changeBet(-1)} style={[styles.betBtn, busy && styles.dim]} hitSlop={6} accessibilityLabel="Lower bet">
                    <MaterialCommunityIcons name="minus" size={20} color="#2A0E06" />
                  </Pressable>
                  <View style={styles.betValueBox}>
                    <Text style={styles.betLabel}>BET</Text>
                    <Text style={styles.betValue}>₹{bet}</Text>
                  </View>
                  <Pressable onPress={() => changeBet(1)} style={[styles.betBtn, busy && styles.dim]} hitSlop={6} accessibilityLabel="Raise bet">
                    <MaterialCommunityIcons name="plus" size={20} color="#2A0E06" />
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
                <LinearGradient colors={['#FFB39E', CORAL, '#C2331A']} style={styles.startInner}>
                  <MaterialCommunityIcons name="cards-playing-outline" size={22} color="#FFFFFF" />
                  <Text style={styles.startText}>{busy ? 'DRAWING' : round ? 'PLAY AGAIN' : 'BET'}</Text>
                </LinearGradient>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {banner && (
        <View pointerEvents="none" style={[styles.bannerWrap, { top: H * 0.42 }]}>
          <Animated.View style={{ opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <LinearGradient colors={banner.tone === 'win' ? ['#0E4E3A', '#062A20'] : ['#5B130B', '#2E0804']} style={[styles.bannerCard, { borderColor: banner.tone === 'win' ? MINT : CORAL }]}>
              <Text style={styles.bannerTitle}>{banner.title}</Text>
              <Text style={[styles.bannerSub, { color: banner.tone === 'win' ? MINT : '#FFB3A3' }]}>{banner.sub}</Text>
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
                <MaterialCommunityIcons name="close" size={20} color={CORAL} />
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

function Rules({ config }: { config: HiloConfig | null }) {
  const rtp = config?.rtpPercent ?? 90;
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Place a bet and a card is turned. Guess whether the next card will be higher or lower. Ace is the lowest card and King the highest; suits don't matter.</Text>
      <Text style={styles.ruleLine}>On 2 to Q you choose HIGHER OR SAME or LOWER OR SAME — a card of the same rank wins either way. On an Ace you choose HIGHER or SAME, on a King LOWER or SAME.</Text>
      <Text style={styles.ruleHead}>Multiplier & cash out</Text>
      <Text style={styles.ruleLine}>Each button shows its chance and the multiplier you will have if it is right. Every right guess raises the multiplier; a wrong guess ends the round and the bet is lost. After at least one right guess you can CASH OUT at any time to take bet × multiplier.</Text>
      <Text style={styles.ruleLine}>Your multiplier is {rtp / 100} × (100 ÷ chance) for each right guess, multiplied together — the house edge is taken once, however long you play.</Text>
      <Text style={styles.ruleHead}>Skip</Text>
      <Text style={styles.ruleLine}>Don't like the card? SKIP it for a new one; your multiplier stays the same. Up to {config?.maxSkips ?? 52} skips a round.</Text>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Unlimited decks. Return to player {rtp}%. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}. Max win per round ₹{config?.maxPayout ?? 10000} — reaching it cashes out automatically. An unfinished round waits for you when you come back.
      </Text>
      <Text style={styles.ruleLine}>Every card is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ rounds }: { rounds: HiloRound[] | null }) {
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
              <Text style={styles.histMain}>
                {r.status === 'WON' ? `Cashed out at ${Number(r.multiplier).toFixed(2)}x` : `Bust after ${r.wins} right guess${r.wins === 1 ? '' : 'es'}`}
              </Text>
              <View style={styles.histCards}>
                {r.steps.map((s, i) => (
                  <View key={i} style={[styles.histCard, s.correct === true && { borderColor: MINT }, s.correct === false && { borderColor: CORAL }]}>
                    <Text style={[styles.histCardText, { color: Math.floor(s.card / 13) % 2 === 1 ? '#D1142F' : '#15161C' }]}>
                      {RANKS[s.card % 13]}
                      {SUITS[Math.floor(s.card / 13)]}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.histSub}>
                ₹{stake.toFixed(2)} · {new Date(r.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > stake ? MINT : 'rgba(243,244,246,0.5)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : `-₹${stake.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#090B0F' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 2 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(24,28,36,0.9)', borderWidth: 1, borderColor: 'rgba(255,107,74,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(24,28,36,0.92)', borderWidth: 1.2, borderColor: CORAL },
  headBalanceText: { color: INK, fontWeight: '900', fontSize: 14 },
  body: { flex: 1, justifyContent: 'space-between' },
  card: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CFC8B2', overflow: 'hidden' },
  cardCorner: { position: 'absolute', alignItems: 'center' },
  courtFrame: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.2 },
  shadow: { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  stripBox: { height: 72, marginTop: 4, borderRadius: 16, backgroundColor: 'rgba(24,28,36,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', justifyContent: 'center' },
  stripEmpty: { color: 'rgba(243,244,246,0.4)', fontWeight: '700', fontSize: 12, alignSelf: 'center' },
  miniWrap: { borderRadius: 5, borderWidth: 2, borderColor: 'transparent' },
  stepTag: { marginTop: -7, width: 18, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 200 },
  hintCol: { alignItems: 'center', width: 46 },
  hintText: { color: INK, fontWeight: '900', fontSize: 18, fontFamily: 'serif' },
  hintSub: { color: 'rgba(243,244,246,0.5)', fontWeight: '900', fontSize: 8.5, letterSpacing: 1 },
  hintLine: { width: 2, height: 40, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 6 },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.03)' },
  placeholderText: { color: 'rgba(243,244,246,0.45)', fontWeight: '800', fontSize: 11 },
  multPill: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 5, borderRadius: 16, alignItems: 'center', backgroundColor: 'rgba(24,28,36,0.95)', borderWidth: 1.5, borderColor: GOLD },
  multLabel: { color: 'rgba(243,244,246,0.55)', fontWeight: '900', fontSize: 9.5, letterSpacing: 1.5 },
  multValue: { color: GOLD, fontWeight: '900', fontSize: 20 },
  deck: { height: 90, alignSelf: 'center', marginTop: -40 },
  choiceRow: { flexDirection: 'row', gap: 10 },
  choiceBtn: { flex: 1, height: 92, borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 8, elevation: 6 },
  choiceInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)', paddingHorizontal: 6 },
  choiceTitle: { color: '#0B0E13', fontWeight: '900', fontSize: 12.5, letterSpacing: 0.6 },
  choiceMult: { color: '#0B0E13', fontWeight: '900', fontSize: 24, marginTop: 1 },
  choiceChance: { color: 'rgba(11,14,19,0.75)', fontWeight: '800', fontSize: 10.5 },
  liveRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  skipBtn: { width: 104, height: 58, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(55,65,81,0.9)', borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.25)' },
  skipText: { color: INK, fontWeight: '900', fontSize: 14, letterSpacing: 1.2 },
  skipSub: { color: 'rgba(243,244,246,0.6)', fontWeight: '800', fontSize: 10 },
  cashBtn: { flex: 1, height: 58, borderRadius: 16, overflow: 'hidden' },
  cashInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 2, borderColor: '#FFF3C4' },
  cashText: { color: '#2A1600', fontWeight: '900', fontSize: 18, letterSpacing: 2 },
  cashSub: { color: 'rgba(42,22,0,0.75)', fontWeight: '900', fontSize: 11 },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  betBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(24,28,36,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,107,74,0.45)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: CORAL },
  betValueBox: { flex: 1, alignItems: 'center' },
  betLabel: { color: 'rgba(243,244,246,0.55)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.5 },
  betValue: { color: INK, fontSize: 18, fontWeight: '900' },
  chip: { width: 50, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(24,28,36,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,107,74,0.45)' },
  chipText: { color: CORAL, fontWeight: '900', fontSize: 16 },
  startBtn: { height: 62, borderRadius: 20, overflow: 'hidden', marginTop: 10, shadowColor: CORAL, shadowOpacity: 0.5, shadowRadius: 14, elevation: 8 },
  startInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  startText: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', letterSpacing: 3 },
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bannerCard: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 18, borderWidth: 2, alignItems: 'center', minWidth: 210 },
  bannerTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 26, letterSpacing: 3, fontFamily: 'serif' },
  bannerSub: { fontWeight: '900', fontSize: 17, marginTop: 2 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 18, backgroundColor: '#151A21', borderWidth: 1.5, borderColor: CORAL, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,107,74,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,107,74,0.14)', borderBottomWidth: 2, borderBottomColor: CORAL },
  tabText: { color: 'rgba(243,244,246,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: CORAL },
  ruleHead: { color: CORAL, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(243,244,246,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,107,74,0.15)' },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 5 },
  histCard: { minWidth: 26, height: 22, borderRadius: 4, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F5EE', borderWidth: 1.5, borderColor: 'transparent' },
  histCardText: { fontWeight: '900', fontSize: 10.5 },
  histSub: { color: 'rgba(243,244,246,0.5)', fontSize: 11, marginTop: 4 },
  histPay: { fontWeight: '900', fontSize: 14, marginLeft: 8 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: CORAL, maxWidth: '86%' },
  toastText: { color: INK, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
