import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  fetchAviatorConfig,
  AviatorPublicBet,
  AviatorRoundView,
  cashOutAviatorBet,
  fetchAviatorCurrentRound,
  fetchAviatorHistory,
  fetchAviatorMyBets,
  fetchAviatorRoundBets,
  fetchAviatorTopBets,
  placeAviatorBet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const MIN_STAKE = 10;
const STAKE_STEP = 10;
// Mirrors the backend's own MIN_AUTO_CASHOUT (aviatorService.ts) so the
// stepper can clamp locally without a round-trip; the backend still
// enforces this too.
const MIN_AUTO_CASHOUT = 1.01;
const DEFAULT_AUTO_CASHOUT = 2;

// The bet-panel art used to be one 688x572 bitmap with both panels baked
// together, which left no room to add anything BELOW an individual panel
// (only after both). It's now two separate crops — aviator-bet-panel-1.png
// (0-284 of the original) and aviator-bet-panel-2.png (284-572) — so the
// Auto options row below can be inserted between/after each panel as an
// ordinary flow sibling. All the hotspot fractions below are measured
// against each crop's OWN height (284 / 288), not the original 572.
const BET_PANEL_1_SOURCE_HEIGHT = 284;
const BET_PANEL_2_SOURCE_HEIGHT = 288;
const BET_PANEL_1_ASPECT = BET_PANEL_1_SOURCE_HEIGHT / 688;
const BET_PANEL_2_ASPECT = BET_PANEL_2_SOURCE_HEIGHT / 688;

// Stepper hotspot positions as fractions of each panel's own crop, measured
// from the minus/plus circle art so the overlay lines up with the drawn
// buttons at any screen size.
const STEPPER_LAYOUT = {
  minus: { left: 32 / 688, top: 105 / 284, width: 43 / 688, height: 43 / 284 },
  plus: { left: 235 / 688, top: 104 / 284, width: 43 / 688, height: 44 / 284 },
  track: { left: 75 / 688, top: 105 / 284, width: 160 / 688, height: 43 / 284 },
};
// Second (lower) panel's stepper row sits at the same x layout — the
// original y (388) minus the crop offset (284), over the crop's own height.
const STEPPER_LAYOUT_2 = {
  minus: { left: 32 / 688, top: (388 - 284) / 288, width: 43 / 688, height: 44 / 288 },
  plus: { left: 235 / 688, top: (388 - 284) / 288, width: 43 / 688, height: 44 / 288 },
  track: { left: 75 / 688, top: (388 - 284) / 288, width: 160 / 688, height: 44 / 288 },
};

// Green "Bet" button hotspots — measured the same way as the stepper
// layouts above, one per panel's own crop.
const BET_BUTTON_LAYOUT_1 = { left: 307 / 688, top: 103 / 284, width: 348 / 688, height: 154 / 284 };
const BET_BUTTON_LAYOUT_2 = { left: 307 / 688, top: (387 - 284) / 288, width: 348 / 688, height: 153 / 288 };

// Quick-select stake amounts drawn into the blank space below the stepper
// (the panel art itself has nothing there) — a 2x2 grid spanning the same
// left/right edges as the stepper's minus/plus buttons above it, sized to
// end level with the green Bet button's own bottom edge.
const QUICK_STAKE_VALUES = [100, 200, 500, 1000];
const QUICK_STAKE_LAYOUT_1 = {
  left: 32 / 688,
  colWidth: 118 / 688,
  colGap: 10 / 688,
  top: 160 / 284,
  rowHeight: 43 / 284,
  rowGap: 10 / 284,
};
const QUICK_STAKE_LAYOUT_2 = {
  left: 32 / 688,
  colWidth: 118 / 688,
  colGap: 10 / 688,
  top: 160 / 288,
  rowHeight: 43 / 288,
  rowGap: 10 / 288,
};

// Bet/Auto toggle hotspots — the pill sits at the top of each panel, split
// into a left "Bet" half and a right "Auto" half.
const TOGGLE_BET_TAB = { left: 145 / 688, width: (344 - 145) / 688 };
const TOGGLE_AUTO_TAB = { left: 344 / 688, width: (540 - 344) / 688 };
const TOGGLE_TOP_1 = 6 / 284;
const TOGGLE_ROW_HEIGHT_1 = (93 - 6) / 284;
const TOGGLE_TOP_2 = (289 - 284) / 288;
const TOGGLE_ROW_HEIGHT_2 = (93 - 6) / 288;

// Panel background asset's own aspect ratio and on-screen width, matched
// to the reference Aviator site's panel: ~96.6% of screen width, and a
// shorter/wider aspect ratio than our first crop (measured directly off a
// reference screenshot: panel width/height ≈ 1237/722 px there).
const PANEL_ASPECT = 393 / 673;
const SCREEN_WIDTH = Dimensions.get('window').width;
const PANEL_WIDTH = SCREEN_WIDTH * 0.966;
const PANEL_HEIGHT = PANEL_WIDTH * PANEL_ASPECT;

// "Aviator" wordmark that sits in the header's empty space above the panel.
const LOGO_ASPECT = 49 / 148;
const LOGO_WIDTH = SCREEN_WIDTH * 0.32;
const LOGO_HEIGHT = LOGO_WIDTH * LOGO_ASPECT;

// Code-drawn diagonal bands instead of the old static background image,
// tilted to match the real reference (rays leaning toward the bottom-left
// takeoff corner) and scrolling slowly. An SVG <Pattern> whose y attribute
// changed every frame turned out not to reliably repaint on device, so
// this uses a plain View translated (and rotated) with a real transform
// instead — the same style-driven mechanism FlightTrail already uses for
// the plane every frame, which is proven to actually repaint. Fully
// self-contained (its own rAF loop, no shared state) so it can never
// interfere with that animation above.
const BG_STRIPE_TILE = PANEL_HEIGHT * 0.16;
const BG_BAND_HEIGHT = BG_STRIPE_TILE / 2;
const BG_SCROLL_PX_PER_SEC = BG_STRIPE_TILE / 0.625;
const BG_STRIPE_DARK = '#0a0a0d';
const BG_STRIPE_LIGHT = '#1c1c22';
const BG_ANGLE_DEG = 20;
// The rotated band-stack has to be sized off the panel's diagonal (not
// just its width/height) so that once tilted, it still fully covers every
// corner of the panel with no gap — plus one extra tile of height so
// sliding it down by up to one tile never uncovers an edge either.
const BG_DIAGONAL = Math.sqrt(PANEL_WIDTH ** 2 + PANEL_HEIGHT ** 2);
const BG_CONTENT_WIDTH = BG_DIAGONAL + 20;
const BG_BAND_COUNT = Math.ceil((BG_DIAGONAL + BG_STRIPE_TILE) / BG_BAND_HEIGHT) + 4;
const BG_CONTENT_HEIGHT = BG_BAND_COUNT * BG_BAND_HEIGHT;

// Only scrolls while the plane is actually flying — parked (holding its
// last position) during betting and after the crash, same as the plane
// itself effectively is at those times.
function PanelBackground({ isFlying }: { isFlying: boolean }) {
  // Scrolled on the native UI thread — no per-frame JS re-render.
  const offset = useRef(new Animated.Value(0)).current;
  const offsetNowRef = useRef(0);

  useEffect(() => {
    const id = offset.addListener(({ value }) => {
      offsetNowRef.current = value;
    });
    return () => offset.removeListener(id);
  }, [offset]);

  useEffect(() => {
    if (!isFlying) {
      offset.stopAnimation();
      return;
    }
    let cancelled = false;
    // Resume from wherever the stripes were parked, then loop whole tiles.
    const run = (from: number) => {
      offset.setValue(from);
      Animated.timing(offset, {
        toValue: BG_STRIPE_TILE,
        duration: ((BG_STRIPE_TILE - from) / BG_SCROLL_PX_PER_SEC) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !cancelled) run(0);
      });
    };
    run(offsetNowRef.current % BG_STRIPE_TILE);
    return () => {
      cancelled = true;
      offset.stopAnimation();
    };
  }, [isFlying, offset]);

  const bands = [];
  for (let i = 0; i < BG_BAND_COUNT; i++) {
    bands.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: i * BG_BAND_HEIGHT,
          height: BG_BAND_HEIGHT,
          backgroundColor: i % 2 === 0 ? BG_STRIPE_LIGHT : BG_STRIPE_DARK,
        }}
      />
    );
  }

  return (
    <View style={styles.panelBgClip}>
      <Animated.View
        style={{
          position: 'absolute',
          width: BG_CONTENT_WIDTH,
          height: BG_CONTENT_HEIGHT,
          left: (PANEL_WIDTH - BG_CONTENT_WIDTH) / 2,
          top: (PANEL_HEIGHT - BG_CONTENT_HEIGHT) / 2,
          transform: [{ rotate: `${BG_ANGLE_DEG}deg` }, { translateY: offset }],
        }}
      >
        {bands}
      </Animated.View>
    </View>
  );
}

// Round-history strip: sits in the gap between the logo and the panel's
// top border. Placeholder values for now — this is just the strip itself.
const HISTORY_BAR_HEIGHT = 28;
const HISTORY_SAMPLE: number[] = [1.75, 1.0, 1.0, 1.89, 2.42, 4.25, 1.01];
// "..." button at the strip's end opens a modal with the full history.
const HISTORY_DOTS_SIZE = HISTORY_BAR_HEIGHT;
const HISTORY_ROW_GAP = 8;
const FULL_HISTORY_LIMIT = 40;
function historyColor(mult: number) {
  if (mult >= 10) return '#E056FD';
  if (mult >= 2) return '#8854D0';
  return '#4B7BEC';
}

// Soft radial glow behind the live multiplier — same blue/purple/pink
// tiers as the history strip above, so the two stay consistent.
const MULTIPLIER_GLOW_SIZE = PANEL_WIDTH * 0.62;
function MultiplierGlow({ color }: { color: string }) {
  const size = MULTIPLIER_GLOW_SIZE;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="multiplierGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={0.6} />
          <Stop offset="55%" stopColor={color} stopOpacity={0.25} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#multiplierGlow)" />
    </Svg>
  );
}

// Countdown bar shown under the multiplier during BETTING — the red fill
// drains away over the fixed betting window (bettingStartTime ->
// flyStartTime, both server-provided) and the plane takes off exactly
// when it empties. Own rAF loop driven straight off those timestamps and
// Date.now(), so it's smooth regardless of how often `round` itself
// re-polls, and it never touches FlightTrail's state.
const COUNTDOWN_BAR_WIDTH = PANEL_WIDTH * 0.5;
const COUNTDOWN_BAR_HEIGHT = 10;

function BettingCountdownBar({ round }: { round: AviatorRoundView }) {
  // Native-driven drain: the full-width red fill slides left out of the
  // clipped track, so the JS thread does no per-frame work.
  const drain = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bettingStart = new Date(round.bettingStartTime).getTime();
    const flyStart = new Date(round.flyStartTime).getTime();
    const totalMs = Math.max(1, flyStart - bettingStart);
    const elapsed = Math.min(totalMs, Math.max(0, Date.now() - bettingStart));
    drain.setValue(elapsed / totalMs);
    const anim = Animated.timing(drain, {
      toValue: 1,
      duration: totalMs - elapsed,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [round.periodNumber, round.bettingStartTime, round.flyStartTime, drain]);

  const translateX = drain.interpolate({ inputRange: [0, 1], outputRange: [0, -COUNTDOWN_BAR_WIDTH] });
  return (
    <View style={styles.countdownTrack}>
      <Animated.View style={[styles.countdownFill, { transform: [{ translateX }] }]} />
    </View>
  );
}

// Bet/Auto toggle + stake stepper + Bet button block — same width as the
// panel above it, each half's own native aspect ratio preserved.
const BET_PANEL_WIDTH = PANEL_WIDTH;
const BET_PANEL_1_HEIGHT = BET_PANEL_WIDTH * BET_PANEL_1_ASPECT;
const BET_PANEL_2_HEIGHT = BET_PANEL_WIDTH * BET_PANEL_2_ASPECT;

// Plane icon's own aspect ratio, sized relative to the rays panel it flies
// inside of.
const PLANE_ASPECT = 215 / 441;
const PLANE_WIDTH = PANEL_WIDTH * 0.24;
const PLANE_HEIGHT = PLANE_WIDTH * PLANE_ASPECT;

// The plane's ascend (t: 0 -> 0.8) is a plain, fixed-speed animation —
// deliberately NOT calculated from the multiplier, elapsed round time, or
// any other backend value. It always takes exactly ASCEND_MS to climb up
// near the top of the panel and hold there, at the same fast speed every
// single round, regardless of how the actual multiplier is behaving.
const ASCEND_MS = 700;
// Order is: ascend (fixed-speed, up to just short of the top border) →
// hold there → the round actually crashes (server-reported) → red line
// fades out first (plane stays put) → only then does the plane dash away,
// so fast there's no time to react to it. Both crash stages are
// deliberately very short — one sudden crash, not a second slow glide.
const LINE_FADE_MS = 50;
const BURST_MS = 25;
const TRAIL_SAMPLES = 32;

// Plain-JS interpolation (mirrors Animated.interpolate's multi-stop
// breakpoints) so the same curve can drive both the plane's transform and
// the SVG trail points on every animation frame, in lockstep.
function interpolate(t: number, inputRange: number[], outputRange: number[]) {
  const last = inputRange.length - 1;
  if (t <= inputRange[0]) return outputRange[0];
  if (t >= inputRange[last]) return outputRange[last];
  for (let i = 0; i < last; i++) {
    if (t >= inputRange[i] && t <= inputRange[i + 1]) {
      const f = (t - inputRange[i]) / (inputRange[i + 1] - inputRange[i]);
      return outputRange[i] + f * (outputRange[i + 1] - outputRange[i]);
    }
  }
  return outputRange[last];
}

const planeRotate = (t: number) => interpolate(t, [0, 0.8, 1], [-6, -16, -42]);
const planeOpacity = (t: number) => interpolate(t, [0, 0.75, 0.95, 1], [1, 1, 0.5, 0]);
const planeScale = (t: number) => interpolate(t, [0, 0.8, 1], [1, 1, 1.15]);

// Tail-fin tip in the source plane art (441x215px), used so the curve is
// defined by where the TAIL sits, not the image's geometric center —
// planeX/planeY below are then solved backwards from this so the tail
// (not just the bounding box) starts exactly at the panel's corner.
const TAIL_PX = { x: 12, y: 197 };
const PLANE_CENTER_PX = { x: 441 / 2, y: 215 / 2 };

function rotatedTailOffset(t: number) {
  const scaleFactor = (PLANE_WIDTH / 441) * planeScale(t);
  const localDx = TAIL_PX.x - PLANE_CENTER_PX.x;
  const localDy = TAIL_PX.y - PLANE_CENTER_PX.y;
  const rad = (planeRotate(t) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    dx: (localDx * cos - localDy * sin) * scaleFactor,
    dy: (localDx * sin + localDy * cos) * scaleFactor,
  };
}

// Once the ascend finishes (t reaches 0.8) the plane holds at the same
// spot for however long the round keeps flying — for a long flight (say
// waiting well past 1.5x-2x) that read as dead-still, so a slow downward
// dip-and-return is layered on top of the hold position instead: it
// sinks down noticeably, then eases back up to the hold line (never
// higher), and repeats — not a symmetric up/down wobble.
const BOB_AMPLITUDE = PANEL_HEIGHT * 0.15;
const BOB_FREQUENCY_HZ = 0.15;

// Real Aviator's curve hugs the bottom-left corner while the multiplier is
// still near 1.00x, then rockets upward as it grows — a "hockey stick"
// shape, not a straight diagonal. CURVE_POWER > 1 gives exactly that: y
// barely moves while s is small, then rises sharply as s approaches 1.
// These are TAIL positions (small inset from the corner) — the plane's own
// box position is derived from these further down.
const TAIL_X_START = PANEL_WIDTH * 0.02;
const TAIL_X_MID = PANEL_WIDTH * 0.64; // hand-off point from ascend to burst
const TAIL_X_END = PANEL_WIDTH * 1.08;
const TAIL_Y_START = PANEL_HEIGHT * 0.94; // hugs the bottom-left corner at first
// Ascend climbs up toward the top of the panel before holding there to
// wait for the real crash — but stops with real margin below the top
// border. The earlier 0.22/0.26 attempts were still tuning the wrong
// thing: TAIL_Y_MID is the TAIL point, and the tail sits near the BOTTOM
// of the plane's own sprite (TAIL_PX.y is 197 out of a 215px-tall image),
// so almost the entire plane's body extends UPWARD past that point —
// plus React Native rotates the image around its own center, not its
// top-left corner, pushing the visible top edge higher still once
// rotated. 0.4 leaves enough room for all of that so the plane's actual
// visible top (not just its invisible tail anchor) stays clearly below
// the border, matching where it was marked as off-limits until a real
// crash.
const TAIL_Y_MID = PANEL_HEIGHT * 0.4;
const TAIL_Y_END = -PANEL_HEIGHT * 0.35;
const CURVE_POWER = 2.8;

function tailCurveX(t: number) {
  if (t <= 0.8) {
    return TAIL_X_START + (TAIL_X_MID - TAIL_X_START) * (t / 0.8);
  }
  return TAIL_X_MID + (TAIL_X_END - TAIL_X_MID) * ((t - 0.8) / 0.2);
}
function tailCurveY(t: number) {
  if (t <= 0.8) {
    const yFrac = Math.pow(t / 0.8, CURVE_POWER);
    return TAIL_Y_START - (TAIL_Y_START - TAIL_Y_MID) * yFrac;
  }
  const burstFrac = Math.pow((t - 0.8) / 0.2, 1.5);
  return TAIL_Y_MID - (TAIL_Y_MID - TAIL_Y_END) * burstFrac;
}

// The plane's own <Image> is positioned (translateX/Y, i.e. its top-left
// corner) by subtracting the tail's rotated offset from the desired tail
// position, so the tail itself — not the box center — always sits exactly
// on the curve.
const planeX = (t: number) => tailCurveX(t) - PLANE_WIDTH / 2 - rotatedTailOffset(t).dx;
const planeY = (t: number) => tailCurveY(t) - PLANE_HEIGHT / 2 - rotatedTailOffset(t).dy;

function tailPoint(t: number) {
  return { x: tailCurveX(t), y: tailCurveY(t) };
}

function FlightTrail({ round }: { round: AviatorRoundView | null }) {
  const [t, setT] = useState(0);
  const [trailFade, setTrailFade] = useState(1);
  const [bobY, setBobY] = useState(0);
  const rafRef = useRef<number | null>(null);
  const ascendStartRef = useRef(0);
  const fadeStartRef = useRef(0);
  const burstStartRef = useRef(0);
  // 'idle' covers both "no round yet" and the BETTING phase — the plane
  // sits parked at the runway (t=0) until the round actually starts
  // flying. 'held' is the post-burst rest state: the plane has fully
  // flown away and stays gone until the NEXT round's real data arrives.
  const phaseRef = useRef<'idle' | 'flying' | 'lineFade' | 'burst' | 'held'>('idle');
  const lastPeriodRef = useRef<string | null>(null);
  const roundRef = useRef(round);
  roundRef.current = round;

  useEffect(() => {
    let mounted = true;
    const tick = (now: number) => {
      if (!mounted) return;
      const r = roundRef.current;

      // A new round (real, server-assigned period) always resets the
      // visual to the runway, regardless of whatever this component's
      // own phase happened to be.
      if (r && r.periodNumber !== lastPeriodRef.current) {
        lastPeriodRef.current = r.periodNumber;
        phaseRef.current = 'idle';
        setT(0);
        setTrailFade(1);
        setBobY(0);
      }

      if (phaseRef.current === 'idle') {
        if (r && r.phase === 'FLYING') {
          phaseRef.current = 'flying';
          ascendStartRef.current = now;
        } else {
          setT(0);
        }
      }

      if (phaseRef.current === 'flying') {
        if (r && r.phase === 'CRASHED') {
          // The round has actually crashed (server-reported) — hold the
          // plane at its current ascend position and start the real
          // crash sequence instead of an internal timer.
          setT(0.8);
          setBobY(0);
          phaseRef.current = 'lineFade';
          fadeStartRef.current = now;
        } else {
          // Fixed-speed climb, always the same regardless of the
          // multiplier — reaches the hold point (just short of the top
          // border) in ASCEND_MS, then simply stays there until the round
          // actually crashes for real.
          const ascendElapsed = now - ascendStartRef.current;
          if (ascendElapsed >= ASCEND_MS) {
            // Holding — a long flight (waiting well past 1.5x, 2x...)
            // otherwise just freezes in the same spot, so bob gently
            // instead of sitting dead-still.
            setT(0.8);
            const holdElapsed = ascendElapsed - ASCEND_MS;
            const phase = (holdElapsed / 1000) * BOB_FREQUENCY_HZ * Math.PI * 2;
            // (1 - cos)/2 stays in [0, 1] the whole cycle — always a DIP
            // downward from the hold line and back, never rising above it.
            setBobY(BOB_AMPLITUDE * ((1 - Math.cos(phase)) / 2));
          } else {
            setT(0.8 * (ascendElapsed / ASCEND_MS));
            setBobY(0);
          }
        }
      } else if (phaseRef.current === 'lineFade') {
        // Plane holds still while the red line fades out first.
        const fadeElapsed = now - fadeStartRef.current;
        setTrailFade(Math.max(0, 1 - fadeElapsed / LINE_FADE_MS));
        if (fadeElapsed >= LINE_FADE_MS) {
          setTrailFade(0);
          phaseRef.current = 'burst';
          burstStartRef.current = now;
        }
      } else if (phaseRef.current === 'burst') {
        // Only once the line is fully gone does the plane dash away — and
        // it does so almost instantly, too fast to react to.
        const burstElapsed = now - burstStartRef.current;
        const bs = Math.min(1, burstElapsed / BURST_MS);
        setT(0.8 + 0.2 * bs);
        if (burstElapsed >= BURST_MS) {
          phaseRef.current = 'held';
        }
      }
      // 'held' does nothing further — it just waits for the period-change
      // check above to fire once the next round's real data comes in.

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Trail traces the plane's tail tip (not its geometric center) so the
  // red line always meets the plane exactly at its tail, at every step so
  // far. The stroke itself is one fully-opaque solid path — only the glow
  // fill beneath it fades for the glow effect; trailFade is what makes the
  // whole line vanish quickly once the plane has flown away.
  // Clamped to the panel's own box: during the fly-away burst the plane
  // itself is allowed to dash out above/past the border (that's the
  // intended premium crash effect), but the line stays bounded inside the
  // panel like a real graph, instead of leaking off past the screen edge.
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= TRAIL_SAMPLES; i++) {
    const raw = tailPoint((t * i) / TRAIL_SAMPLES);
    // Only the very tip curls to follow the plane's bob, tapered sharply
    // (8th power) so it fades to ~0 well before the earlier points — those
    // sit close to the bottom border already, so shifting them by the
    // same amount as the tip made them clamp flat against the edge while
    // the tip kept moving, which visibly sagged/deformed the whole curve
    // every bob cycle instead of just gently curling near the plane.
    const bobWeight = Math.pow(i / TRAIL_SAMPLES, 8);
    points.push({
      x: Math.min(Math.max(raw.x, 0), PANEL_WIDTH),
      y: Math.min(Math.max(raw.y + bobY * bobWeight, 0), PANEL_HEIGHT),
    });
  }
  const lineD = points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
  const fillD = `M ${lineD} L ${points[points.length - 1].x.toFixed(1)} ${PANEL_HEIGHT} L ${points[0].x.toFixed(1)} ${PANEL_HEIGHT} Z`;

  return (
    <>
      <Svg width={PANEL_WIDTH} height={PANEL_HEIGHT} style={[styles.trailSvg, { opacity: trailFade }]} pointerEvents="none">
        <Defs>
          <LinearGradient id="trailFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#C4172C" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#C4172C" stopOpacity={0.05} />
          </LinearGradient>
        </Defs>
        <Path d={fillD} fill="url(#trailFill)" />
        <Path
          d={`M ${lineD}`}
          stroke="#E8102F"
          strokeWidth={4}
          strokeOpacity={1}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Image
        source={require('../../assets/aviator-plane.webp')}
        resizeMode="contain"
        style={[
          styles.plane,
          {
            width: PLANE_WIDTH,
            height: PLANE_HEIGHT,
            opacity: planeOpacity(t),
            transform: [
              { translateX: planeX(t) },
              { translateY: planeY(t) + bobY },
              { rotate: `${planeRotate(t)}deg` },
              { scale: planeScale(t) },
            ],
          },
        ]}
      />
    </>
  );
}

function StakeStepper({
  layout,
  panelHeight,
  value,
  onChange,
}: {
  layout: typeof STEPPER_LAYOUT;
  panelHeight: number;
  value: number;
  onChange: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseInt(text, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(MIN_STAKE, parsed) : MIN_STAKE;
    setText(String(clamped));
    onChange(clamped);
  };

  const hotspot = (key: keyof typeof STEPPER_LAYOUT) => ({
    position: 'absolute' as const,
    left: layout[key].left * BET_PANEL_WIDTH,
    top: layout[key].top * panelHeight,
    width: layout[key].width * BET_PANEL_WIDTH,
    height: layout[key].height * panelHeight,
  });

  return (
    <>
      <Pressable
        onPress={() => onChange(Math.max(MIN_STAKE, value - STAKE_STEP))}
        hitSlop={4}
        style={hotspot('minus')}
      />
      <TextInput
        style={[hotspot('track'), styles.stakeText]}
        value={text}
        onChangeText={setText}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        selectTextOnFocus
        textAlign="center"
      />
      <Pressable onPress={() => onChange(value + STAKE_STEP)} hitSlop={4} style={hotspot('plus')} />
    </>
  );
}

function QuickStakeGrid({
  layout,
  panelHeight,
  onAdd,
}: {
  layout: typeof QUICK_STAKE_LAYOUT_1;
  panelHeight: number;
  onAdd: (amount: number) => void;
}) {
  return (
    <>
      {QUICK_STAKE_VALUES.map((amount, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        return (
          <Pressable
            key={amount}
            onPress={() => onAdd(amount)}
            style={[
              styles.quickStakeBtn,
              {
                left: (layout.left + col * (layout.colWidth + layout.colGap)) * BET_PANEL_WIDTH,
                top: (layout.top + row * (layout.rowHeight + layout.rowGap)) * panelHeight,
                width: layout.colWidth * BET_PANEL_WIDTH,
                height: layout.rowHeight * panelHeight,
              },
            ]}
          >
            <Text style={styles.quickStakeText}>{amount.toLocaleString('en-IN')}.00</Text>
          </Pressable>
        );
      })}
    </>
  );
}

type BetAutoMode = 'bet' | 'auto';

// Bet/Auto tab toggle overlaid on the panel art's own pill. Whichever tab
// is active gets a white background + our own dark label drawn on top of
// the static image (the baked-in label there is a light color meant for
// the dark, unselected look); the inactive tab is left completely alone,
// showing the panel art's own dark background and label untouched.
function BetAutoToggle({
  topFrac,
  rowHeightFrac,
  panelHeight,
  mode,
  onChange,
}: {
  topFrac: number;
  rowHeightFrac: number;
  panelHeight: number;
  mode: BetAutoMode;
  onChange: (next: BetAutoMode) => void;
}) {
  const tabStyle = (tab: typeof TOGGLE_BET_TAB) => ({
    position: 'absolute' as const,
    left: tab.left * BET_PANEL_WIDTH,
    top: topFrac * panelHeight,
    width: tab.width * BET_PANEL_WIDTH,
    height: rowHeightFrac * panelHeight,
    borderRadius: 9999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  });

  return (
    <>
      <Pressable onPress={() => onChange('bet')} style={[tabStyle(TOGGLE_BET_TAB), mode === 'bet' && styles.toggleTabActive]}>
        {mode === 'bet' && <Text style={styles.toggleTabActiveText}>Bet</Text>}
      </Pressable>
      <Pressable onPress={() => onChange('auto')} style={[tabStyle(TOGGLE_AUTO_TAB), mode === 'auto' && styles.toggleTabActive]}>
        {mode === 'auto' && <Text style={styles.toggleTabActiveText}>Auto</Text>}
      </Pressable>
    </>
  );
}

type PanelBetState =
  | { status: 'idle' }
  // Tapped Bet outside the betting window: placed as soon as the next
  // round opens (real Aviator's "bet for next round"); tap again to cancel.
  | { status: 'queued' }
  | { status: 'placing' }
  | { status: 'pending'; betId: string; amount: number; periodNumber: string; autoCashoutAt?: number }
  | { status: 'cashingOut'; betId: string; amount: number; periodNumber: string }
  | { status: 'won'; payout: number; cashoutMultiplier: number }
  | { status: 'lost' };

// Overlays the button hotspot with the current bet's state — the source
// art's own "Bet" text shows through untouched while idle; once a bet is
// live this paints a same-shaped rounded rect on top so the label can
// change (Cash Out / Won / Lost) without touching the underlying image.
function BetButton({
  layout,
  panelHeight,
  state,
  phase,
  liveMultiplier,
  onBet,
  onCashout,
  onCancelQueued,
}: {
  layout: { left: number; top: number; width: number; height: number };
  panelHeight: number;
  state: PanelBetState;
  phase: AviatorRoundView['phase'] | null;
  liveMultiplier: number;
  onBet: () => void;
  onCashout: () => void;
  onCancelQueued: () => void;
}) {
  const hotspot = {
    position: 'absolute' as const,
    left: layout.left * BET_PANEL_WIDTH,
    top: layout.top * panelHeight,
    width: layout.width * BET_PANEL_WIDTH,
    height: layout.height * panelHeight,
  };

  if (state.status === 'idle') {
    return <Pressable onPress={onBet} style={hotspot} />;
  }

  let label = '';
  let bg = 'rgba(0,0,0,0.6)';
  let onPress: (() => void) | undefined;

  if (state.status === 'queued') {
    label = 'CANCEL\nWaiting for next round';
    bg = 'rgba(196,23,44,0.92)';
    onPress = onCancelQueued;
  } else if (state.status === 'placing') {
    label = 'Placing…';
  } else if (state.status === 'pending') {
    if (phase === 'FLYING') {
      label = `CASH OUT\n₹${(state.amount * liveMultiplier).toFixed(2)}`;
      bg = 'rgba(46,160,67,0.92)';
      onPress = onCashout;
    } else {
      label = state.autoCashoutAt
        ? `Waiting…\n₹${state.amount} · Auto @${state.autoCashoutAt.toFixed(2)}x`
        : `Waiting…\n₹${state.amount}`;
    }
  } else if (state.status === 'cashingOut') {
    label = 'Cashing out…';
    bg = 'rgba(46,160,67,0.92)';
  } else if (state.status === 'won') {
    label = `WON +₹${state.payout.toFixed(2)}\nTap to bet next round`;
    bg = 'rgba(46,160,67,0.9)';
    onPress = onBet;
  } else if (state.status === 'lost') {
    label = 'LOST\nTap to bet next round';
    bg = 'rgba(196,23,44,0.9)';
    onPress = onBet;
  }

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[hotspot, styles.betOverlay, { backgroundColor: bg }]}>
      <Text style={styles.betOverlayText}>{label}</Text>
    </Pressable>
  );
}

// Small flat on/off switch matching the reference screenshot's minimal
// style — plain Views instead of RN's native Switch, which looks quite
// different (and more platform-chunky) than that flat dark look.
function MiniToggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={[styles.miniToggleTrack, value && styles.miniToggleTrackOn]}>
      <View style={[styles.miniToggleThumb, value && styles.miniToggleThumbOn]} />
    </Pressable>
  );
}

// The row that sits below each bet panel once it's in Auto mode: "Auto
// bet" (auto-place a bet every new round) and "Auto Cash Out" (send the
// multiplier below as autoCashoutAt when placing) are independent
// switches — matching real Aviator, where auto cash-out is a fallback a
// player can enable/disable separately from auto-betting itself.
function AutoOptionsRow({
  panelWidth,
  autoBetOn,
  onToggleAutoBet,
  autoCashOutOn,
  onToggleAutoCashOut,
  cashOutValue,
  onChangeCashOutValue,
}: {
  panelWidth: number;
  autoBetOn: boolean;
  onToggleAutoBet: (next: boolean) => void;
  autoCashOutOn: boolean;
  onToggleAutoCashOut: (next: boolean) => void;
  cashOutValue: number;
  onChangeCashOutValue: (next: number) => void;
}) {
  const [text, setText] = useState(cashOutValue.toFixed(2));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(cashOutValue.toFixed(2));
  }, [cashOutValue, editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(text);
    const clamped = Number.isFinite(parsed) ? Math.max(MIN_AUTO_CASHOUT, parsed) : DEFAULT_AUTO_CASHOUT;
    setText(clamped.toFixed(2));
    onChangeCashOutValue(clamped);
  };

  return (
    <View style={[styles.autoOptionsRow, { width: panelWidth }]}>
      <Text style={styles.autoOptionsLabel}>Auto bet</Text>
      <MiniToggle value={autoBetOn} onChange={onToggleAutoBet} />
      <Text style={styles.autoOptionsLabel}>Auto Cash Out</Text>
      <MiniToggle value={autoCashOutOn} onChange={onToggleAutoCashOut} />
      {autoCashOutOn && (
        <>
          <TextInput
            style={styles.autoOptionsValueInput}
            value={text}
            onChangeText={setText}
            onFocus={() => setEditing(true)}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
          />
          <Pressable onPress={() => onChangeCashOutValue(DEFAULT_AUTO_CASHOUT)} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={16} color="#8A8A8E" />
          </Pressable>
        </>
      )}
    </View>
  );
}

// "All Bets / Previous / Top" panel shown below the bet buttons — every
// player's activity on a round, masked to protect identity (see
// maskPlayerName on the backend). Fully self-contained: fetches its own
// data on a short poll while its tab is active, never touches `round`
// state or FlightTrail.
type BetsTab = 'all' | 'previous' | 'top';

function avatarColorFor(name: string): string {
  const palette = ['#4B7BEC', '#8854D0', '#20BF6B', '#EB5757', '#F0B93D', '#26C6DA'];
  const code = name.charCodeAt(0) || 0;
  return palette[code % palette.length];
}

function BetRow({ bet }: { bet: AviatorPublicBet }) {
  return (
    <View style={styles.betRow}>
      <View style={styles.betRowPlayer}>
        <View style={[styles.betAvatar, { backgroundColor: avatarColorFor(bet.player) }]}>
          <Text style={styles.betAvatarText}>{bet.player[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <Text style={styles.betCellText} numberOfLines={1}>
          {bet.player}
        </Text>
      </View>
      <Text style={[styles.betCellText, styles.betCellNum]}>{Number(bet.amount).toFixed(2)}</Text>
      <Text style={[styles.betCellText, styles.betCellNum]}>
        {bet.cashoutMultiplier ? `${Number(bet.cashoutMultiplier).toFixed(2)}x` : '—'}
      </Text>
      <Text
        style={[
          styles.betCellText,
          styles.betCellNum,
          { color: bet.status === 'WON' ? '#3ECF8E' : '#8A8A8E' },
        ]}
      >
        {Number(bet.payout).toFixed(2)}
      </Text>
    </View>
  );
}

function AviatorBetsPanel({
  currentPeriodNumber,
  minHeight,
}: {
  currentPeriodNumber: string | null;
  minHeight: number;
}) {
  const [tab, setTab] = useState<BetsTab>('all');
  const [bets, setBets] = useState<AviatorPublicBet[]>([]);

  useEffect(() => {
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;

    async function loadAll() {
      if (!currentPeriodNumber) return;
      try {
        const result = await fetchAviatorRoundBets(currentPeriodNumber);
        if (!cancelled) setBets(result);
      } catch {
        // Leave the previous list showing rather than clearing it on a
        // transient network error.
      }
    }
    async function loadPrevious() {
      try {
        const history = await fetchAviatorHistory();
        const lastPeriod = history[0]?.periodNumber;
        if (!lastPeriod) {
          if (!cancelled) setBets([]);
          return;
        }
        const result = await fetchAviatorRoundBets(lastPeriod);
        if (!cancelled) setBets(result);
      } catch {}
    }
    async function loadTop() {
      try {
        const result = await fetchAviatorTopBets();
        if (!cancelled) setBets(result);
      } catch {}
    }

    if (tab === 'all') {
      loadAll();
      pollId = setInterval(loadAll, 3000);
    } else if (tab === 'previous') {
      loadPrevious();
    } else {
      loadTop();
      pollId = setInterval(loadTop, 15000);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
    };
  }, [tab, currentPeriodNumber]);

  const totalWin = bets.reduce((sum, b) => sum + (b.status === 'WON' ? Number(b.payout) : 0), 0);
  const settledCount = bets.filter((b) => b.status !== 'PENDING').length;

  return (
    <View style={[styles.betsPanel, { minHeight }]}>
      <View style={styles.betsTabRow}>
        {(['all', 'previous', 'top'] as BetsTab[]).map((t) => (
          <Pressable key={t} style={[styles.betsTabBtn, tab === t && styles.betsTabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[styles.betsTabText, tab === t && styles.betsTabTextActive]}>
              {t === 'all' ? 'All Bets' : t === 'previous' ? 'Previous' : 'Top'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.betsSummaryRow}>
        <Text style={styles.betsSummaryText}>
          {settledCount}/{bets.length} Bets
        </Text>
        <Text style={styles.betsSummaryText}>Total win ₹{totalWin.toFixed(2)}</Text>
      </View>

      <View style={styles.betsHeaderRow}>
        <Text style={[styles.betsHeaderText, { flex: 1.4 }]}>Player</Text>
        <Text style={styles.betsHeaderText}>Bet ₹</Text>
        <Text style={styles.betsHeaderText}>X</Text>
        <Text style={styles.betsHeaderText}>Win ₹</Text>
      </View>

      <View style={[styles.betsList, bets.length === 0 && styles.betsListEmpty]}>
        {bets.length === 0 ? (
          <Text style={styles.betsEmptyText}>No bets yet.</Text>
        ) : (
          bets.map((item) => <BetRow key={item.id} bet={item} />)
        )}
      </View>
    </View>
  );
}

export default function AviatorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();
  // Guarantees the bets panel below is always at least one full screen
  // tall (same background color as the rest of the screen), so scrolling
  // down reveals a whole extra "page" of it rather than however little
  // space happens to be left over above the fold.
  const [scrollViewportHeight, setScrollViewportHeight] = useState(0);
  const [stake1, setStake1] = useState(MIN_STAKE);
  const [stake2, setStake2] = useState(MIN_STAKE);
  const [mode1, setMode1] = useState<BetAutoMode>('bet');
  const [mode2, setMode2] = useState<BetAutoMode>('bet');
  // Auto mode keeps its own stake and cash-out target per panel, separate
  // from the manual "Bet" mode's stake — switching tabs never overwrites
  // whatever the player had set on the other one.
  const [autoStake1, setAutoStake1] = useState(MIN_STAKE);
  const [autoStake2, setAutoStake2] = useState(MIN_STAKE);
  const [autoCashout1, setAutoCashout1] = useState(DEFAULT_AUTO_CASHOUT);
  const [autoCashout2, setAutoCashout2] = useState(DEFAULT_AUTO_CASHOUT);
  // Both start off, matching the reference: entering Auto mode alone
  // doesn't commit to anything until the player flips a switch.
  const [autoBetOn1, setAutoBetOn1] = useState(false);
  const [autoBetOn2, setAutoBetOn2] = useState(false);
  const [autoCashOutOn1, setAutoCashOutOn1] = useState(false);
  const [autoCashOutOn2, setAutoCashOutOn2] = useState(false);
  const [round, setRound] = useState<AviatorRoundView | null>(null);
  const [maxWin, setMaxWin] = useState<number | null>(null);
  useEffect(() => {
    fetchAviatorConfig()
      .then((c) => setMaxWin(c.maxPayout ?? null))
      .catch(() => {});
  }, []);
  const [history, setHistory] = useState<number[]>(HISTORY_SAMPLE);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [fullHistory, setFullHistory] = useState<number[]>([]);
  const [fullHistoryLoading, setFullHistoryLoading] = useState(false);
  const openHistoryModal = useCallback(() => {
    setHistoryModalVisible(true);
    setFullHistoryLoading(true);
    fetchAviatorHistory(FULL_HISTORY_LIMIT)
      .then((entries) => setFullHistory(entries.map((e) => Number(e.crashMultiplier))))
      .catch(() => {})
      .finally(() => setFullHistoryLoading(false));
  }, []);
  const [bet1, setBet1] = useState<PanelBetState>({ status: 'idle' });
  const [bet2, setBet2] = useState<PanelBetState>({ status: 'idle' });

  // Polling reads the latest bet state via refs (not the state variables
  // directly) so the interval set up once on mount always sees the
  // current value without needing to be torn down and recreated.
  const bet1Ref = useRef(bet1);
  const bet2Ref = useRef(bet2);
  // Every panel update goes through here so the refs are current at once —
  // the poll loop decides whether to place a queued bet from them, and a
  // ref only synced after the next render could let it place the same bet
  // twice.
  const setPanelBet = useCallback((panel: 1 | 2, next: PanelBetState) => {
    (panel === 1 ? bet1Ref : bet2Ref).current = next;
    (panel === 1 ? setBet1 : setBet2)(next);
  }, []);

  // Read directly (not via an effect) inside the polling loop below, the
  // same way FlightTrail reads its own roundRef — always the latest
  // render's values without tearing down/recreating the poll interval
  // whenever the player flips a switch or edits a stake.
  const autoBetConfigRef = useRef({ mode1, mode2, autoBetOn1, autoBetOn2 });
  autoBetConfigRef.current = { mode1, mode2, autoBetOn1, autoBetOn2 };
  // Assigned once placeBetForRound is defined below (component body order
  // doesn't matter for a ref written during render — the poll effect only
  // reads it later, asynchronously, by which point it's always set).
  const placeBetForRoundRef = useRef<(panel: 1 | 2, roundView: AviatorRoundView) => Promise<void>>(async () => {});

  const resolveIfPending = useCallback(
    async (panel: 1 | 2) => {
      const bet = (panel === 1 ? bet1Ref : bet2Ref).current;
      if (bet.status !== 'pending') return;
      const setBet = (next: PanelBetState) => {
        // Only if the panel still shows this bet (not a newer one).
        const now = (panel === 1 ? bet1Ref : bet2Ref).current;
        if (now.status === 'pending' && now.betId === bet.betId) setPanelBet(panel, next);
      };
      try {
        const bets = await fetchAviatorMyBets();
        const match = bets.find((b) => b.id === bet.betId);
        if (!match) return;
        if (match.status === 'WON') {
          setBet({ status: 'won', payout: Number(match.payout), cashoutMultiplier: Number(match.cashoutMultiplier ?? 0) });
          refreshWallet().catch(() => {});
        } else if (match.status === 'LOST') {
          setBet({ status: 'lost' });
        }
      } catch {
        // Transient failure — next poll tick tries again.
      }
    },
    [refreshWallet, setPanelBet]
  );

  useEffect(() => {
    let mounted = true;
    const lastPeriod = { current: null as string | null };

    const poll = async () => {
      try {
        const view = await fetchAviatorCurrentRound();
        if (!mounted) return;
        setRound(view);

        const newRound = lastPeriod.current !== null && lastPeriod.current !== view.periodNumber;
        if (newRound) {
          // A new round has started: clear each panel's finished result and
          // any bet left over from an earlier round, but keep a bet queued
          // for this round or one already placed on it.
          for (const panel of [1, 2] as const) {
            const b = (panel === 1 ? bet1Ref : bet2Ref).current;
            const stale =
              b.status === 'won' ||
              b.status === 'lost' ||
              ((b.status === 'pending' || b.status === 'cashingOut') && b.periodNumber !== view.periodNumber);
            if (stale) setPanelBet(panel, { status: 'idle' });
          }
          fetchAviatorHistory()
            .then((entries) => setHistory(entries.slice(0, 7).reverse().map((e) => Number(e.crashMultiplier))))
            .catch(() => {});
        }
        lastPeriod.current = view.periodNumber;

        // Betting window open: place each panel's queued bet, plus — once
        // per new round — an auto bet for a panel in Auto mode with "Auto
        // bet" on. Uses the freshly fetched view (not the `round` state,
        // which hasn't re-rendered yet) so the phase is never stale. Both
        // panels go out together; the server takes up to two per round.
        if (view.phase === 'BETTING') {
          const cfg = autoBetConfigRef.current;
          for (const panel of [1, 2] as const) {
            const b = (panel === 1 ? bet1Ref : bet2Ref).current;
            const autoOn = panel === 1 ? cfg.mode1 === 'auto' && cfg.autoBetOn1 : cfg.mode2 === 'auto' && cfg.autoBetOn2;
            if (b.status === 'queued' || (newRound && autoOn && b.status === 'idle')) placeBetForRoundRef.current(panel, view);
          }
        }

        if (view.phase === 'CRASHED') {
          resolveIfPending(1);
          resolveIfPending(2);
        }
      } catch {
        // Transient network hiccup — just try again on the next tick.
      }
    };

    fetchAviatorHistory()
      .then((entries) => setHistory(entries.slice(0, 7).reverse().map((e) => Number(e.crashMultiplier))))
      .catch(() => {});
    // Chained rather than setInterval so a slow response never stacks up
    // overlapping requests behind it.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      await poll();
      if (mounted) timer = setTimeout(loop, 300);
    };
    loop();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [resolveIfPending, setPanelBet]);

  // Takes the round view explicitly (rather than reading the `round`
  // state) so the auto-bet trigger in the polling effect above can pass
  // the just-fetched view straight in — using the `round` state there
  // would race against React's render cycle and could see the previous
  // round's stale phase for a tick.
  const placeBetForRound = useCallback(
    async (panel: 1 | 2, roundView: AviatorRoundView) => {
      const mode = panel === 1 ? mode1 : mode2;
      const isAuto = mode === 'auto';
      const autoCashOutOn = panel === 1 ? autoCashOutOn1 : autoCashOutOn2;
      const stake = isAuto ? (panel === 1 ? autoStake1 : autoStake2) : panel === 1 ? stake1 : stake2;
      // Auto Cash Out is its own switch — Auto mode can auto-bet without
      // ever sending an auto cash-out target, if that switch is off.
      const autoCashoutAt = isAuto && autoCashOutOn ? (panel === 1 ? autoCashout1 : autoCashout2) : undefined;
      const setBet = (next: PanelBetState) => setPanelBet(panel, next);
      setBet({ status: 'placing' });
      try {
        const result = await placeAviatorBet(stake, autoCashoutAt);
        setBet({
          status: 'pending',
          betId: result.id,
          amount: Number(result.amount),
          periodNumber: roundView.periodNumber,
          autoCashoutAt,
        });
        refreshWallet().catch(() => {});
      } catch (err) {
        const message = err instanceof ApiClientError ? err.message : 'Please try again.';
        // Missed the window by a hair (the screen's clock is a poll behind):
        // carry the bet over to the next round instead of dropping it.
        if (/closed/i.test(message)) {
          setBet({ status: 'queued' });
          return;
        }
        setBet({ status: 'idle' });
        Alert.alert('Bet failed', message);
      }
    },
    [mode1, mode2, stake1, stake2, autoStake1, autoStake2, autoCashout1, autoCashout2, autoCashOutOn1, autoCashOutOn2, refreshWallet, setPanelBet]
  );
  placeBetForRoundRef.current = placeBetForRound;

  // Manual "Bet" button handler — placeBetForRound does the actual work,
  // this just supplies the current round state and its own "closed" guard.
  // Outside the betting window the bet is queued for the next round.
  const placeBet = useCallback(
    (panel: 1 | 2) => {
      if (round && round.phase === 'BETTING') placeBetForRound(panel, round);
      else setPanelBet(panel, { status: 'queued' });
    },
    [round, placeBetForRound, setPanelBet]
  );

  const cancelQueued = useCallback(
    (panel: 1 | 2) => {
      if ((panel === 1 ? bet1Ref : bet2Ref).current.status === 'queued') setPanelBet(panel, { status: 'idle' });
    },
    [setPanelBet]
  );

  const cashout = useCallback(
    async (panel: 1 | 2) => {
      const bet = (panel === 1 ? bet1Ref : bet2Ref).current;
      const setBet = (next: PanelBetState) => setPanelBet(panel, next);
      if (bet.status !== 'pending') return;
      const { betId, amount, periodNumber } = bet;
      setBet({ status: 'cashingOut', betId, amount, periodNumber });
      try {
        const result = await cashOutAviatorBet(betId);
        setBet({ status: 'won', payout: result.payout, cashoutMultiplier: result.multiplier });
        refreshWallet().catch(() => {});
      } catch (err) {
        Alert.alert('Cash out failed', err instanceof ApiClientError ? err.message : 'Please try again.');
        setBet({ status: 'pending', betId, amount, periodNumber });
      }
    },
    [refreshWallet, setPanelBet]
  );

  const multiplierLabel = round ? `${round.multiplier.toFixed(2)}x` : '1.00x';
  const isCrashed = round?.phase === 'CRASHED';
  const multiplierColor = isCrashed ? '#FF3B4E' : '#FFFFFF';
  const multiplierGlowColor = isCrashed ? null : historyColor(round?.multiplier ?? 1);

  return (
    <View style={styles.screenRoot}>
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={10}
        style={[styles.backBtn, { top: insets.top + 8 }]}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
      </Pressable>

      <Text style={[styles.balanceChip, { top: insets.top + 8 }]}>₹{coins.toFixed(2)}</Text>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.root}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setScrollViewportHeight(e.nativeEvent.layout.height)}
      >
      <Image
        source={require('../../assets/aviator-logo.png')}
        resizeMode="contain"
        style={[styles.logo, { marginTop: insets.top + 8, width: LOGO_WIDTH, height: LOGO_HEIGHT }]}
      />

      <View style={[styles.historyRow, { width: PANEL_WIDTH }]}>
        <View
          style={[
            styles.historyBar,
            { width: PANEL_WIDTH - HISTORY_DOTS_SIZE - HISTORY_ROW_GAP, height: HISTORY_BAR_HEIGHT },
          ]}
        >
          {history.map((mult, i) => (
            <Text key={i} style={[styles.historyChip, { color: historyColor(mult) }]}>
              {mult.toFixed(2)}x
            </Text>
          ))}
        </View>
        <Pressable onPress={openHistoryModal} hitSlop={6} style={styles.historyDotsBtn}>
          <MaterialCommunityIcons name="dots-horizontal" size={18} color="#B8B8BE" />
        </Pressable>
      </View>

      <Modal
        visible={historyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <Pressable style={styles.historyModalBackdrop} onPress={() => setHistoryModalVisible(false)}>
          <Pressable style={styles.historyModalCard} onPress={() => {}}>
            <View style={styles.historyModalHeader}>
              <Text style={styles.historyModalTitle}>Round History</Text>
              <Pressable onPress={() => setHistoryModalVisible(false)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            {fullHistoryLoading ? (
              <Text style={styles.historyModalEmptyText}>Loading…</Text>
            ) : fullHistory.length === 0 ? (
              <Text style={styles.historyModalEmptyText}>No rounds yet.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.historyModalGrid}>
                  {fullHistory.map((mult, i) => (
                    <Text key={i} style={[styles.historyModalChip, { color: historyColor(mult) }]}>
                      {mult.toFixed(2)}x
                    </Text>
                  ))}
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <View style={[styles.panelWrap, { width: PANEL_WIDTH, height: PANEL_HEIGHT }]}>
        <PanelBackground isFlying={round?.phase === 'FLYING'} />
        <FlightTrail round={round} />
        <View style={styles.multiplierWrap} pointerEvents="none">
          {multiplierGlowColor && (
            <View style={styles.multiplierGlowBox}>
              <MultiplierGlow color={multiplierGlowColor} />
            </View>
          )}
          <Text style={[styles.multiplierText, { color: multiplierColor }]}>{multiplierLabel}</Text>
          {round?.phase === 'CRASHED' && <Text style={styles.multiplierSubLabel}>FLEW AWAY!</Text>}
          {round?.phase === 'BETTING' && (
            <>
              <Text style={styles.multiplierSubLabel}>Next round starting…</Text>
              <BettingCountdownBar round={round} />
            </>
          )}
        </View>
      </View>

      <View style={[styles.betPanelWrap, { width: BET_PANEL_WIDTH }]}>
        <View style={{ width: BET_PANEL_WIDTH, height: BET_PANEL_1_HEIGHT }}>
          <Image
            source={require('../../assets/aviator-bet-panel-1.webp')}
            style={{ width: BET_PANEL_WIDTH, height: BET_PANEL_1_HEIGHT }}
            resizeMode="contain"
          />
          <BetAutoToggle
            topFrac={TOGGLE_TOP_1}
            rowHeightFrac={TOGGLE_ROW_HEIGHT_1}
            panelHeight={BET_PANEL_1_HEIGHT}
            mode={mode1}
            onChange={setMode1}
          />
          <StakeStepper
            layout={STEPPER_LAYOUT}
            panelHeight={BET_PANEL_1_HEIGHT}
            value={mode1 === 'auto' ? autoStake1 : stake1}
            onChange={mode1 === 'auto' ? setAutoStake1 : setStake1}
          />
          <QuickStakeGrid
            layout={QUICK_STAKE_LAYOUT_1}
            panelHeight={BET_PANEL_1_HEIGHT}
            onAdd={(amount) => (mode1 === 'auto' ? setAutoStake1 : setStake1)((prev) => prev + amount)}
          />
          <BetButton
            layout={BET_BUTTON_LAYOUT_1}
            panelHeight={BET_PANEL_1_HEIGHT}
            state={bet1}
            phase={round?.phase ?? null}
            liveMultiplier={round?.multiplier ?? 1}
            onBet={() => placeBet(1)}
            onCashout={() => cashout(1)}
            onCancelQueued={() => cancelQueued(1)}
          />
        </View>
        {mode1 === 'auto' && (
          <AutoOptionsRow
            panelWidth={BET_PANEL_WIDTH}
            autoBetOn={autoBetOn1}
            onToggleAutoBet={setAutoBetOn1}
            autoCashOutOn={autoCashOutOn1}
            onToggleAutoCashOut={setAutoCashOutOn1}
            cashOutValue={autoCashout1}
            onChangeCashOutValue={setAutoCashout1}
          />
        )}

        <View style={{ width: BET_PANEL_WIDTH, height: BET_PANEL_2_HEIGHT }}>
          <Image
            source={require('../../assets/aviator-bet-panel-2.webp')}
            style={{ width: BET_PANEL_WIDTH, height: BET_PANEL_2_HEIGHT }}
            resizeMode="contain"
          />
          <BetAutoToggle
            topFrac={TOGGLE_TOP_2}
            rowHeightFrac={TOGGLE_ROW_HEIGHT_2}
            panelHeight={BET_PANEL_2_HEIGHT}
            mode={mode2}
            onChange={setMode2}
          />
          <StakeStepper
            layout={STEPPER_LAYOUT_2}
            panelHeight={BET_PANEL_2_HEIGHT}
            value={mode2 === 'auto' ? autoStake2 : stake2}
            onChange={mode2 === 'auto' ? setAutoStake2 : setStake2}
          />
          <QuickStakeGrid
            layout={QUICK_STAKE_LAYOUT_2}
            panelHeight={BET_PANEL_2_HEIGHT}
            onAdd={(amount) => (mode2 === 'auto' ? setAutoStake2 : setStake2)((prev) => prev + amount)}
          />
          <BetButton
            layout={BET_BUTTON_LAYOUT_2}
            panelHeight={BET_PANEL_2_HEIGHT}
            state={bet2}
            phase={round?.phase ?? null}
            liveMultiplier={round?.multiplier ?? 1}
            onBet={() => placeBet(2)}
            onCashout={() => cashout(2)}
            onCancelQueued={() => cancelQueued(2)}
          />
        </View>
        {mode2 === 'auto' && (
          <AutoOptionsRow
            panelWidth={BET_PANEL_WIDTH}
            autoBetOn={autoBetOn2}
            onToggleAutoBet={setAutoBetOn2}
            autoCashOutOn={autoCashOutOn2}
            onToggleAutoCashOut={setAutoCashOutOn2}
            cashOutValue={autoCashout2}
            onChangeCashOutValue={setAutoCashout2}
          />
        )}
      </View>

      {maxWin !== null && <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, textAlign: 'center', marginTop: 8 }}>Max win ₹{maxWin} per bet</Text>}
      <AviatorBetsPanel
        currentPeriodNumber={round?.periodNumber ?? null}
        minHeight={scrollViewportHeight}
      />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: '#1A1B1E' },
  scrollArea: { flex: 1 },
  root: { alignItems: 'center', flexGrow: 1, paddingBottom: 24 },
  backBtn: {
    position: 'absolute',
    left: 8,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  balanceChip: {
    position: 'absolute',
    right: 12,
    color: '#3ECF8E',
    fontSize: 15,
    fontWeight: '700',
    zIndex: 10,
  },
  // Logo, history bar and panel are stacked as normal flow siblings (each
  // with its own marginTop gap) instead of independently-computed absolute
  // offsets, so they can never overlap regardless of a device's actual
  // safe-area inset.
  logo: {},
  historyRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: HISTORY_ROW_GAP,
  },
  historyBar: {
    backgroundColor: '#2C2D31',
    borderRadius: HISTORY_BAR_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  historyChip: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyDotsBtn: {
    width: HISTORY_DOTS_SIZE,
    height: HISTORY_DOTS_SIZE,
    borderRadius: HISTORY_DOTS_SIZE / 2,
    backgroundColor: '#2C2D31',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  historyModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: '#1A1B1E',
    borderRadius: 16,
    padding: 16,
  },
  historyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  historyModalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  historyModalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  historyModalChip: {
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: '#2C2D31',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  historyModalEmptyText: {
    color: '#8A8A8E',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  panelWrap: {
    marginTop: 14,
  },
  // Clips only the scrolling background layer — the plane/trail render as
  // separate siblings above this, so they're unaffected and can still fly
  // past the panel's border during the crash burst as before.
  panelBgClip: {
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#0a0a0d',
  },
  plane: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  trailSvg: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  betPanelWrap: {
    marginTop: 30,
    alignSelf: 'center',
  },
  stakeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    padding: 0,
    backgroundColor: 'transparent',
  },
  quickStakeBtn: {
    position: 'absolute',
    backgroundColor: '#2C2D31',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStakeText: {
    color: '#B8B8BE',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleTabActive: {
    backgroundColor: '#FFFFFF',
  },
  toggleTabActiveText: {
    color: '#101012',
    fontSize: 15,
    fontWeight: '700',
  },
  multiplierWrap: {
    position: 'absolute',
    top: PANEL_HEIGHT * 0.3,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  multiplierGlowBox: {
    position: 'absolute',
    top: 28 - MULTIPLIER_GLOW_SIZE / 2,
    left: '50%',
    width: MULTIPLIER_GLOW_SIZE,
    height: MULTIPLIER_GLOW_SIZE,
    marginLeft: -MULTIPLIER_GLOW_SIZE / 2,
  },
  multiplierText: {
    fontSize: 40,
    fontWeight: '800',
  },
  multiplierSubLabel: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  countdownTrack: {
    marginTop: 10,
    width: COUNTDOWN_BAR_WIDTH,
    height: COUNTDOWN_BAR_HEIGHT,
    borderRadius: COUNTDOWN_BAR_HEIGHT / 2,
    backgroundColor: '#232733',
    overflow: 'hidden',
  },
  countdownFill: {
    width: '100%',
    height: '100%',
    borderRadius: COUNTDOWN_BAR_HEIGHT / 2,
    backgroundColor: '#E8102F',
  },
  betOverlay: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  betOverlayText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  autoOptionsRow: {
    marginTop: 10,
    backgroundColor: '#17171A',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  autoOptionsLabel: {
    color: '#B9B9BE',
    fontSize: 13,
    fontWeight: '600',
  },
  autoOptionsValueInput: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    minWidth: 46,
    textAlign: 'center',
    padding: 0,
  },
  miniToggleTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3A3A3E',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  miniToggleTrackOn: {
    backgroundColor: '#3ECF8E',
  },
  miniToggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#8A8A8E',
    alignSelf: 'flex-start',
  },
  miniToggleThumbOn: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-end',
  },
  betsPanel: {
    alignSelf: 'stretch',
    marginTop: 14,
    backgroundColor: '#1A1B1E',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  betsTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  betsTabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#2C2D31',
  },
  betsTabBtnActive: {
    backgroundColor: '#3ECF8E',
  },
  betsTabText: {
    color: '#8A8A8E',
    fontSize: 13,
    fontWeight: '600',
  },
  betsTabTextActive: {
    color: '#0A0A0D',
  },
  betsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  betsSummaryText: {
    color: '#8A8A8E',
    fontSize: 12,
    fontWeight: '500',
  },
  betsHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2D31',
  },
  betsHeaderText: {
    flex: 1,
    color: '#8A8A8E',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  betsList: {
    flex: 1,
    paddingBottom: 8,
  },
  betsListEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  betsEmptyText: {
    color: '#8A8A8E',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  betRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222327',
  },
  betRowPlayer: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  betAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  betAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  betCellText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  betCellNum: {
    flex: 1,
    textAlign: 'right',
  },
});
