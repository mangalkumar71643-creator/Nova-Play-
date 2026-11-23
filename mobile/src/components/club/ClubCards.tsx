import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

/*
 * The cards of Teen Patti Club. A card is a number 0..51 (suit * 13 + rank - 1; suits spades, hearts, clubs, diamonds; rank 1 = Ace
 * ... 13 = King). Faces are drawn here as SVG (the pips of a real deck, so they stay sharp at any size); the back is a picture made
 * by scripts/art/teenpatticlub.
 */

export const SUIT_LETTERS = ['S', 'H', 'C', 'D'] as const;
export type SuitLetter = (typeof SUIT_LETTERS)[number];
export const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_NAME: Record<SuitLetter, string> = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' };

export function cardParts(card: number): { rank: number; suit: SuitLetter } {
  return { rank: (card % 13) + 1, suit: SUIT_LETTERS[Math.floor(card / 13)] };
}

export function cardName(card: number): string {
  const { rank, suit } = cardParts(card);
  return `${RANK_LABEL[rank]} of ${SUIT_NAME[suit]}`;
}

const BACK = require('../../../assets/teenpatticlub/card-back.webp');

// ---- the four suits, in a 100 x 100 box (the same shapes as the art scripts)
const SUIT_PATH: Record<'S' | 'H' | 'D', string> = {
  S: 'M50 2 C56 22 98 38 98 64 C98 80 86 88 74 88 C64 88 56 82 53 74 C54 84 58 92 66 98 L34 98 C42 92 46 84 47 74 C44 82 36 88 26 88 C14 88 2 80 2 64 C2 38 44 22 50 2 Z',
  H: 'M50 94 C12 64 2 44 2 28 C2 12 14 4 28 4 C38 4 46 10 50 20 C54 10 62 4 72 4 C86 4 98 12 98 28 C98 44 88 64 50 94 Z',
  D: 'M50 2 C58 22 78 40 96 50 C78 60 58 78 50 98 C42 78 22 60 4 50 C22 40 42 22 50 2 Z',
};
const CLUB_STEM = 'M50 52 C50 74 46 88 34 98 L66 98 C54 88 50 74 50 52 Z';

/** One suit with its box's top-left corner at (x, y), `size` wide, optionally turned upside down (the lower half of a card). */
function Pip({ suit, x, y, size, fill, flip = false }: { suit: SuitLetter; x: number; y: number; size: number; fill: string; flip?: boolean }) {
  const k = size / 100;
  const transform = flip ? `translate(${x + size} ${y + size}) rotate(180) scale(${k})` : `translate(${x} ${y}) scale(${k})`;
  return (
    <G transform={transform}>
      {suit === 'C' ? (
        <>
          <Circle cx={50} cy={27} r={24} fill={fill} />
          <Circle cx={26} cy={62} r={24} fill={fill} />
          <Circle cx={74} cy={62} r={24} fill={fill} />
          <Path d={CLUB_STEM} fill={fill} />
        </>
      ) : (
        <Path d={SUIT_PATH[suit]} fill={fill} />
      )}
    </G>
  );
}

const COL = { L: 38, C: 70, R: 102 };
const ROW = { t: 46, tm: 72, m: 98, bm: 124, b: 150 };
// The pips of the number cards (x, y of each pip's centre; the ones in the lower half are upside down, as on a real card).
const PIPS: Record<number, [number, number][]> = {
  2: [[COL.C, ROW.t], [COL.C, ROW.b]],
  3: [[COL.C, ROW.t], [COL.C, ROW.m], [COL.C, ROW.b]],
  4: [[COL.L, ROW.t], [COL.R, ROW.t], [COL.L, ROW.b], [COL.R, ROW.b]],
  5: [[COL.L, ROW.t], [COL.R, ROW.t], [COL.C, ROW.m], [COL.L, ROW.b], [COL.R, ROW.b]],
  6: [[COL.L, ROW.t], [COL.R, ROW.t], [COL.L, ROW.m], [COL.R, ROW.m], [COL.L, ROW.b], [COL.R, ROW.b]],
  7: [[COL.L, ROW.t], [COL.R, ROW.t], [COL.C, 72], [COL.L, ROW.m], [COL.R, ROW.m], [COL.L, ROW.b], [COL.R, ROW.b]],
  8: [[COL.L, ROW.t], [COL.R, ROW.t], [COL.C, 72], [COL.L, ROW.m], [COL.R, ROW.m], [COL.C, 124], [COL.L, ROW.b], [COL.R, ROW.b]],
  9: [[COL.L, ROW.t], [COL.R, ROW.t], [COL.L, 82], [COL.R, 82], [COL.C, ROW.m], [COL.L, 114], [COL.R, 114], [COL.L, ROW.b], [COL.R, ROW.b]],
  10: [[COL.L, ROW.t], [COL.R, ROW.t], [COL.C, 62], [COL.L, 82], [COL.R, 82], [COL.L, 114], [COL.R, 114], [COL.C, 134], [COL.L, ROW.b], [COL.R, ROW.b]],
};
const PIP = 27;

export const ClubCardFace = memo(function ClubCardFace({ card, w }: { card: number; w: number }) {
  const { rank, suit } = cardParts(card);
  const ink = suit === 'H' || suit === 'D' ? '#C8102E' : '#15151A';
  const h = w * 1.4;
  const label = RANK_LABEL[rank];
  const big = rank === 1;
  const court = rank >= 11;
  const small = label.length > 1 ? 24 : 29;
  return (
    <View style={{ width: w, height: h, borderRadius: w * 0.1, overflow: 'hidden', backgroundColor: '#FBF8F1', borderWidth: StyleSheet.hairlineWidth, borderColor: '#B8AE96' }}>
      <LinearGradient colors={['#FFFFFF', '#EFE9DB']} style={StyleSheet.absoluteFill} />
      {/* absolutely placed like the gradient under it: on the web a positioned element is painted over an unpositioned one whatever the order */}
      <Svg width={w} height={h} viewBox="0 0 140 196" style={StyleSheet.absoluteFill}>
        {/* the two corners: rank over a small suit; the second turned round */}
        {[false, true].map((turned) => (
          <G key={String(turned)} transform={turned ? 'translate(140 196) rotate(180)' : undefined}>
            <SvgText x={15} y={32} fontSize={small} fontWeight="700" fill={ink} fontFamily="Georgia, 'Times New Roman', serif">
              {label}
            </SvgText>
            <Pip suit={suit} x={10} y={38} size={19} fill={ink} />
          </G>
        ))}
        {big ? (
          <Pip suit={suit} x={70 - 36} y={98 - 36} size={72} fill={ink} />
        ) : court ? (
          <G>
            <Rect x={34} y={44} width={72} height={108} rx={6} fill="none" stroke="#D2A24A" strokeWidth={2} />
            <Rect x={38} y={48} width={64} height={100} rx={4} fill="none" stroke="#D2A24A" strokeOpacity={0.55} strokeWidth={0.8} />
            <SvgText x={70} y={119} fontSize={66} fontWeight="700" textAnchor="middle" fill={ink} fontFamily="Georgia, 'Times New Roman', serif">
              {label}
            </SvgText>
            <Pip suit={suit} x={40} y={50} size={20} fill={ink} />
            <Pip suit={suit} x={80} y={126} size={20} fill={ink} flip />
          </G>
        ) : (
          PIPS[rank]?.map(([x, y], i) => <Pip key={i} suit={suit} x={x - PIP / 2} y={y - PIP / 2} size={PIP} fill={ink} flip={y > 98} />)
        )}
      </Svg>
    </View>
  );
});

export const ClubCardBack = memo(function ClubCardBack({ w }: { w: number }) {
  return <Image source={BACK} style={{ width: w, height: w * 1.4 }} resizeMode="stretch" fadeDuration={0} />;
});

/**
 * A card that is turned over when it becomes known: its back until `card` is given, then a flip to its face (a card already known
 * when the component first shows is simply face up). `delay` staggers a row of cards.
 */
export const ClubCard = memo(function ClubCard({ card, w, delay = 0, instant = false }: { card: number | null; w: number; delay?: number; instant?: boolean }) {
  const flip = useRef(new Animated.Value(card !== null ? 1 : 0)).current;
  const [shown, setShown] = useState<number | null>(card);
  const first = useRef(true);
  useEffect(() => {
    if (card === null) {
      flip.setValue(0);
      first.current = false;
      return;
    }
    setShown(card);
    if (first.current || instant) {
      flip.setValue(1);
    } else {
      flip.setValue(0);
      Animated.timing(flip, { toValue: 1, duration: 420, delay, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    }
    first.current = false;
  }, [card, delay, flip, instant]);
  const scaleX = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.04, 1] });
  const backOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] });
  const faceOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] });
  return (
    <Animated.View style={{ width: w, height: w * 1.4, transform: [{ scaleX }] }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backOpacity }]}>
        <ClubCardBack w={w} />
      </Animated.View>
      {shown !== null ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: faceOpacity }]}>
          <ClubCardFace card={shown} w={w} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

/** A small suit symbol (for the names of hands and the history). */
export function SuitMark({ suit, size, color }: { suit: SuitLetter; size: number; color?: string }) {
  const ink = color ?? (suit === 'H' || suit === 'D' ? '#E0364C' : '#E8E8EE');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Pip suit={suit} x={0} y={0} size={100} fill={ink} />
    </Svg>
  );
}
