import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Image as SvgImage,
  LinearGradient as SvgLinearGradient,
  Mask,
  Path,
  Polygon,
  RadialGradient,
  Rect as SvgRect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  DragonTigerArea,
  DragonTigerConfig,
  DragonTigerHistoryEntry,
  DragonTigerRoundView,
  PlayingCard,
  cancelDragonTigerBets,
  fetchDragonTigerConfig,
  fetchDragonTigerCurrent,
  fetchDragonTigerHistory,
  fetchDragonTigerMyRound,
  placeDragonTigerBets,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const CHIP_VALUES = [10, 20, 50, 100, 200, 500, 1000];
const CHIP_COLORS: Record<number, string> = {
  10: '#1E9E4A',
  20: '#0FA3A3',
  50: '#2563EB',
  100: '#D4A017',
  200: '#E07A1F',
  500: '#C81E3A',
  1000: '#0F766E',
};
const DEFAULT_CHIP = 10;
const FALLBACK_MULTIPLIERS: Record<DragonTigerArea, number> = { DRAGON: 1.95, TIE: 11.7, TIGER: 1.95, SUITED_TIE: 46.8 };

const WIN_CARD_MS = 3000;
const TOAST_MS = 1600;
const BANNER_MS = 1400;
const VS_MS = 2900;
const BEAD_COLS = 7;
const BEAD_ROWS = 6;
const BEAD_COLOR: Record<string, string> = { DRAGON: '#2F63D8', TIGER: '#C9283A', TIE: '#1F9A55' };
const GOLD = '#FFD66B';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function shortAmount(n: number): string {
  if (n >= 1000) return `${round2(n / 1000)}k`;
  return String(round2(n));
}

function chipColorFor(amount: number): string {
  const v = [...CHIP_VALUES].reverse().find((c) => c <= amount) ?? CHIP_VALUES[0];
  return CHIP_COLORS[v];
}

function areaWins(area: DragonTigerArea, winner: string | null, suitedTie: boolean | null): boolean {
  if (!winner) return false;
  if (area === 'SUITED_TIE') return !!suitedTie;
  return area === winner;
}

const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };

// ---------- art ----------

// The table is one painted piece of art (1852×849). Everything interactive
// is laid out in the art's own pixel coordinates and mapped onto the screen,
// so boxes, cards and chips always sit exactly on the painted spots.
const TABLE_BG = require('../../assets/dragon-tiger/table.webp');
const IMG_W = 1852;
const IMG_H = 849;

type Rect = [number, number, number, number];

// VS scene art: full colour, a black-and-white copy for the loser and a
// white silhouette that masks the winner's light sweep.
const FIGHTER_ART = {
  DRAGON: {
    color: require('../../assets/dragon-tiger/dragon-head.webp'),
    bw: require('../../assets/dragon-tiger/dragon-head-bw.webp'),
    mask: require('../../assets/dragon-tiger/dragon-head-mask.png'),
    aspect: 560 / 500,
  },
  TIGER: {
    color: require('../../assets/dragon-tiger/tiger-head.webp'),
    bw: require('../../assets/dragon-tiger/tiger-head-bw.webp'),
    mask: require('../../assets/dragon-tiger/tiger-head-mask.png'),
    aspect: 560 / 477,
  },
};
const VS_ART = require('../../assets/dragon-tiger/vs.webp');
const VS_ASPECT = 416 / 620;
// The same treatment for the heads painted on the table strip.
const TABLE_HEAD: Record<'DRAGON' | 'TIGER', { bw: number; mask: number; r: Rect }> = {
  DRAGON: { bw: require('../../assets/dragon-tiger/table-dragon-bw.webp'), mask: require('../../assets/dragon-tiger/table-dragon-mask.png'), r: [395, 0, 700, 200] },
  TIGER: { bw: require('../../assets/dragon-tiger/table-tiger-bw.webp'), mask: require('../../assets/dragon-tiger/table-tiger-mask.png'), r: [1020, 0, 1325, 200] },
};
const BOXES: { area: DragonTigerArea; title: string; mark: string; big: boolean; r: Rect }[] = [
  { area: 'DRAGON', title: 'DRAGON', mark: '龍', big: true, r: [276, 220, 669, 664] },
  { area: 'TIE', title: 'TIE', mark: '和', big: false, r: [685, 220, 1081, 447] },
  { area: 'SUITED_TIE', title: 'SUITED TIE', mark: '♠ ♥ ♣ ♦', big: false, r: [685, 461, 1085, 664] },
  { area: 'TIGER', title: 'TIGER', mark: '虎', big: true, r: [1095, 218, 1503, 664] },
];
// Painted head centres on the top strip.
const HEAD_CENTER = { DRAGON: [555, 92], TIGER: [1170, 92] } as const;

const PALETTES = {
  DRAGON: ['#06163F', '#0C2F7A', '#1A56C4', '#4E93FF', '#BFDBFF'],
  TIGER: ['#3F0704', '#86170D', '#CF3B1A', '#FF8436', '#FFDFA3'],
};
const SIDE_GLOW = { DRAGON: '#3D86FF', TIGER: '#FF5A2A' };

type HeadState = 'idle' | 'win' | 'lose';

/** Light laid over a painted head: a slow breath in the side's colour while
 * betting, a strong gold pulse when it wins, a shadow when it loses. */
function HeadGlow({ side, state, size }: { side: 'DRAGON' | 'TIGER'; state: HeadState; size: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const d = state === 'win' ? 520 : 1600;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);
  if (state === 'lose') return null;
  const color = state === 'win' ? '#FFD66B' : SIDE_GLOW[side];
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: state === 'win' ? [0.35, 0.8] : [0.08, 0.28] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }],
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`hg${side}${state}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.85} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#hg${side}${state})`} />
      </Svg>
    </Animated.View>
  );
}

/** A band of light sweeping across the glass strip every few seconds. */
function StripShine({ width, height }: { width: number; height: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(2800),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  const band = Math.max(40, height * 0.9);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -height * 0.2,
        width: band,
        height: height * 1.4,
        transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-band * 1.5, width + band * 0.5] }) }, { skewX: '-25deg' }],
      }}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const AnimatedSvgRect = Animated.createAnimatedComponent(SvgRect);

/** A bright band sweeping across the art. It is masked by a white
 * silhouette of the art, so only the art itself lights up, not its box. */
function ShineSweep({ id, mask, width, height, delay = 0, stretch = false }: { id: string; mask: number; width: number; height: number; delay?: number; stretch?: boolean }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.delay(700),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [x, delay]);
  const band = width * 0.5;
  return (
    <Svg width={width} height={height} style={styles.absFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`sb${id}`} x1="0" y1="0" x2="1" y2="0.3">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="0.5" stopColor="#FFF6D8" stopOpacity={0.8} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgLinearGradient>
        <Mask id={`sm${id}`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <SvgImage href={mask} x={0} y={0} width={width} height={height} preserveAspectRatio={stretch ? 'none' : 'xMidYMid meet'} />
        </Mask>
      </Defs>
      <G mask={`url(#sm${id})`}>
        <AnimatedSvgRect
          x={x.interpolate({ inputRange: [0, 1], outputRange: [-band, width] })}
          y={0}
          width={band}
          height={height}
          fill={`url(#sb${id})`}
        />
      </G>
    </Svg>
  );
}

type FighterState = 'win' | 'lose' | 'tie';

/** A head in the VS scene. Once the result lands (`reveal` 0 → 1) the
 * loser drains to black and white; the winner keeps its colour, gains a
 * gold aura and a light sweep. */
function Fighter({ side, height, state, reveal }: { side: 'DRAGON' | 'TIGER'; height: number; state: FighterState; reveal: Animated.Value }) {
  const art = FIGHTER_ART[side];
  const width = height * art.aspect;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const g = width * 1.2;
  const aura = (color: string, id: string, opacity: Animated.AnimatedInterpolation<number> | number) => (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: g,
        height: g,
        opacity,
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.05] }) }],
      }}
    >
      <Svg width={g} height={g}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.75} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={g / 2} cy={g / 2} r={g / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      {aura(SIDE_GLOW[side], `fa${side}`, state === 'lose' ? reveal.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }) : 0.7)}
      {state === 'win' && aura('#FFC83D', `fw${side}`, Animated.multiply(reveal, pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] })))}
      <Image source={art.color} style={{ width, height }} resizeMode="contain" />
      {state === 'lose' && (
        <Animated.Image source={art.bw} style={[styles.absFill, { width, height, opacity: reveal }]} resizeMode="contain" />
      )}
      {state === 'win' && <ShineSweep id={`f${side}`} mask={art.mask} width={width} height={height} delay={1900} />}
      <LinearGradient colors={state === 'lose' ? ['#D8D8D8', '#7A7A7A'] : ['#FFE9A0', '#C98A1C']} style={styles.namePlate}>
        <Text style={styles.nameText}>{side}</Text>
      </LinearGradient>
    </View>
  );
}

/** The gold VS badge, breathing while the cards are revealed. */
function VsBadge({ height }: { height: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.Image
      source={VS_ART}
      style={{ width: height * VS_ASPECT, height, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}
      resizeMode="contain"
    />
  );
}

/** Result treatment on the table's painted heads: the loser fades to black
 * and white, the winner gets the light sweep. */
function BoardHeadFx({ side, state, frame }: { side: 'DRAGON' | 'TIGER'; state: HeadState; frame: { left: number; top: number; width: number; height: number } }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    if (state === 'lose') Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, [state, fade]);
  if (state === 'lose') {
    return <Animated.Image source={TABLE_HEAD[side].bw} style={[styles.abs, frame, { opacity: fade }]} resizeMode="stretch" />;
  }
  if (state === 'win') {
    return (
      <View pointerEvents="none" style={[styles.abs, frame]}>
        <ShineSweep id={`b${side}`} mask={TABLE_HEAD[side].mask} width={frame.width} height={frame.height} stretch />
      </View>
    );
  }
  return null;
}

const Chip = memo(function Chip({ value, size, label }: { value: number; size: number; label?: string }) {
  const color = CHIP_COLORS[value] ?? chipColorFor(value);
  const r = size / 2;
  const ringR = r - size * 0.1;
  const circ = 2 * Math.PI * ringR;
  const text = label ?? (value >= 1000 ? `${value / 1000}K` : String(value));
  const fontSize = size * (text.length > 3 ? 0.22 : 0.27);
  return (
    <Svg width={size} height={size}>
      <Circle cx={r} cy={r} r={r - 0.5} fill={color} stroke="#00000066" strokeWidth={1} />
      <Circle cx={r} cy={r} r={ringR} fill="none" stroke="#FFFFFF" strokeWidth={size * 0.12} strokeDasharray={`${circ / 16} ${circ / 16}`} />
      <Circle cx={r} cy={r} r={size * 0.3} fill="#141414" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={1.2} />
      <SvgText x={r} y={r + fontSize * 0.36} fontSize={fontSize} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
        {text}
      </SvgText>
    </Svg>
  );
});

function CardFace({ card, w }: { card: PlayingCard; w: number }) {
  const red = card.suit === 'H' || card.suit === 'D';
  const color = red ? '#D0142C' : '#16161C';
  return (
    <LinearGradient colors={['#FFFFFF', '#E9E9F0']} style={[styles.card, { width: w, height: w * 1.4, borderRadius: w * 0.1 }]}>
      <View style={styles.cardCorner}>
        <Text style={[styles.cardRank, { color, fontSize: w * 0.28 }]}>{RANK_LABEL[card.rank]}</Text>
        <Text style={{ color, fontSize: w * 0.22, marginTop: -3 }}>{SUIT_SYMBOL[card.suit]}</Text>
      </View>
      <Text style={{ color, fontSize: w * 0.62, marginTop: w * 0.12 }}>{SUIT_SYMBOL[card.suit]}</Text>
    </LinearGradient>
  );
}

function CardBack({ w }: { w: number }) {
  return (
    <LinearGradient colors={['#5A1A0E', '#2A0A04']} style={[styles.card, styles.cardBack, { width: w, height: w * 1.4, borderRadius: w * 0.1 }]}>
      <View style={[styles.cardBackInner, { borderRadius: w * 0.07 }]}>
        <View style={[styles.cardBackDiamond, { width: w * 0.42, height: w * 0.42 }]} />
        <Text style={[styles.cardBackMark, { fontSize: w * 0.2 }]}>NP</Text>
      </View>
    </LinearGradient>
  );
}

/** A card that flips from its back to `card` whenever the card changes. */
function FlipCard({ card, w, delay = 0 }: { card: PlayingCard | null; w: number; delay?: number }) {
  const flip = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<PlayingCard | null>(card);
  // Keyed on the card's value, not the object: every poll brings a fresh
  // object for the same card, which must not restart the flip.
  const cardKey = card ? `${card.rank}${card.suit}` : null;
  const cardRef = useRef(card);
  cardRef.current = card;
  useEffect(() => {
    if (cardKey) {
      setShown(cardRef.current);
      flip.setValue(0);
      Animated.timing(flip, { toValue: 1, duration: 520, delay, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    } else {
      flip.setValue(0);
    }
  }, [cardKey, delay, flip]);
  const scaleX = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] });
  const backOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] });
  const faceOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] });
  return (
    <Animated.View style={{ width: w, height: w * 1.4, transform: [{ scaleX }] }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backOpacity }]}>
        <CardBack w={w} />
      </Animated.View>
      {shown && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: faceOpacity }]}>
          <CardFace card={shown} w={w} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Stage card slot: empty while betting, dealt face-down while dealing,
 * flipped on the reveal. */
function DealtCard({ phase, card, w, from }: { phase: string; card: PlayingCard | null; w: number; from: 1 | -1 }) {
  const deal = useRef(new Animated.Value(phase === 'BETTING' ? 0 : 1)).current;
  useEffect(() => {
    if (phase === 'BETTING') {
      deal.setValue(0);
    } else {
      Animated.timing(deal, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [phase, deal]);
  return (
    <View style={[styles.cardSlot, { width: w + 6, height: w * 1.4 + 6, borderRadius: w * 0.12 }]}>
      <Animated.View
        style={{
          opacity: deal,
          transform: [
            { translateX: deal.interpolate({ inputRange: [0, 1], outputRange: [from * 140, 0] }) },
            { translateY: deal.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) },
            { rotate: deal.interpolate({ inputRange: [0, 1], outputRange: [`${from * 35}deg`, '0deg'] }) },
          ],
        }}
      >
        <FlipCard card={card} w={w} />
      </Animated.View>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Clock({ secs, fraction, size }: { secs: number; fraction: Animated.Value; size: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const urgent = secs <= 3;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="clockGold" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFF1B8" />
            <Stop offset="1" stopColor="#C98A1C" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r + 2} fill="#2A0C06" />
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#4A2412" strokeWidth={5} />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? '#FF4B3E' : 'url(#clockGold)'}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={fraction.interpolate({ inputRange: [0, 1], outputRange: [c, 0] })}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={[styles.clockText, { fontSize: size * 0.4 }, urgent && { color: '#FF5A4E' }]}>{secs}</Text>
    </View>
  );
}

/** Gold coins bursting out of a winning box. */
function WinBurst() {
  const t = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
  }, [t, pop]);
  return (
    <View pointerEvents="none" style={styles.burstWrap}>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return (
          <Animated.View
            key={i}
            style={[
              styles.coin,
              {
                opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * 70] }) },
                  { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * 45] }) },
                ],
              },
            ]}
          />
        );
      })}
      <Animated.Text style={[styles.winText, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}>
        WIN
      </Animated.Text>
    </View>
  );
}

type AreaState = 'normal' | 'win' | 'lose';

/** A transparent hit area laid over one painted box: its name and payout,
 * a faint watermark, this player's stake and the win / lose lighting. */
const BetBox = memo(function BetBox({
  area,
  title,
  mark,
  multiplier,
  total,
  state,
  big,
  onPress,
  glow,
  boxRef,
  frame,
  k,
}: {
  area: DragonTigerArea;
  title: string;
  mark: string;
  multiplier: number;
  total: number;
  state: AreaState;
  big: boolean;
  onPress: (area: DragonTigerArea) => void;
  glow: Animated.Value;
  boxRef: (v: View | null) => void;
  frame: { left: number; top: number; width: number; height: number };
  k: number;
}) {
  const radius = 14 * k;
  const markSize = Math.min(frame.height * (big ? 0.62 : 0.5), frame.width * (mark.length > 2 ? 0.16 : 0.62));
  // Sized to fit by arithmetic, not adjustsFontSizeToFit: with letter
  // spacing, Android's auto-shrink could blank the whole box's text.
  const spacing = (big ? 5 : 2) * k;
  const titleSize = Math.min((big ? 26 : 15) * k, (frame.width * 0.86 - spacing * (title.length - 1)) / (title.length * 0.74));
  return (
    <Pressable
      onPress={() => onPress(area)}
      style={({ pressed }) => [styles.boxHit, frame, { borderRadius: radius }, pressed && styles.boxPressed]}
    >
      <View ref={boxRef} collapsable={false} style={[styles.boxInner, { borderRadius: radius }, state === 'win' && styles.boxWin]}>
        <Text pointerEvents="none" style={[styles.boxMark, { fontSize: markSize, lineHeight: markSize * 1.15 }]} numberOfLines={1}>
          {mark}
        </Text>
        <Text style={[styles.boxTitle, { fontSize: titleSize, letterSpacing: spacing }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.boxMult, { fontSize: (big ? 22 : 15) * k }]}>{multiplier}x</Text>
        {total > 0 && (
          <>
            <View style={[styles.boxBet, { left: 8 * k, bottom: (big ? 12 : 6) * k }]} pointerEvents="none">
              <Text style={[styles.boxBetText, { fontSize: 11 * k }]}>₹{round2(total)}</Text>
            </View>
            <View style={big ? { position: 'absolute', right: 10 * k, bottom: 10 * k } : { position: 'absolute', right: 6 * k, top: 6 * k }} pointerEvents="none">
              <Chip value={total} size={(big ? 38 : 28) * k} label={shortAmount(total)} />
            </View>
          </>
        )}
        {state === 'win' && (
          <>
            <Animated.View pointerEvents="none" style={[styles.winGlow, { opacity: glow, borderRadius: radius }]} />
            <WinBurst />
          </>
        )}
        {state === 'lose' && <View pointerEvents="none" style={[styles.loseShade, { borderRadius: radius }]} />}
      </View>
    </Pressable>
  );
});

/** Golden light rays for the VS scene. */
function Rays({ size }: { size: number }) {
  const c = size / 2;
  const rays = Array.from({ length: 18 }, (_, i) => {
    const a0 = ((i * 20 - 4) * Math.PI) / 180;
    const a1 = ((i * 20 + 4) * Math.PI) / 180;
    return `M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`;
  });
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="rayFade" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFE9A0" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFB020" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {rays.map((d, i) => (
        <Path key={i} d={d} fill="url(#rayFade)" />
      ))}
    </Svg>
  );
}

/** Crystal shards flying out of an emblem when it lands. */
function Shards({ side, trigger }: { side: 'DRAGON' | 'TIGER'; trigger: Animated.Value }) {
  const pal = PALETTES[side];
  const shards = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + (side === 'DRAGON' ? 0.3 : 0.9);
        return { dx: Math.cos(a) * (70 + (i % 3) * 25), dy: Math.sin(a) * (55 + (i % 2) * 20), rot: (i % 2 ? 1 : -1) * (120 + i * 20), s: 10 + (i % 3) * 6 };
      }),
    [side]
  );
  return (
    <View pointerEvents="none" style={styles.shardWrap}>
      {shards.map((sh, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            opacity: trigger.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
            transform: [
              { translateX: trigger.interpolate({ inputRange: [0, 1], outputRange: [0, sh.dx] }) },
              { translateY: trigger.interpolate({ inputRange: [0, 1], outputRange: [0, sh.dy] }) },
              { rotate: trigger.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${sh.rot}deg`] }) },
            ],
          }}
        >
          <Svg width={sh.s} height={sh.s * 1.6}>
            <Polygon points={`${sh.s / 2},0 ${sh.s},${sh.s * 0.6} ${sh.s / 2},${sh.s * 1.6} 0,${sh.s * 0.6}`} fill={pal[3]} stroke={pal[4]} strokeWidth={0.8} />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

// ---------- screen ----------

type PlacedChip = { key: number; area: DragonTigerArea; amount: number; id?: string };
type Flight = { id: number; value: number; area: DragonTigerArea; from: { x: number; y: number }; to: { x: number; y: number }; anim: Animated.Value };

export default function DragonTigerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const landscape = W > H;
  const { coins, refreshWallet } = useGameState();

  // Played sideways: lock landscape while this screen is focused and hand
  // the rest of the app back its portrait lock on the way out.
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }, [])
  );

  const [config, setConfig] = useState<DragonTigerConfig | null>(null);
  const [view, setView] = useState<DragonTigerRoundView | null>(null);
  const [history, setHistory] = useState<DragonTigerHistoryEntry[]>([]);
  const [chips, setChips] = useState<PlacedChip[]>([]);
  const [selectedChip, setSelectedChip] = useState(DEFAULT_CHIP);
  const [win, setWin] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; start: boolean } | null>(null);
  const [vsOpen, setVsOpen] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flying, setFlying] = useState<Partial<Record<DragonTigerArea, number>>>({});
  const [, setPhaseTick] = useState(0);

  const offsetRef = useRef(0);
  const periodRef = useRef<string | null>(null);
  const resultHandledRef = useRef<string | null>(null);
  const chipsRef = useRef<PlacedChip[]>([]);
  chipsRef.current = chips;
  const lastRoundRef = useRef<{ area: DragonTigerArea; amount: number }[]>([]);
  const idMapRef = useRef(new Map<number, string>());
  const keyRef = useRef(1);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<View>(null);
  const chipRefs = useRef<Record<number, View | null>>({});
  const boxRefs = useRef<Partial<Record<DragonTigerArea, View | null>>>({});
  const flightId = useRef(1);

  const bannerAnim = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.4)).current;
  const vsAnim = useRef(new Animated.Value(0)).current;
  const vsSlide = useRef(new Animated.Value(0)).current;
  const vsShards = useRef(new Animated.Value(0)).current;
  const vsResult = useRef(new Animated.Value(0)).current;
  const vsRays = useRef(new Animated.Value(0)).current;
  const clockFraction = useRef(new Animated.Value(1)).current;

  const multipliers = config?.multipliers ?? FALLBACK_MULTIPLIERS;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const showBanner = useCallback(
    (text: string, start: boolean) => {
      setBanner({ text, start });
      bannerAnim.setValue(0);
      Animated.timing(bannerAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => {
        Animated.timing(bannerAnim, { toValue: 2, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
          () => mountedRef.current && setBanner(null)
        );
      }, BANNER_MS);
    },
    [bannerAnim]
  );

  const enqueue = useCallback((op: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(op).catch(() => {});
  }, []);

  const syncMyRound = useCallback(() => {
    fetchDragonTigerMyRound()
      .then((res) => {
        if (!mountedRef.current || res.periodNumber !== periodRef.current) return;
        setChips(
          res.bets.map((b) => {
            const key = keyRef.current++;
            idMapRef.current.set(key, b.id);
            return { key, area: b.area, amount: Number(b.amount), id: b.id };
          })
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchDragonTigerConfig()
      .then(setConfig)
      .catch(() => {});
    fetchDragonTigerHistory(100)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      if (vsTimer.current) clearTimeout(vsTimer.current);
    };
  }, []);

  // Round polling: chained so slow responses never overlap, and quicker
  // right around betting close / reveal / next round.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    let first = true;
    const loop = async () => {
      let delay = 800;
      try {
        const sentAt = Date.now();
        const v = await fetchDragonTigerCurrent();
        const receivedAt = Date.now();
        if (!alive) return;
        const measured = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
        offsetRef.current = first ? measured : offsetRef.current * 0.7 + measured * 0.3;
        setView(v);
        const srvNow = Date.now() + offsetRef.current;
        const nextEdge = Math.min(
          ...[v.betEndTime, v.resultTime, v.endTime].map((t) => new Date(t).getTime()).filter((t) => t > srvNow)
        );
        if (Number.isFinite(nextEdge) && nextEdge - srvNow < 1200) delay = 250;
        if (first) {
          first = false;
          periodRef.current = v.periodNumber;
          syncMyRound();
        }
      } catch {
        delay = 1500;
      }
      if (alive) timer = setTimeout(loop, delay);
    };
    loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [syncMyRound]);

  // New round: last round's chips become the REPEAT set.
  useEffect(() => {
    if (!view) return;
    if (periodRef.current !== null && periodRef.current !== view.periodNumber) {
      const placed = chipsRef.current.filter((c) => c.id);
      if (placed.length > 0) lastRoundRef.current = placed.map((c) => ({ area: c.area, amount: c.amount }));
      setChips([]);
      idMapRef.current.clear();
      setVsOpen(false);
      showBanner('Start Betting', true);
    }
    periodRef.current = view.periodNumber;
  }, [view, showBanner]);

  // Countdown ring for this round's betting window.
  useEffect(() => {
    if (!view) return;
    const betEnd = new Date(view.betEndTime).getTime();
    const total = Math.max(1, betEnd - new Date(view.startTime).getTime());
    const remaining = Math.max(0, betEnd - (Date.now() + offsetRef.current));
    clockFraction.setValue(remaining / total);
    const anim = Animated.timing(clockFraction, { toValue: 0, duration: remaining, easing: Easing.linear, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
    // Restart only when the round (not every poll) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.periodNumber, clockFraction]);

  // Re-render exactly when betting closes / the cards are due.
  useEffect(() => {
    if (!view) return;
    const srvNow = Date.now() + offsetRef.current;
    const betWait = new Date(view.betEndTime).getTime() - srvNow;
    const resWait = new Date(view.resultTime).getTime() - srvNow;
    const ids: ReturnType<typeof setTimeout>[] = [];
    if (betWait > 0)
      ids.push(
        setTimeout(() => {
          setPhaseTick((x) => x + 1);
          showBanner('Stop Betting', false);
        }, betWait + 20)
      );
    if (resWait > 0) ids.push(setTimeout(() => setPhaseTick((x) => x + 1), resWait + 20));
    return () => ids.forEach(clearTimeout);
  }, [view, showBanner]);

  const srvNow = Date.now() + offsetRef.current;
  const betEndMs = view ? new Date(view.betEndTime).getTime() : 0;
  const bettingOpen = !!view && srvNow < betEndMs;
  const phase: 'BETTING' | 'DEALING' | 'RESULT' = !view
    ? 'BETTING'
    : bettingOpen
      ? 'BETTING'
      : view.phase === 'RESULT' && view.dragon
        ? 'RESULT'
        : 'DEALING';
  const revealed = phase === 'RESULT' && view?.dragon && view?.tiger ? view : null;
  // The board only lights up once the VS scene has finished.
  const boardResult = revealed && !vsOpen ? revealed : null;

  useEffect(() => {
    if (phase !== 'BETTING') return;
    const id = setInterval(() => setPhaseTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [phase]);

  // Reveal: VS scene, road update, then this player's winnings.
  useEffect(() => {
    if (!view || view.phase !== 'RESULT' || !view.dragon || !view.tiger || resultHandledRef.current === view.periodNumber) return;
    const period = view.periodNumber;
    resultHandledRef.current = period;
    setVsOpen(true);
    [vsAnim, vsSlide, vsShards, vsResult, vsRays].forEach((v) => v.setValue(0));
    Animated.timing(vsAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    Animated.loop(Animated.timing(vsRays, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.sequence([
      Animated.timing(vsSlide, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }),
      Animated.timing(vsShards, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.timing(vsResult, { toValue: 1, duration: 450, delay: 1900, useNativeDriver: true }).start();
    // Held in a ref, not cleaned up with this effect: every poll brings a new
    // `view`, which would otherwise cancel the close and strand the scene.
    if (vsTimer.current) clearTimeout(vsTimer.current);
    vsTimer.current = setTimeout(() => {
      Animated.timing(vsAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => {
        vsRays.stopAnimation();
        if (mountedRef.current) setVsOpen(false);
      });
    }, VS_MS);
    const entry: DragonTigerHistoryEntry = {
      periodNumber: period,
      dragon: view.dragon,
      tiger: view.tiger,
      winner: view.winner!,
      suitedTie: !!view.suitedTie,
    };
    setHistory((h) => (h[0]?.periodNumber === period ? h : [entry, ...h].slice(0, 100)));
    if (chipsRef.current.length > 0) {
      enqueue(async () => {
        try {
          const res = await fetchDragonTigerMyRound(period);
          const won = round2(res.bets.reduce((sum, b) => sum + Number(b.payout), 0));
          if (won > 0) setTimeout(() => mountedRef.current && setWin(won), VS_MS + 1100);
        } catch {
          // Winnings still land in the wallet; only the card is skipped.
        }
        refreshWallet();
      });
    }
  }, [view, enqueue, refreshWallet, vsAnim, vsSlide, vsShards, vsResult, vsRays]);

  useEffect(() => {
    if (win === null) return;
    const id = setTimeout(() => setWin(null), WIN_CARD_MS);
    return () => clearTimeout(id);
  }, [win]);

  useEffect(() => {
    if (!boardResult) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.9, duration: 450, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.3, duration: 450, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [boardResult, glow]);

  const areaTotals = useMemo(() => {
    const m: Partial<Record<DragonTigerArea, number>> = {};
    for (const c of chips) m[c.area] = round2((m[c.area] ?? 0) + c.amount);
    return m;
  }, [chips]);
  const myTotal = useMemo(() => round2(chips.reduce((s, c) => s + c.amount, 0)), [chips]);
  const unconfirmed = useMemo(() => round2(chips.filter((c) => !c.id).reduce((s, c) => s + c.amount, 0)), [chips]);
  const displayBalance = Math.max(0, round2(coins - unconfirmed));

  const bettingOpenRef = useRef(bettingOpen);
  bettingOpenRef.current = bettingOpen;
  const displayBalanceRef = useRef(displayBalance);
  displayBalanceRef.current = displayBalance;
  const areaTotalsRef = useRef(areaTotals);
  areaTotalsRef.current = areaTotals;
  const maxStakeRef = useRef(maxStake);
  maxStakeRef.current = maxStake;
  const selectedChipRef = useRef(selectedChip);
  selectedChipRef.current = selectedChip;

  const placeChips = useCallback(
    (entries: { area: DragonTigerArea; amount: number }[]): boolean => {
      if (entries.length === 0) return false;
      if (!bettingOpenRef.current) {
        showToast('Betting closed — wait for the next round');
        return false;
      }
      const cost = round2(entries.reduce((s, e) => s + e.amount, 0));
      if (cost > displayBalanceRef.current) {
        showToast('Insufficient balance');
        return false;
      }
      const totals = { ...areaTotalsRef.current };
      for (const e of entries) {
        totals[e.area] = round2((totals[e.area] ?? 0) + e.amount);
        if ((totals[e.area] ?? 0) > maxStakeRef.current) {
          showToast(`Max bet per box is ₹${maxStakeRef.current}`);
          return false;
        }
      }
      const added: PlacedChip[] = entries.map((e) => ({ key: keyRef.current++, area: e.area, amount: e.amount }));
      const keys = new Set(added.map((c) => c.key));
      setChips((prev) => [...prev, ...added]);
      enqueue(async () => {
        try {
          const res = await placeDragonTigerBets(entries);
          res.bets.forEach((b, i) => idMapRef.current.set(added[i].key, b.id));
          if (mountedRef.current) {
            setChips((prev) => prev.map((c) => (keys.has(c.key) ? { ...c, id: idMapRef.current.get(c.key) } : c)));
          }
          refreshWallet();
        } catch (err) {
          if (mountedRef.current) {
            setChips((prev) => prev.filter((c) => !keys.has(c.key)));
            showToast(errorMessage(err));
          }
        }
      });
      return true;
    },
    [enqueue, refreshWallet, showToast]
  );

  // A chip flies from the rail to the box; the box counts it once it lands.
  const launchFlight = useCallback((area: DragonTigerArea, value: number) => {
    const chipView = chipRefs.current[value];
    const boxView = boxRefs.current[area];
    const root = rootRef.current;
    if (!chipView || !boxView || !root) return;
    root.measureInWindow((rx, ry) => {
      chipView.measureInWindow((cx, cy, cw, ch) => {
        boxView.measureInWindow((bx, by, bw, bh) => {
          if (!mountedRef.current) return;
          const id = flightId.current++;
          const anim = new Animated.Value(0);
          const flight: Flight = {
            id,
            value,
            area,
            from: { x: cx - rx + cw / 2, y: cy - ry + ch / 2 },
            to: { x: bx - rx + bw / 2 + (Math.random() - 0.5) * bw * 0.3, y: by - ry + bh / 2 + (Math.random() - 0.5) * bh * 0.2 },
            anim,
          };
          setFlights((prev) => [...prev, flight]);
          setFlying((prev) => ({ ...prev, [area]: round2((prev[area] ?? 0) + value) }));
          Animated.timing(anim, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
            if (!mountedRef.current) return;
            setFlights((prev) => prev.filter((f) => f.id !== id));
            setFlying((prev) => ({ ...prev, [area]: Math.max(0, round2((prev[area] ?? 0) - value)) }));
          });
        });
      });
    });
  }, []);

  const onAreaPress = useCallback(
    (area: DragonTigerArea) => {
      const value = selectedChipRef.current;
      if (placeChips([{ area, amount: value }])) launchFlight(area, value);
    },
    [placeChips, launchFlight]
  );

  const undo = () => {
    const last = chips[chips.length - 1];
    if (!last) return;
    if (!bettingOpen) return showToast('Betting closed');
    setChips((prev) => prev.slice(0, -1));
    enqueue(async () => {
      const id = idMapRef.current.get(last.key);
      if (!id) return;
      try {
        await cancelDragonTigerBets([id]);
        refreshWallet();
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      }
    });
  };

  const clearAll = () => {
    if (chips.length === 0) return;
    if (!bettingOpen) return showToast('Betting closed');
    setChips([]);
    enqueue(async () => {
      try {
        await cancelDragonTigerBets();
        refreshWallet();
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      }
    });
  };

  const repeat = () => {
    if (lastRoundRef.current.length === 0) return showToast('No bets from the last round');
    const m = new Map<DragonTigerArea, number>();
    for (const c of lastRoundRef.current) m.set(c.area, round2((m.get(c.area) ?? 0) + c.amount));
    placeChips([...m.entries()].map(([area, amount]) => ({ area, amount })));
  };

  // Bead plate: oldest first, filled down each column.
  const beads = history.slice(0, BEAD_COLS * BEAD_ROWS).reverse();
  const stats = useMemo(() => {
    const n = history.length;
    if (!n) return null;
    const d = history.filter((h) => h.winner === 'DRAGON').length;
    const t = history.filter((h) => h.winner === 'TIGER').length;
    return { d: Math.round((d / n) * 100), t: Math.round((t / n) * 100), tie: Math.round(((n - d - t) / n) * 100), n };
  }, [history]);

  const areaState = (area: DragonTigerArea): AreaState =>
    !boardResult ? 'normal' : areaWins(area, boardResult.winner, boardResult.suitedTie) ? 'win' : 'lose';
  const shownTotal = (area: DragonTigerArea) => Math.max(0, round2((areaTotals[area] ?? 0) - (flying[area] ?? 0)));

  const secsLeft = Math.max(0, Math.ceil((betEndMs - srvNow) / 1000));
  const statusText =
    phase === 'BETTING' ? 'PLACE YOUR BETS' : phase === 'DEALING' ? 'DEALING…' : boardResult ? `${boardResult.winner === 'TIE' ? 'TIE' : `${boardResult.winner} WINS`}` : 'REVEAL';

  if (!landscape) {
    return (
      <View style={[styles.root, styles.rotating]}>
        <MaterialCommunityIcons name="phone-rotate-landscape" size={48} color={GOLD} />
        <Text style={styles.rotatingText}>Turning to landscape…</Text>
      </View>
    );
  }

  // ---- table art → screen ----
  let sx = W / IMG_W;
  let sy = H / IMG_H;
  // Phones are within a few % of the art's shape, so it is stretched edge to
  // edge; squarer screens (tablets) keep its aspect and letterbox instead.
  if (sx / sy > 1.1 || sy / sx > 1.1) sx = sy = Math.min(sx, sy);
  const ox = (W - IMG_W * sx) / 2;
  const oy = (H - IMG_H * sy) / 2;
  const s = Math.min(sx, sy);
  const k = Math.max(0.75, Math.min(1.8, s / 0.485));
  const X = (x: number) => ox + x * sx;
  const Y = (y: number) => oy + y * sy;
  const frameOf = ([x0, y0, x1, y1]: Rect) => ({ left: X(x0), top: Y(y0), width: (x1 - x0) * sx, height: (y1 - y0) * sy });
  const leftEdge = insets.left + 6;
  const rightInset = insets.right + 6;
  // Keep the bottom-rail controls clear of a gesture bar.
  const lift = Math.max(0, insets.bottom - (H - Y(IMG_H)));

  const cardW = Math.min(100 * sx, (138 * sy) / 1.4);
  const cardPos = (cx: number) => ({ left: X(cx) - (cardW + 6) / 2, top: Y(118) - (cardW * 1.4 + 6) / 2 });
  const clockSize = 98 * s;
  const chipSize = Math.min(48, 84 * sy, (880 * sx) / 9.5);
  const ctrlW = Math.min(60, 124 * sx);
  const ctrlH = Math.min(46, 78 * sy);
  const glowSize = 330 * s;

  const leftPanelL = Math.max(X(48), leftEdge);
  const leftPanel = { left: leftPanelL, top: Y(262), width: X(266) - leftPanelL, height: 360 * sy };
  const rightPanelR = Math.min(X(1806), W - rightInset);
  const rightPanel = { left: X(1516), top: Y(236), width: rightPanelR - X(1516), height: 410 * sy };
  const beadS = Math.max(8, Math.floor(Math.min(18 * k, (rightPanel.width - 14) / BEAD_COLS - 2, (rightPanel.height - 62 * k) / BEAD_ROWS - 2)));

  const winnerSide = revealed?.winner;
  const fighterH = Math.min(H * 0.6, (W * 0.27) / 1.17);
  const vsBadgeH = Math.min(H * 0.62, fighterH * 1.15);
  const vsCardW = Math.min(70, fighterH * 0.3);
  const fighterState = (side: 'DRAGON' | 'TIGER'): FighterState =>
    winnerSide === 'TIE' ? 'tie' : winnerSide === side ? 'win' : 'lose';
  const headState = (side: 'DRAGON' | 'TIGER'): HeadState =>
    !boardResult ? 'idle' : boardResult.winner === side ? 'win' : boardResult.winner === 'TIE' ? 'idle' : 'lose';

  const sideStyle = (side: 'DRAGON' | 'TIGER') => {
    const winnerOrTie = winnerSide === 'TIE' || winnerSide === side;
    return {
      opacity: winnerOrTie ? 1 : vsResult.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] }),
      transform: [
        { translateX: vsSlide.interpolate({ inputRange: [0, 1], outputRange: [side === 'DRAGON' ? -W * 0.5 : W * 0.5, 0] }) },
        { scale: vsResult.interpolate({ inputRange: [0, 1], outputRange: [1, winnerOrTie ? 1.1 : 0.9] }) },
      ],
    };
  };

  const bannerStart = banner?.start ?? true;

  return (
    <View ref={rootRef} collapsable={false} style={styles.root}>
      <Image source={TABLE_BG} style={[styles.abs, frameOf([0, 0, IMG_W, IMG_H])]} resizeMode="stretch" />

      {/* Glass strip: light sweep and the glow on the painted heads */}
      <View pointerEvents="none" style={[styles.abs, styles.stripClip, frameOf([432, 62, 1284, 178]), { borderRadius: 10 * k }]}>
        <StripShine width={852 * sx} height={116 * sy} />
      </View>
      {(['DRAGON', 'TIGER'] as const).map((side) => (
        <View key={side} pointerEvents="none" style={[styles.abs, { left: X(HEAD_CENTER[side][0]) - glowSize / 2, top: Y(HEAD_CENTER[side][1]) - glowSize / 2 }]}>
          <HeadGlow side={side} state={headState(side)} size={glowSize} />
        </View>
      ))}
      {(['DRAGON', 'TIGER'] as const).map((side) => (
        <BoardHeadFx key={side} side={side} state={headState(side)} frame={frameOf(TABLE_HEAD[side].r)} />
      ))}

      {/* Cards and the betting clock on the strip */}
      <View style={[styles.abs, cardPos(738)]}>
        <DealtCard phase={phase} card={revealed?.dragon ?? null} w={cardW} from={-1} />
      </View>
      <View style={[styles.abs, styles.center, { left: X(860) - clockSize / 2, top: Y(118) - clockSize / 2, width: clockSize, height: clockSize }]}>
        {phase === 'BETTING' ? (
          <Clock secs={secsLeft} fraction={clockFraction} size={clockSize} />
        ) : (
          <Text style={[styles.vsSmall, { fontSize: 30 * k }]}>VS</Text>
        )}
      </View>
      <View style={[styles.abs, cardPos(982)]}>
        <DealtCard phase={phase} card={revealed?.tiger ?? null} w={cardW} from={1} />
      </View>

      {/* Top corners and status */}
      <Pressable onPress={() => navigation.goBack()} style={[styles.abs, styles.backBtn, { left: Math.max(X(14), leftEdge), top: Y(10) }]} hitSlop={8}>
        <MaterialCommunityIcons name="chevron-left" size={26 * k} color="#F5B942" />
        <Text style={[styles.title, { fontSize: 15 * k }]}>DRAGON TIGER</Text>
      </Pressable>
      <View pointerEvents="none" style={[styles.abs, styles.center, frameOf([648, 4, 1066, 58])]}>
        <Text style={[styles.topStatus, { fontSize: 11 * k }]} numberOfLines={1}>
          #{view?.periodNumber.slice(-5) ?? '-----'} · {statusText}
        </Text>
      </View>
      <Pressable
        onPress={() => navigation.navigate('Deposit')}
        style={[styles.abs, styles.depositPill, { right: Math.max(W - X(1836), rightInset), top: Y(12) }]}
      >
        <MaterialCommunityIcons name="wallet-plus" size={15 * k} color="#F5B942" />
        <Text style={[styles.depositText, { fontSize: 13 * k }]}>Deposit</Text>
      </Pressable>

      {/* Limits and rules in the left end of the table */}
      <View pointerEvents="none" style={[styles.abs, styles.sidePanel, leftPanel]}>
        <MaterialCommunityIcons name="cards-playing-outline" size={26 * k} color={GOLD} />
        <Text style={[styles.sideLabel, { fontSize: 10 * k, marginTop: 4 }]}>BET PER BOX</Text>
        <Text style={[styles.sideValue, { fontSize: 14 * k }]} numberOfLines={1}>
          ₹{minStake} – ₹{maxStake}
        </Text>
        <View style={styles.sideDivider} />
        <Text style={[styles.sideRule, { fontSize: 10 * k }]}>A low · K high</Text>
        <Text style={[styles.sideRule, { fontSize: 10 * k }]}>Tie: D/T lose</Text>
        <Text style={[styles.sideRule, { fontSize: 10 * k }]}>Max win ₹{config?.maxPayout ?? 10000}</Text>
      </View>

      {/* Road in the right end of the table */}
      <View style={[styles.abs, styles.sidePanel, rightPanel]}>
        <Text style={[styles.sideLabel, { fontSize: 10 * k }]}>LAST {Math.min(stats?.n ?? 0, BEAD_COLS * BEAD_ROWS)}</Text>
        <View style={styles.beadGrid}>
          {Array.from({ length: BEAD_COLS }, (_, c) => (
            <View key={c} style={styles.beadCol}>
              {Array.from({ length: BEAD_ROWS }, (_, r) => {
                const h = beads[c * BEAD_ROWS + r];
                const size = { width: beadS, height: beadS, borderRadius: beadS / 2 };
                if (!h) return <View key={r} style={[styles.beadEmpty, size]} />;
                const latest = c * BEAD_ROWS + r === beads.length - 1;
                return (
                  <View key={r} style={[styles.bead, size, { backgroundColor: BEAD_COLOR[h.winner] ?? BEAD_COLOR.TIE }, latest && styles.beadLatest]}>
                    <Text style={[styles.beadText, { fontSize: beadS * 0.55 }]}>{h.winner === 'DRAGON' ? 'D' : h.winner === 'TIGER' ? 'T' : '='}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <View style={styles.statRow}>
          <Text style={[styles.statLine, { color: '#8FB6FF', fontSize: 10 * k }]}>D {stats?.d ?? 0}%</Text>
          <Text style={[styles.statLine, { color: '#FF9AA4', fontSize: 10 * k }]}>T {stats?.t ?? 0}%</Text>
          <Text style={[styles.statLine, { color: '#7EE2A3', fontSize: 10 * k }]}>= {stats?.tie ?? 0}%</Text>
        </View>
      </View>

      {/* Bet boxes over the painted ones */}
      {BOXES.map((b) => (
        <BetBox
          key={b.area}
          area={b.area}
          title={b.title}
          mark={b.mark}
          multiplier={multipliers[b.area]}
          total={shownTotal(b.area)}
          state={areaState(b.area)}
          big={b.big}
          onPress={onAreaPress}
          glow={glow}
          boxRef={(v) => {
            boxRefs.current[b.area] = v;
          }}
          frame={frameOf(b.r)}
          k={k}
        />
      ))}

      {/* Bottom rail: actions · chips · balance */}
      <View style={[styles.abs, styles.actions, { left: Math.max(X(24), leftEdge), top: Y(803) - ctrlH / 2 - lift }]}>
        {(
          [
            { label: 'UNDO', icon: 'undo-variant', color: '#F2E6FF', onPress: undo },
            { label: 'REPEAT', icon: 'repeat', color: '#F2E6FF', onPress: repeat },
            { label: 'CLEAR', icon: 'close-thick', color: '#FF6B6B', onPress: clearAll },
          ] as const
        ).map((a) => (
          <Pressable key={a.label} onPress={a.onPress} style={({ pressed }) => [styles.ctrlBtn, { width: ctrlW, height: ctrlH }, pressed && styles.pressed]}>
            <MaterialCommunityIcons name={a.icon} size={18 * k} color={a.color} />
            <Text style={[styles.ctrlLabel, { fontSize: 9 * k }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.abs, styles.chipRail, { left: X(392), width: 896 * sx, top: Y(794) - chipSize / 2 - 2 - lift, gap: Math.max(4, 10 * sx) }]}>
        {CHIP_VALUES.map((v) => {
          const allowed = v >= minStake && v <= maxStake;
          const active = v === selectedChip;
          return (
            <Pressable key={v} disabled={!allowed} onPress={() => setSelectedChip(v)} style={[styles.chipBtn, active && styles.chipActive, !allowed && styles.dim]}>
              <View
                ref={(r) => {
                  chipRefs.current[v] = r;
                }}
                collapsable={false}
              >
                <Chip value={v} size={chipSize} />
              </View>
            </Pressable>
          );
        })}
      </View>
      <View pointerEvents="none" style={[styles.abs, styles.balancePill, { right: Math.max(W - X(1834), rightInset), top: Y(803) - ctrlH / 2 - lift, height: ctrlH }]}>
        <MaterialCommunityIcons name="wallet" size={20 * k} color={GOLD} />
        <View style={{ marginLeft: 6 }}>
          <Text style={[styles.balanceValue, { fontSize: 15 * k }]} numberOfLines={1}>
            ₹{displayBalance.toFixed(2)}
          </Text>
          <Text style={[styles.balanceSub, { fontSize: 9 * k }]} numberOfLines={1}>
            Bet ₹{myTotal.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Chips in flight */}
      {flights.map((f) => (
        <Animated.View
          key={f.id}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -chipSize / 2,
            top: -chipSize / 2,
            transform: [
              { translateX: f.anim.interpolate({ inputRange: [0, 1], outputRange: [f.from.x, f.to.x] }) },
              {
                translateY: f.anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [f.from.y, Math.min(f.from.y, f.to.y) - 40, f.to.y],
                }),
              },
              { scale: f.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.2, 0.85] }) },
            ],
          }}
        >
          <Chip value={f.value} size={chipSize} />
        </Animated.View>
      ))}

      {/* Start / Stop Betting */}
      {banner && (
        <View pointerEvents="none" style={styles.bannerLayer}>
          <Animated.View
            style={[
              styles.bannerBar,
              {
                top: H * 0.3,
                height: H * 0.26,
                width: W * 0.75,
                left: -W * 0.1,
                opacity: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0.95, 0] }),
                transform: [
                  { translateX: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [-W * 0.8, 0, -W * 0.2] }) },
                  { skewX: '-22deg' },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={bannerStart ? ['rgba(40,90,230,0)', 'rgba(40,90,230,0.85)', 'rgba(120,170,255,0.9)'] : ['rgba(90,20,20,0)', 'rgba(120,30,30,0.85)', 'rgba(200,80,40,0.9)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.bannerBar,
              {
                top: H * 0.3,
                height: H * 0.26,
                width: W * 0.75,
                right: -W * 0.1,
                opacity: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0.95, 0] }),
                transform: [
                  { translateX: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [W * 0.8, 0, W * 0.2] }) },
                  { skewX: '-22deg' },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={bannerStart ? ['rgba(255,110,110,0.9)', 'rgba(220,40,40,0.85)', 'rgba(220,40,40,0)'] : ['rgba(200,80,40,0.9)', 'rgba(120,30,30,0.85)', 'rgba(90,20,20,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.Text
            style={[
              styles.bannerText,
              {
                top: H * 0.3 + H * 0.13 - 30,
                opacity: bannerAnim.interpolate({ inputRange: [0, 0.6, 1, 2], outputRange: [0, 1, 1, 0] }),
                transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [2.2, 1, 1.15] }) }],
              },
            ]}
          >
            {banner.text}
          </Animated.Text>
        </View>
      )}

      {/* VS reveal */}
      {vsOpen && revealed && (
        <Animated.View style={[styles.vsOverlay, { opacity: vsAnim }]}>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              transform: [{ rotate: vsRays.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
            }}
          >
            <Rays size={Math.max(W, H) * 1.1} />
          </Animated.View>
          <View style={styles.vsRow}>
            <Animated.View style={[styles.vsSide, sideStyle('DRAGON')]}>
              <View>
                <Fighter side="DRAGON" height={fighterH} state={fighterState('DRAGON')} reveal={vsResult} />
                <Shards side="DRAGON" trigger={vsShards} />
              </View>
              <FlipCard card={revealed.dragon} w={vsCardW} delay={650} />
            </Animated.View>
            <Animated.View style={{ transform: [{ scale: vsSlide.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }], opacity: vsSlide }}>
              <VsBadge height={vsBadgeH} />
            </Animated.View>
            <Animated.View style={[styles.vsSide, sideStyle('TIGER')]}>
              <FlipCard card={revealed.tiger} w={vsCardW} delay={1200} />
              <View>
                <Fighter side="TIGER" height={fighterH} state={fighterState('TIGER')} reveal={vsResult} />
                <Shards side="TIGER" trigger={vsShards} />
              </View>
            </Animated.View>
          </View>
          <Animated.Text
            style={[
              styles.vsResult,
              { opacity: vsResult, transform: [{ scale: vsResult.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) }] },
            ]}
          >
            {revealed.winner === 'TIE' ? (revealed.suitedTie ? 'SUITED TIE!' : 'TIE!') : `${revealed.winner} WINS`}
          </Animated.Text>
        </Animated.View>
      )}

      {win !== null && (
        <View style={styles.winWrap}>
          <LinearGradient colors={['#3B1A06', '#1C0B02']} style={styles.winCard}>
            <Text style={styles.winTitle}>YOU WIN</Text>
            <Text style={styles.winAmount}>₹{win.toFixed(2)}</Text>
          </LinearGradient>
          <Pressable onPress={() => setWin(null)} style={styles.winClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={20} color="#FFE08A" />
          </Pressable>
        </View>
      )}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070006' },
  rotating: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  rotatingText: { color: GOLD, fontSize: 16, fontWeight: '700' },

  abs: { position: 'absolute' },
  absFill: { position: 'absolute', top: 0, left: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  stripClip: { overflow: 'hidden' },

  backBtn: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#E7D9D2', fontWeight: '900', letterSpacing: 1.5 },
  topStatus: { color: GOLD, fontWeight: '800', letterSpacing: 0.5, textShadowColor: '#000', textShadowRadius: 4 },
  depositPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, backgroundColor: 'rgba(58,10,16,0.85)', borderWidth: 1, borderColor: '#8A2E38' },
  depositText: { color: '#F5B942', fontWeight: '700' },

  clockText: { color: GOLD, fontWeight: '900' },
  vsSmall: { color: GOLD, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#C98A1C', textShadowRadius: 8 },
  namePlate: { position: 'absolute', bottom: -6, paddingHorizontal: 12, paddingVertical: 1, borderRadius: 8, borderWidth: 1, borderColor: '#7A4A00' },
  nameText: { color: '#3A1E00', fontSize: 11, fontWeight: '900', letterSpacing: 2 },

  card: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C9C9D2', overflow: 'hidden' },
  cardCorner: { position: 'absolute', top: 3, left: 5, alignItems: 'center' },
  cardRank: { fontWeight: '900' },
  cardBack: { borderColor: '#D9A441', borderWidth: 2 },
  cardBackInner: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderWidth: 1, borderColor: 'rgba(217,164,65,0.6)', alignItems: 'center', justifyContent: 'center' },
  cardBackDiamond: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(217,164,65,0.7)', transform: [{ rotate: '45deg' }] },
  cardBackMark: { color: '#D9A441', fontWeight: '900' },
  cardSlot: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,214,107,0.45)', backgroundColor: 'rgba(0,0,0,0.3)' },

  sidePanel: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderRadius: 18, backgroundColor: 'rgba(16,2,20,0.55)', borderWidth: 1, borderColor: 'rgba(255,120,200,0.22)', gap: 1 },
  sideName: { color: '#FFFFFF', fontWeight: '800', marginBottom: 4 },
  sideLabel: { color: '#C9B6EE', fontWeight: '700', letterSpacing: 0.5 },
  sideValue: { color: GOLD, fontWeight: '900', marginBottom: 3 },
  sideValueWhite: { color: '#FFFFFF', fontWeight: '800' },
  beadGrid: { flexDirection: 'row', gap: 2, marginVertical: 4 },
  beadCol: { gap: 2 },
  bead: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  beadEmpty: { backgroundColor: 'rgba(255,255,255,0.06)' },
  beadLatest: { borderWidth: 2, borderColor: GOLD },
  beadText: { color: '#FFFFFF', fontWeight: '900' },
  statRow: { flexDirection: 'row', gap: 6 },
  statLine: { fontWeight: '800' },

  boxHit: { position: 'absolute' },
  boxPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  boxInner: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  boxWin: { borderColor: GOLD, borderWidth: 3 },
  boxMark: { position: 'absolute', color: '#FFFFFF', opacity: 0.08, fontWeight: '900', textAlign: 'center' },
  boxTitle: { color: 'rgba(255,255,255,0.95)', fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 2 } },
  boxMult: { color: GOLD, fontWeight: '900', marginTop: 1, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  boxBet: { position: 'absolute', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.5)' },
  boxBetText: { color: '#FFFFFF', fontWeight: '800' },
  pressed: { transform: [{ scale: 0.95 }] },
  winGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,214,107,0.22)' },
  burstWrap: { position: 'absolute', top: '42%', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  coin: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFD23F', borderWidth: 1, borderColor: '#B7791F' },
  winText: { color: GOLD, fontSize: 30, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#7A4A00', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
  loseShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },

  sideDivider: { width: '60%', height: 1, backgroundColor: 'rgba(255,214,107,0.35)', marginVertical: 6 },
  sideRule: { color: 'rgba(255,230,255,0.8)', fontWeight: '700', marginTop: 2, textAlign: 'center' },
  balancePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(40,12,50,0.92)', borderWidth: 1.5, borderColor: GOLD },
  balanceValue: { color: GOLD, fontWeight: '900' },
  balanceSub: { color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
  railText: { color: GOLD, fontWeight: '800' },
  railHint: { color: 'rgba(255,220,255,0.6)', marginTop: 1 },
  chipRail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  chipBtn: { borderRadius: 30, padding: 2 },
  chipActive: { backgroundColor: GOLD, transform: [{ translateY: -6 }], elevation: 8, shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  dim: { opacity: 0.35 },
  actions: { flexDirection: 'row', gap: 6 },
  ctrlBtn: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(58,22,72,0.9)', borderWidth: 1.5, borderColor: '#7A3A8E' },
  ctrlLabel: { color: '#F2E6FF', fontWeight: '800', marginTop: 1 },

  bannerLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bannerBar: { position: 'absolute', overflow: 'hidden' },
  bannerText: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: GOLD,
    fontSize: 48,
    fontWeight: '900',
    fontStyle: 'italic',
    textShadowColor: '#6A3000',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 4 },
  },

  vsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,2,12,0.9)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', width: '100%' },
  vsSide: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  shardWrap: { position: 'absolute', top: '45%', left: '45%' },
  vsResult: { marginTop: 14, color: GOLD, fontSize: 32, fontWeight: '900', letterSpacing: 2, textShadowColor: '#7A3A00', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },

  winWrap: { position: 'absolute', top: '28%', alignSelf: 'center', alignItems: 'center' },
  winCard: { alignItems: 'center', paddingHorizontal: 34, paddingVertical: 12, borderRadius: 16, borderWidth: 2, borderColor: '#F5B942' },
  winTitle: { color: '#FFE08A', fontSize: 15, fontWeight: '900', letterSpacing: 3 },
  winAmount: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginTop: 2 },
  winClose: { marginTop: 8, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C0B02', borderWidth: 2, borderColor: '#F5B942' },
  toast: { position: 'absolute', alignSelf: 'center', top: '42%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: '#B7791F' },
  toastText: { color: '#FFE08A', fontSize: 14, fontWeight: '700' },
});
