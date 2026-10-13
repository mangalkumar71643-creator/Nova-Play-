import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  ChickenRoadConfig,
  ChickenRoadDifficulty,
  ChickenRoadRound,
  advanceChickenRoadStep,
  cashOutChickenRoadRound,
  fetchChickenRoadConfig,
  fetchChickenRoadCurrent,
  fetchChickenRoadHistory,
  startChickenRoadRound,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const MIN_STAKE = 10;
const QUICK_STAKES = [10, 100, 500, 1000];

// The extracted road-panel art (tree/lamp/sidewalk/2 manhole covers) is the
// first, fixed-size segment of a horizontally scrollable road — it already
// bakes in real manhole art for lanes 0 and 1. Every lane beyond that is
// drawn in code as a plain strip of the same road color with the same
// dashed white divider style repeating, so a round with many steps can be
// scrolled through. Round manhole-cover art for those later lanes will be
// dropped in later — for now they only show the multiplier text.
const SCREEN_WIDTH = Dimensions.get('window').width;
const PANEL_SOURCE_WIDTH = 1216;
const PANEL_SOURCE_HEIGHT = 1294;
const PANEL_ASPECT = PANEL_SOURCE_HEIGHT / PANEL_SOURCE_WIDTH;
const PANEL_WIDTH = SCREEN_WIDTH * 0.94;
const PANEL_HEIGHT = PANEL_WIDTH * PANEL_ASPECT;

// Fractional hotspot positions measured off the source image.
const NEAR_MANHOLE = { xFrac: 0.59, yFrac: 0.62 };
const FAR_MANHOLE = { xFrac: 0.93, yFrac: 0.62 };
const CHICKEN_IDLE_SPOT = { xFrac: 0.3, yFrac: 0.62 };

// Spacing between consecutive lane markers, derived from the two manholes
// already baked into the source art — every later lane repeats this pitch.
const LANE_PITCH = (FAR_MANHOLE.xFrac - NEAR_MANHOLE.xFrac) * PANEL_WIDTH;
const ROAD_COLOR = '#696666';

// Dash/gap run lengths measured off the source image's own divider line
// (~69px dash / ~70px gap out of a 1294px-tall, 1216px-wide source),
// scaled onto the panel's rendered height so the code-drawn dividers match.
const DASH_LEN = PANEL_HEIGHT * (69 / PANEL_SOURCE_HEIGHT);
const GAP_LEN = PANEL_HEIGHT * (70 / PANEL_SOURCE_HEIGHT);
const DASH_WIDTH = 3;

function laneX(step: number): number {
  return NEAR_MANHOLE.xFrac * PANEL_WIDTH + step * LANE_PITCH;
}

// The real manhole-cover plate the user supplied, cropped to its own content
// bounds (source canvas had transparent padding). Its diameter is scaled to
// match the manhole already baked into the near lane of the source art
// (measured ~299px circle out of the 1216-wide background), so every lane
// — the two baked into the background image and every code-drawn one after
// it — uses this same plate at the same size on the same line.
const PLATE_SOURCE_WIDTH = 1137;
const PLATE_SOURCE_HEIGHT = 1190;
const PLATE_ASPECT = PLATE_SOURCE_HEIGHT / PLATE_SOURCE_WIDTH;
const MANHOLE_DIAM = (299 / PANEL_SOURCE_WIDTH) * PANEL_WIDTH;
const PLATE_WIDTH = MANHOLE_DIAM;
const PLATE_HEIGHT = PLATE_WIDTH * PLATE_ASPECT;
const PLATE_PATCH_SIZE = MANHOLE_DIAM * 1.2;
const LANE_Y = NEAR_MANHOLE.yFrac * PANEL_HEIGHT;

const CHICKEN_ASPECT = 650 / 562;
const CHICKEN_WIDTH = 60;
const CHICKEN_HEIGHT = CHICKEN_WIDTH * CHICKEN_ASPECT;
const HOP_DURATION_MS = 380;

// The car sprites are top-down (bird's-eye), front already pointing "up"
// — no rotation needed, they drive straight down the screen (top to
// bottom) onto the road, same orientation as the reference footage. Ten
// different vehicles (cropped from one reference sheet) so back-to-back
// traffic on the same lane doesn't look like the same car repeating.
const CAR_SOURCES = [
  require('../../assets/chicken-road-car-1.webp'),
  require('../../assets/chicken-road-car-2.webp'),
  require('../../assets/chicken-road-car-3.webp'),
  require('../../assets/chicken-road-car-4.webp'),
  require('../../assets/chicken-road-car-5.webp'),
  require('../../assets/chicken-road-car-6.webp'),
  require('../../assets/chicken-road-car-7.webp'),
  require('../../assets/chicken-road-car-8.webp'),
  require('../../assets/chicken-road-car-9.webp'),
  require('../../assets/chicken-road-car-10.webp'),
];
function randomCarSource() {
  return CAR_SOURCES[Math.floor(Math.random() * CAR_SOURCES.length)];
}

const CAR_HEIGHT = MANHOLE_DIAM * 1.4;
const CAR_WIDTH = CAR_HEIGHT * (267 / 429);

// Doubled speed (half the travel time) for every car, ambient and bust-hit
// alike.
const CAR_DRIVE_MS = 210;
const CAR_HIT_HOLD_MS = 1000;

// The bust-hit car swoops in from 1.5 car-lengths above the chicken's row,
// drives straight through it and off the bottom, at the same pace as the
// ambient traffic.
const CAR_SPEED = (LANE_Y + CAR_HEIGHT) / CAR_DRIVE_MS; // px/ms
const HIT_CAR_APPROACH = CAR_HEIGHT * 1.5;
const HIT_CAR_START_Y = LANE_Y - HIT_CAR_APPROACH;
const HIT_CAR_TRAVEL = PANEL_HEIGHT + CAR_HEIGHT - HIT_CAR_START_Y;

// Ambient background traffic — independent of round state. Every lane runs
// its own nonstop stream of cars: as soon as one clears the panel, a new
// (randomly different) one starts down the same lane after a short gap.
// The chicken's own current lane is excluded (see the stop-barrier below).
const AMBIENT_DRIVE_MS = 1300;

// A stop barrier sits just ahead of the chicken on its current lane —
// blocking that lane's traffic — for as long as the round is waiting there.
// It disappears the instant a bust sends the dedicated hit-car through.
const BARRIER_SOURCE_ASPECT = 824 / 1660; // height / width
const BARRIER_WIDTH = LANE_PITCH * 0.55;
const BARRIER_HEIGHT = BARRIER_WIDTH * BARRIER_SOURCE_ASPECT;
const BARRIER_Y_OFFSET = CAR_HEIGHT * 1.2;
const AMBIENT_GAP_MS = 50;

const DIFFICULTY_LABELS: Record<ChickenRoadDifficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
  HARDCORE: 'Hardcore',
};
const DIFFICULTY_ORDER: ChickenRoadDifficulty[] = ['EASY', 'MEDIUM', 'HARD', 'HARDCORE'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function quickStakeLabel(amount: number): string {
  return amount >= 1000 ? `${amount / 1000}K` : String(amount);
}

type ResultBanner = { kind: 'won'; payout: number };

// One lane's own nonstop traffic: drives a car straight down this lane's
// fixed x (content-space, same as the lane markers, so it never drifts
// into a neighbouring column), and the moment it clears the panel a new,
// randomly different car starts down the same lane after a short gap —
// so every lane always has something driving through it. The motion runs
// on the native driver, so ~20 lanes of traffic don't re-render anything
// per frame; React only re-renders once per car to swap the sprite.
const AMBIENT_TRAVEL = PANEL_HEIGHT + 2 * CAR_HEIGHT;

const LaneTraffic = React.memo(function LaneTraffic({ x }: { x: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [source, setSource] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const drive = () => {
      if (cancelled) return;
      setSource(randomCarSource());
      translateY.setValue(0);
      Animated.timing(translateY, {
        toValue: AMBIENT_TRAVEL,
        duration: AMBIENT_DRIVE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !cancelled) timeout = setTimeout(drive, AMBIENT_GAP_MS);
      });
    };

    // Stagger each lane's first car by a random amount so all lanes don't
    // spawn in lockstep, while still running nonstop afterwards.
    timeout = setTimeout(drive, Math.random() * AMBIENT_DRIVE_MS);
    return () => {
      cancelled = true;
      if (timeout !== null) clearTimeout(timeout);
      translateY.stopAnimation();
    };
  }, [x, translateY]);

  if (source === null) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - CAR_WIDTH / 2,
        top: -CAR_HEIGHT * 1.5,
        width: CAR_WIDTH,
        height: CAR_HEIGHT,
        transform: [{ translateY }],
      }}
    >
      <Image source={source} style={{ width: CAR_WIDTH, height: CAR_HEIGHT }} resizeMode="contain" />
    </Animated.View>
  );
});

// Every lane ahead of the chicken gets its own perpetual traffic stream.
// Its current lane and every lane it has already crossed are held by stop
// barriers instead (see below) — no ambient car ever runs there, so
// there's no coincidental collision with a lane that's already decided.
const AmbientTraffic = React.memo(function AmbientTraffic({
  maxSteps,
  blockedUpToStep,
}: {
  maxSteps: number;
  blockedUpToStep: number | null;
}) {
  const steps = useMemo(() => Array.from({ length: maxSteps + 1 }, (_, i) => i), [maxSteps]);
  return (
    <>
      {steps.map((step) =>
        blockedUpToStep !== null && step <= blockedUpToStep ? null : (
          <LaneTraffic key={step} x={laneX(step)} />
        )
      )}
    </>
  );
});

const DASH_COUNT = Math.ceil(PANEL_HEIGHT / (DASH_LEN + GAP_LEN)) + 1;

function DashedDivider({ left }: { left: number }) {
  return (
    <View
      style={{ position: 'absolute', left, top: 0, width: DASH_WIDTH, height: PANEL_HEIGHT, overflow: 'hidden' }}
      pointerEvents="none"
    >
      {Array.from({ length: DASH_COUNT }).map((_, i) => {
        const top = i * (DASH_LEN + GAP_LEN);
        // Clip the last tile so it never renders past the panel's own
        // height instead of spilling below it.
        const height = Math.max(0, Math.min(DASH_LEN, PANEL_HEIGHT - top));
        if (height <= 0) return null;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              top,
              width: DASH_WIDTH,
              height,
              backgroundColor: '#FFFFFF',
              opacity: 0.85,
            }}
          />
        );
      })}
    </View>
  );
}

function HistoryChip({ round }: { round: ChickenRoadRound }) {
  const won = round.status === 'WON';
  return (
    <View style={styles.historyChip}>
      <Text style={[styles.historyChipText, { color: won ? '#3ECF8E' : '#FF3B4E' }]}>
        {won ? `${Number(round.multiplier).toFixed(2)}x` : 'BUST'}
      </Text>
    </View>
  );
}

export default function ChickenRoadScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<ChickenRoadConfig | null>(null);
  const [difficulty, setDifficulty] = useState<ChickenRoadDifficulty>('EASY');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stake, setStake] = useState(MIN_STAKE);
  const [stakeText, setStakeText] = useState(String(MIN_STAKE));
  const [round, setRound] = useState<ChickenRoadRound | null>(null);
  const [history, setHistory] = useState<ChickenRoadRound[]>([]);
  const [banner, setBanner] = useState<ResultBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const [carVisible, setCarVisible] = useState(false);
  const [carLaneX, setCarLaneX] = useState(0);
  const [carSource, setCarSource] = useState(CAR_SOURCES[0]);
  const [carPhase, setCarPhase] = useState<'none' | 'driving' | 'hit'>('none');
  const [isChickenHit, setIsChickenHit] = useState(false);
  const [chickenAtIdle, setChickenAtIdle] = useState(false);
  // The backend doesn't advance currentStep on a bust, so the lane the
  // chicken was stepping into (where it actually gets hit) is tracked here.
  const [bustStep, setBustStep] = useState<number | null>(null);
  // Set the instant GO is tapped: whether the lane turns out safe or a bust,
  // the chicken ends up in the next lane, so it moves there straight away
  // instead of waiting on the server round trip.
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  // Native-driven so the hop and the hit car never re-render the screen
  // every frame.
  const hopAnim = useRef(new Animated.Value(0)).current;
  const carAnim = useRef(new Animated.Value(0)).current;
  const hitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roadScrollRef = useRef<ScrollView | null>(null);

  const loadHistory = useCallback(() => {
    fetchChickenRoadHistory(20)
      .then(setHistory)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchChickenRoadConfig()
      .then(setConfig)
      .catch(() => {});
    fetchChickenRoadCurrent()
      .then((current) => {
        if (current) setRound(current);
      })
      .catch(() => {});
    loadHistory();
  }, [loadHistory]);

  const activeConfig = useMemo(
    () => config?.difficulties.find((d) => d.difficulty === (round?.difficulty ?? difficulty)) ?? null,
    [config, difficulty, round]
  );

  // Lanes 0 and 1 sit over the real background art; every lane after that
  // is a code-drawn extension of the same road color, repeating the pitch
  // measured between those two spots. Every lane, including 0 and 1, now
  // gets the same real plate image at the same size.
  const maxSteps = activeConfig?.steps ?? 1;
  const extraLaneCount = Math.max(0, maxSteps - 1);
  const extraWidth = extraLaneCount * LANE_PITCH;
  const totalRoadWidth = PANEL_WIDTH + extraWidth;
  const extraLaneSteps = useMemo(
    () => Array.from({ length: extraLaneCount }, (_, i) => i + 2),
    [extraLaneCount]
  );
  const allLaneSteps = useMemo(() => Array.from({ length: maxSteps + 1 }, (_, i) => i), [maxSteps]);

  useEffect(() => {
    return () => {
      hopAnim.stopAnimation();
      carAnim.stopAnimation();
      if (hitTimeoutRef.current !== null) clearTimeout(hitTimeoutRef.current);
    };
  }, [hopAnim, carAnim]);

  // The lane the chicken is standing in (or stepping into) right now.
  const chickenStep = round ? pendingStep ?? bustStep ?? round.currentStep : null;

  // Keep the chicken's current lane comfortably in view as the round
  // advances, without blocking the player from scrolling ahead manually.
  useEffect(() => {
    if (!round || chickenAtIdle) return;
    const targetX = Math.max(0, laneX(chickenStep ?? 0) - PANEL_WIDTH * 0.35);
    roadScrollRef.current?.scrollTo({ x: targetX, animated: true });
  }, [round, chickenAtIdle, chickenStep]);

  // Once the chicken has snapped back to its starting spot after a bust,
  // scroll the road back to the start too so it's actually visible there.
  useEffect(() => {
    if (chickenAtIdle) {
      roadScrollRef.current?.scrollTo({ x: 0, animated: true });
    }
  }, [chickenAtIdle]);

  // A quick in-place hop each time the chicken survives a lane — there's
  // nowhere further to walk to on this fixed image, so "moving forward"
  // reads as a little jump rather than a horizontal slide.
  const hop = useCallback(() => {
    const lift = -CHICKEN_HEIGHT * 0.22;
    hopAnim.stopAnimation();
    hopAnim.setValue(0);
    Animated.sequence([
      Animated.timing(hopAnim, {
        toValue: lift,
        duration: HOP_DURATION_MS / 2,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(hopAnim, {
        toValue: 0,
        duration: HOP_DURATION_MS / 2,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [hopAnim]);

  // A car drives straight down from above onto the chicken's bust lane and
  // "hits" it — swaps to the dazed sprite for a couple seconds, then
  // reverts. The stop-obstacle for safe lanes comes later; for now a safe
  // advance is just the plain hop, no car.
  // The car never stops at the chicken — it drives straight through and
  // off the bottom of the panel at the same constant speed. It only
  // spawns a short swoop above the chicken's row (not from the very top
  // of the panel), so the hit registers almost the instant "Next Lane" is
  // tapped instead of the player watching a long approach first. The
  // "hit" (dazed sprite) triggers the instant it passes the chicken's
  // row, and a second later the chicken snaps back to its own starting
  // spot on its own, independent of the car (which keeps going either way).
  const runCarHit = useCallback(
    (toStep: number, onComplete: () => void) => {
      carAnim.stopAnimation();
      carAnim.setValue(0);
      if (hitTimeoutRef.current !== null) clearTimeout(hitTimeoutRef.current);
      setCarLaneX(laneX(toStep));
      setCarSource(randomCarSource());
      setCarPhase('driving');
      setCarVisible(true);

      Animated.timing(carAnim, {
        toValue: HIT_CAR_TRAVEL,
        duration: HIT_CAR_TRAVEL / CAR_SPEED,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {
        setCarPhase('none');
        setCarVisible(false);
      });

      // The moment the car reaches the chicken's row.
      hitTimeoutRef.current = setTimeout(() => {
        setCarPhase('hit');
        setIsChickenHit(true);
        // Play stays locked until the chicken is back at its start spot, so
        // a new round can't begin while this reset is still pending.
        hitTimeoutRef.current = setTimeout(() => {
          setIsChickenHit(false);
          setChickenAtIdle(true);
          onComplete();
        }, CAR_HIT_HOLD_MS);
      }, HIT_CAR_APPROACH / CAR_SPEED);
    },
    [carAnim]
  );

  const setStakeValue = (value: number) => {
    setStake(value);
    setStakeText(String(value));
  };

  const commitStakeText = () => {
    const parsed = parseInt(stakeText, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(config?.minStake ?? MIN_STAKE, parsed) : MIN_STAKE;
    setStakeValue(clamped);
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setPickerOpen(false);
    try {
      const created = await startChickenRoadRound(stake, difficulty);
      setRound(created);
      setBanner(null);
      hopAnim.setValue(0);
      setCarVisible(false);
      setCarPhase('none');
      setIsChickenHit(false);
      setChickenAtIdle(false);
      setBustStep(null);
      setPendingStep(null);
      refreshWallet();
    } catch (err) {
      Alert.alert('Could not start', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (busy || !round) return;
    setBusy(true);
    setPendingStep(round.currentStep + 1);
    hop();
    try {
      const result = await advanceChickenRoadStep(round.id);
      setRound(result.round);
      setPendingStep(null);
      if (result.busted) {
        // The chicken is already in the next lane — the car hits it there.
        const hitStep = result.round.currentStep + 1;
        setBustStep(hitStep);
        runCarHit(hitStep, () => setBusy(false));
        refreshWallet();
        loadHistory();
      } else {
        setBusy(false);
        if (result.round.status === 'WON') {
          setBanner({ kind: 'won', payout: Number(result.round.payout) });
          refreshWallet();
          loadHistory();
        }
      }
    } catch (err) {
      setPendingStep(null);
      Alert.alert('Could not advance', err instanceof ApiClientError ? err.message : 'Please try again.');
      setBusy(false);
    }
  };

  const cashOut = async () => {
    if (busy || !round) return;
    setBusy(true);
    try {
      const updated = await cashOutChickenRoadRound(round.id);
      setRound(updated);
      setBanner({ kind: 'won', payout: Number(updated.payout) });
      refreshWallet();
      loadHistory();
    } catch (err) {
      Alert.alert('Cash out failed', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const isPlaying = round?.status === 'PENDING';
  const currentMultiplier = round ? Number(round.multiplier) : 1;
  const maxPayout = config?.maxPayout ?? Infinity;
  const potentialPayout = round ? Math.min(round2(Number(round.stake) * currentMultiplier), maxPayout) : 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={26} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.logoEgg}>🥚</Text>
        <View>
          <Text style={styles.logoText}>CHICKEN</Text>
          <Text style={styles.logoText}>ROAD</Text>
        </View>
        <View style={styles.headerSpacer} />
        <View style={styles.balancePill}>
          <Text style={styles.balanceRupee}>₹</Text>
          <Text style={styles.balanceAmount}>{coins.toFixed(2)}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.historyScroll}
        contentContainerStyle={styles.historyRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {history.length === 0 ? (
          <Text style={styles.historyEmptyText}>No rounds yet.</Text>
        ) : (
          history.map((h) => <HistoryChip key={h.id} round={h} />)
        )}
      </ScrollView>

      <View style={[styles.roadWrap, { width: PANEL_WIDTH, height: PANEL_HEIGHT }]}>
      <ScrollView
        ref={roadScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT }}
        contentContainerStyle={{ width: totalRoadWidth, height: PANEL_HEIGHT }}
      >
        <Image
          source={require('../../assets/chicken-road-panel-bg.webp')}
          style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT }}
          resizeMode="contain"
        />

        {extraLaneCount > 0 && (
          <View
            style={{
              position: 'absolute',
              left: PANEL_WIDTH,
              top: 0,
              width: extraWidth,
              height: PANEL_HEIGHT,
              backgroundColor: ROAD_COLOR,
              overflow: 'hidden',
            }}
          >
            {extraLaneSteps.map((step) => (
              <DashedDivider key={`d-${step}`} left={laneX(step) - LANE_PITCH / 2 - PANEL_WIDTH} />
            ))}
          </View>
        )}

        {allLaneSteps.map((step) => {
          const mult = activeConfig?.multipliers[step];
          if (mult === undefined) return null;
          const x = laneX(step);
          return (
            <React.Fragment key={`lane-${step}`}>
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: x - PLATE_PATCH_SIZE / 2,
                  top: LANE_Y - PLATE_PATCH_SIZE / 2,
                  width: PLATE_PATCH_SIZE,
                  height: PLATE_PATCH_SIZE,
                  backgroundColor: ROAD_COLOR,
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: x - PLATE_WIDTH / 2,
                  top: LANE_Y - PLATE_HEIGHT / 2,
                  width: PLATE_WIDTH,
                  height: PLATE_HEIGHT,
                }}
              >
                <Image
                  source={require('../../assets/chicken-road-manhole.webp')}
                  style={{ width: PLATE_WIDTH, height: PLATE_HEIGHT }}
                  resizeMode="contain"
                />
              </View>
              <View
                style={[styles.manholeLabel, { left: x - 40, top: LANE_Y - 12 }]}
                pointerEvents="none"
              >
                <Text style={styles.manholeLabelText}>{mult.toFixed(2)}x</Text>
              </View>
            </React.Fragment>
          );
        })}

        <AmbientTraffic
          maxSteps={maxSteps}
          // Stays blocked through a bust/cash-out too (not just while
          // PENDING) — the lane the chicken died on shouldn't reopen to
          // traffic until the player actually starts a new round.
          blockedUpToStep={chickenStep}
        />

        {isPlaying &&
          round &&
          Array.from({ length: round.currentStep + 1 }, (_, step) => step).map((step) => {
            // Every already-crossed lane keeps its barrier permanently; the
            // current lane's barrier drops only while the bust-hit car is
            // actually driving through (so it can reach the chicken).
            const visible = step < round.currentStep || carPhase === 'none';
            if (!visible) return null;
            return (
              <View
                key={`barrier-${step}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: laneX(step) - BARRIER_WIDTH / 2,
                  top: LANE_Y - BARRIER_Y_OFFSET - BARRIER_HEIGHT / 2,
                  width: BARRIER_WIDTH,
                  height: BARRIER_HEIGHT,
                }}
              >
                <Image
                  source={require('../../assets/chicken-road-barrier.webp')}
                  style={{ width: BARRIER_WIDTH, height: BARRIER_HEIGHT }}
                  resizeMode="contain"
                />
              </View>
            );
          })}

        <Animated.View
          style={[
            styles.chickenOverlay,
            {
              width: CHICKEN_WIDTH,
              height: CHICKEN_HEIGHT,
              left:
                (chickenStep !== null && !chickenAtIdle ? laneX(chickenStep) : CHICKEN_IDLE_SPOT.xFrac * PANEL_WIDTH) -
                CHICKEN_WIDTH / 2,
              top: NEAR_MANHOLE.yFrac * PANEL_HEIGHT - CHICKEN_HEIGHT,
              transform: [{ translateY: hopAnim }],
            },
          ]}
          pointerEvents="none"
        >
          <Image
            source={
              isChickenHit
                ? require('../../assets/chicken-road-chicken-hit.webp')
                : require('../../assets/chicken-road-chicken.webp')
            }
            style={{ width: CHICKEN_WIDTH, height: CHICKEN_HEIGHT }}
            resizeMode="contain"
          />
        </Animated.View>

        {carVisible && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: carLaneX - CAR_WIDTH / 2,
              top: HIT_CAR_START_Y - CAR_HEIGHT / 2,
              width: CAR_WIDTH,
              height: CAR_HEIGHT,
              transform: [{ translateY: carAnim }],
            }}
          >
            <Image source={carSource} style={{ width: CAR_WIDTH, height: CAR_HEIGHT }} resizeMode="contain" />
          </Animated.View>
        )}
      </ScrollView>
      </View>

      {banner && (
        <View style={[styles.banner, styles.bannerWon]}>
          <Text style={styles.bannerText}>
            {banner.payout >= maxPayout
              ? `Max win reached! Won ₹${banner.payout.toFixed(2)}`
              : `Cashed out! Won ₹${banner.payout.toFixed(2)}`}
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <View style={styles.stakeRow}>
          <Pressable
            onPress={() => setStakeValue(config?.minStake ?? MIN_STAKE)}
            disabled={isPlaying}
            style={styles.stakeMinMaxBtn}
          >
            <Text style={styles.stakeMinMaxText}>MIN</Text>
          </Pressable>
          <TextInput
            style={styles.stakeInput}
            value={isPlaying && round ? String(Number(round.stake)) : stakeText}
            onChangeText={setStakeText}
            onBlur={commitStakeText}
            onSubmitEditing={commitStakeText}
            editable={!isPlaying}
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            textAlign="center"
          />
          <Pressable
            onPress={() => setStakeValue(config?.maxStake ?? 500)}
            disabled={isPlaying}
            style={styles.stakeMinMaxBtn}
          >
            <Text style={styles.stakeMinMaxText}>MAX</Text>
          </Pressable>
        </View>

        <View style={styles.presetRow}>
          {QUICK_STAKES.map((amount) => (
            <Pressable
              key={amount}
              onPress={() => setStakeValue(amount)}
              disabled={isPlaying}
              style={styles.presetBtn}
            >
              <Text style={styles.presetText}>
                {quickStakeLabel(amount)} <Text style={styles.presetRupee}>₹</Text>
              </Text>
            </Pressable>
          ))}
        </View>

        <View>
          <Pressable
            onPress={() => setPickerOpen((v) => !v)}
            disabled={isPlaying}
            style={styles.difficultyDropdown}
          >
            <Text style={styles.difficultyDropdownText}>
              {DIFFICULTY_LABELS[isPlaying && round ? round.difficulty : difficulty]}
            </Text>
            <MaterialCommunityIcons
              name={pickerOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#B8B8BE"
            />
          </Pressable>
          {pickerOpen && (
            <View style={styles.difficultyMenu}>
              {DIFFICULTY_ORDER.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => {
                    setDifficulty(d);
                    setPickerOpen(false);
                  }}
                  style={styles.difficultyMenuItem}
                >
                  <Text
                    style={[styles.difficultyMenuItemText, d === difficulty && styles.difficultyMenuItemTextActive]}
                  >
                    {DIFFICULTY_LABELS[d]}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {isPlaying && round ? (
          <View style={styles.actionRow}>
            <Pressable
              onPress={cashOut}
              disabled={busy || round.currentStep === 0}
              style={[styles.cashOutBtn, round.currentStep === 0 && styles.cashOutBtnDisabled]}
            >
              <Text style={styles.cashOutBtnText}>Cash Out ₹{potentialPayout.toFixed(2)}</Text>
            </Pressable>
            <Pressable onPress={advance} disabled={busy} style={styles.goBtn}>
              <Text style={styles.goBtnText}>GO</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={start} disabled={busy} style={styles.playBtn}>
            <Text style={styles.playBtnText}>Play</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A1B1E' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  logoEgg: { fontSize: 22 },
  logoText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', lineHeight: 13 },
  headerSpacer: { flex: 1 },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2C2D31',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  balanceRupee: {
    color: '#0A0A0D',
    backgroundColor: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    borderRadius: 8,
    width: 16,
    height: 16,
    textAlign: 'center',
    lineHeight: 16,
    overflow: 'hidden',
  },
  balanceAmount: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  historyScroll: { height: 40, flexGrow: 0 },
  historyRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  historyEmptyText: { color: '#8A8A8E', fontSize: 12 },
  historyChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#2C2D31',
  },
  historyChipText: { fontSize: 12, fontWeight: '700' },
  roadWrap: {
    alignSelf: 'center',
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  manholeLabel: {
    position: 'absolute',
    width: 80,
    alignItems: 'center',
  },
  manholeLabelText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  chickenOverlay: { position: 'absolute' },
  banner: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bannerWon: { backgroundColor: 'rgba(62,207,142,0.15)' },
  bannerText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  controls: { marginTop: 16, paddingHorizontal: 12, gap: 12 },
  stakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2D31',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  stakeMinMaxBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#3A3A3E',
  },
  stakeMinMaxText: { color: '#B8B8BE', fontSize: 12, fontWeight: '700' },
  stakeInput: { flex: 1, color: '#FFFFFF', fontSize: 18, fontWeight: '700', padding: 0 },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2C2D31',
    alignItems: 'center',
  },
  presetText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  presetRupee: { color: '#8A8A8E' },
  difficultyDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2C2D31',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  difficultyDropdownText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  difficultyMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#2C2D31',
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 10,
    elevation: 10,
  },
  difficultyMenuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  difficultyMenuItemText: { color: '#B8B8BE', fontSize: 14, fontWeight: '600' },
  difficultyMenuItemTextActive: { color: '#3ECF8E' },
  playBtn: {
    backgroundColor: '#3ECF8E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  playBtnText: { color: '#0A0A0D', fontSize: 16, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 12 },
  cashOutBtn: {
    flex: 1,
    backgroundColor: '#F5C518',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cashOutBtnDisabled: { opacity: 0.4 },
  cashOutBtnText: { color: '#0A0A0D', fontSize: 16, fontWeight: '800' },
  goBtn: {
    flex: 1,
    backgroundColor: '#3ECF8E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  goBtnText: { color: '#0A0A0D', fontSize: 16, fontWeight: '800' },
});
