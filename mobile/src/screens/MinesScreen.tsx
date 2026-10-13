import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  LayoutRectangle,
  Modal,
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
  MinesConfig,
  MinesRound,
  cashOutMinesRound,
  fetchMinesConfig,
  fetchMinesCurrent,
  fetchMinesHistory,
  revealMinesTile,
  startMinesRound,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const TILE_COUNT = 25;
const COLUMNS = 5;
const DEFAULT_MINES = 3;
const DEFAULT_STAKE = 10;
// -/+ step through these; the coin button offers the quick presets.
const STAKE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const QUICK_STAKES = [100, 200, 500, 1000];
// Auto Game: rounds to play per start, and the pacing between steps.
const AUTO_ROUND_OPTIONS = [3, 10, 25, 50, 100];
const DEFAULT_AUTO_ROUNDS = 10;
const AUTO_REVEAL_GAP_MS = 250;
const AUTO_ROUND_PAUSE_MS = 900;
const WIN_CARD_MS = 3000;

const SCREEN_WIDTH = Dimensions.get('window').width;
const BOARD_GAP = 10;
const BOARD_WIDTH = Math.min(SCREEN_WIDTH - 56, 440);
const TILE_WIDTH = (BOARD_WIDTH - BOARD_GAP * (COLUMNS - 1)) / COLUMNS;
const TILE_HEIGHT = TILE_WIDTH * 0.74;

// Mines dropdown: pill rows, about six and a half visible before scrolling.
const MINES_OPTION_HEIGHT = 34;
const MINES_OPTION_GAP = 10;
const MINES_DROPDOWN_VISIBLE = 6.6;

// How to Play illustration: a mini board with three stars and one mine.
const DEMO_TILE = Math.min(40, (SCREEN_WIDTH - 140) / 5);
const DEMO_GAP = 6;
const DEMO_STARS = new Set([6, 12, 18]);
const DEMO_MINE = 8;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Please try again.';
}

function inr(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Result = { kind: 'won'; multiplier: number; payout: number } | { kind: 'lost' };
type Popover = 'mines' | 'stake' | 'autoRounds' | null;

function Toggle({ value }: { value: boolean }) {
  return (
    <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
      <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
    </View>
  );
}

export default function MinesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<MinesConfig | null>(null);
  const [mineCount, setMineCount] = useState(DEFAULT_MINES);
  const [stake, setStake] = useState(DEFAULT_STAKE);
  const [stakeText, setStakeText] = useState(DEFAULT_STAKE.toFixed(2));
  const [round, setRound] = useState<MinesRound | null>(null);
  const [hitTile, setHitTile] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  // Tile tapped and waiting on the server — highlighted instantly so the tap
  // feels immediate even on a slow connection.
  const [pendingTile, setPendingTile] = useState<number | null>(null);
  const [popover, setPopover] = useState<Popover>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<MinesRound[]>([]);

  // Auto Game: pick tiles on the board, then each round opens exactly those
  // and cashes out if they were all safe.
  const [autoMode, setAutoMode] = useState(false);
  const [autoTiles, setAutoTiles] = useState<number[]>([]);
  const [autoRounds, setAutoRounds] = useState(DEFAULT_AUTO_ROUNDS);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const autoStopRef = useRef(false);
  const mountedRef = useRef(true);

  // Anchors for the popovers, all in root coordinates.
  const [rootHeight, setRootHeight] = useState(0);
  const [topBarBottom, setTopBarBottom] = useState(0);
  const [minesPillLayout, setMinesPillLayout] = useState<LayoutRectangle | null>(null);
  const [betPanelY, setBetPanelY] = useState(0);
  const [actionRowY, setActionRowY] = useState(0);
  const [stakeRowY, setStakeRowY] = useState(0);

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? Infinity;

  const loadHistory = useCallback(() => {
    fetchMinesHistory(30)
      .then(setHistory)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchMinesConfig()
      .then(setConfig)
      .catch(() => {});
    fetchMinesCurrent()
      .then((current) => {
        if (current) {
          setRound(current);
          setMineCount(current.mineCount);
          setStake(Number(current.stake));
          setStakeText(Number(current.stake).toFixed(2));
        }
      })
      .catch(() => {});
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      autoStopRef.current = true;
    };
  }, []);

  // The win card clears itself after a few seconds, or at once via its ✕.
  useEffect(() => {
    if (result?.kind !== 'won') return;
    const id = setTimeout(() => setResult(null), WIN_CARD_MS);
    return () => clearTimeout(id);
  }, [result]);

  const isPlaying = round?.status === 'PENDING';
  const locked = busy || autoRunning;
  const activeMines = round?.mineCount ?? mineCount;
  const revealed = useMemo(() => new Set(round?.revealed ?? []), [round]);
  const mines = useMemo(() => new Set(round?.minePositions ?? []), [round]);
  const autoSelected = useMemo(() => new Set(autoTiles), [autoTiles]);
  const revealedCount = round?.revealed.length ?? 0;
  const safeTiles = TILE_COUNT - activeMines;
  const selectingTiles = autoMode && !autoRunning && !isPlaying;
  const randomEnabled = selectingTiles || (isPlaying && !locked);

  const ladder = config?.multipliers[String(activeMines)];
  const nextStep = selectingTiles && autoTiles.length > 0 ? autoTiles.length : (isPlaying ? revealedCount : 0) + 1;
  const nextMultiplier = ladder ? ladder[Math.min(nextStep, ladder.length - 1)] : null;
  const progress = round ? revealedCount / safeTiles : 0;
  const cashOutAmount = round ? Math.min(round2(Number(round.stake) * Number(round.multiplier)), maxPayout) : 0;

  const setStakeValue = (value: number) => {
    const clamped = Math.min(Math.max(value, minStake), maxStake);
    setStake(clamped);
    setStakeText(clamped.toFixed(2));
  };

  const commitStakeText = () => {
    const parsed = Number(stakeText);
    setStakeValue(Number.isFinite(parsed) && parsed > 0 ? round2(parsed) : stake);
  };

  const stepStake = (direction: 1 | -1) => {
    const next =
      direction === 1
        ? STAKE_STEPS.find((s) => s > stake) ?? maxStake
        : [...STAKE_STEPS].reverse().find((s) => s < stake) ?? minStake;
    setStakeValue(next);
  };

  const clearBoard = () => {
    setRound(null);
    setResult(null);
    setHitTile(null);
  };

  const chooseMines = (n: number) => {
    setMineCount(n);
    clearBoard();
    // A selection can't ask for more tiles than there are safe ones.
    setAutoTiles((tiles) => tiles.slice(0, TILE_COUNT - n));
    setPopover(null);
  };

  const start = async () => {
    if (locked) return;
    setBusy(true);
    try {
      const created = await startMinesRound(stake, mineCount);
      setRound(created);
      setHitTile(null);
      setResult(null);
      refreshWallet();
    } catch (err) {
      Alert.alert('Could not start', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const settle = (settled: MinesRound, outcome: Result) => {
    setRound(settled);
    setResult(outcome);
    refreshWallet();
    loadHistory();
  };

  const wonResult = (r: MinesRound): Result => ({ kind: 'won', multiplier: Number(r.multiplier), payout: Number(r.payout) });

  const reveal = async (tile: number) => {
    if (!round || !isPlaying || locked || revealed.has(tile)) return;
    setBusy(true);
    setPendingTile(tile);
    try {
      const res = await revealMinesTile(round.id, tile);
      if (res.hitMine) {
        setHitTile(tile);
        settle(res.round, { kind: 'lost' });
      } else if (res.round.status === 'WON') {
        // Board cleared, or the max-payout cap was reached.
        settle(res.round, wonResult(res.round));
      } else {
        setRound(res.round);
      }
    } catch (err) {
      Alert.alert('Could not open tile', errorMessage(err));
    } finally {
      setPendingTile(null);
      setBusy(false);
    }
  };

  const toggleAutoTile = (tile: number) => {
    if (round && !isPlaying) clearBoard();
    setAutoTiles((tiles) => {
      if (tiles.includes(tile)) return tiles.filter((t) => t !== tile);
      if (tiles.length >= TILE_COUNT - mineCount) return tiles;
      return [...tiles, tile];
    });
  };

  const onTilePress = (tile: number) => {
    if (selectingTiles) toggleAutoTile(tile);
    else reveal(tile);
  };

  const randomPick = () => {
    if (selectingTiles) {
      const free = Array.from({ length: TILE_COUNT }, (_, i) => i).filter((t) => !autoSelected.has(t));
      if (free.length === 0 || autoTiles.length >= safeTiles) return;
      toggleAutoTile(free[Math.floor(Math.random() * free.length)]);
      return;
    }
    const hidden = Array.from({ length: TILE_COUNT }, (_, i) => i).filter((t) => !revealed.has(t));
    if (hidden.length === 0) return;
    reveal(hidden[Math.floor(Math.random() * hidden.length)]);
  };

  const cashOut = async () => {
    if (!round || locked) return;
    setBusy(true);
    try {
      const settled = await cashOutMinesRound(round.id);
      settle(settled, wonResult(settled));
    } catch (err) {
      Alert.alert('Cash out failed', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoMode = () => {
    if (locked || isPlaying) return;
    setAutoMode((on) => !on);
    setAutoTiles([]);
    clearBoard();
  };

  // Plays up to `autoRounds` rounds opening the selected tiles in order. A
  // stop request takes effect between rounds, so a round is never abandoned
  // half-open.
  const runAuto = async () => {
    if (locked) return;
    const tiles = [...autoTiles];
    if (tiles.length === 0) {
      Alert.alert('Pick your tiles', 'Tap the tiles you want opened every round, then start Auto Game.');
      return;
    }
    autoStopRef.current = false;
    setAutoRunning(true);
    try {
      for (let i = 0; i < autoRounds; i++) {
        if (autoStopRef.current || !mountedRef.current) break;
        setAutoLeft(autoRounds - i);
        let current = await startMinesRound(stake, mineCount);
        setRound(current);
        setHitTile(null);
        setResult(null);
        refreshWallet();

        let settled = false;
        for (const tile of tiles) {
          await sleep(AUTO_REVEAL_GAP_MS);
          const res = await revealMinesTile(current.id, tile);
          current = res.round;
          if (res.hitMine) {
            setHitTile(tile);
            settle(current, { kind: 'lost' });
            settled = true;
            break;
          }
          if (current.status === 'WON') {
            settle(current, wonResult(current));
            settled = true;
            break;
          }
          setRound(current);
        }
        if (!settled) {
          const cashed = await cashOutMinesRound(current.id);
          settle(cashed, wonResult(cashed));
        }
        await sleep(AUTO_ROUND_PAUSE_MS);
      }
    } catch (err) {
      if (mountedRef.current) Alert.alert('Auto Game stopped', errorMessage(err));
    } finally {
      if (mountedRef.current) {
        setAutoRunning(false);
        setAutoLeft(0);
      }
    }
  };

  const stopAuto = () => {
    autoStopRef.current = true;
    setAutoLeft(0);
  };

  const renderTile = (tile: number) => {
    const isRevealed = revealed.has(tile);
    const settled = round && !isPlaying;
    const isMine = mines.has(tile);
    const showContent = isRevealed || (settled && round?.minePositions);
    const dimmed = settled && !isRevealed;
    const isHit = tile === hitTile;
    const isSelected = autoMode && autoSelected.has(tile);
    const canPress = selectingTiles || (isPlaying && !isRevealed && !locked);

    return (
      <Pressable
        key={tile}
        onPress={() => onTilePress(tile)}
        disabled={!canPress}
        style={({ pressed }) => [
          styles.tile,
          isSelected && !showContent && styles.tileSelected,
          (pressed || tile === pendingTile) && !showContent && styles.tilePending,
          showContent && styles.tileOpen,
          isSelected && showContent && styles.tileSelectedOpen,
          isHit && styles.tileHit,
          dimmed && !isSelected && styles.tileDimmed,
        ]}
      >
        {showContent ? (
          isMine ? (
            <MaterialCommunityIcons name="bomb" size={TILE_HEIGHT * 0.56} color={isHit ? '#1B0A0E' : '#E6ECF7'} />
          ) : (
            <MaterialCommunityIcons name="diamond-stone" size={TILE_HEIGHT * 0.56} color="#35E0B0" />
          )
        ) : (
          <View style={[styles.tileDot, isSelected && styles.tileDotSelected]} />
        )}
      </Pressable>
    );
  };

  const renderMainButton = () => {
    if (autoRunning) {
      return (
        <Pressable onPress={stopAuto} style={[styles.mainBtn, styles.stopBtn, styles.mainBtnFlex]}>
          <Text style={styles.stopText}>{autoLeft > 0 ? `STOP AUTO (${autoLeft})` : 'STOPPING…'}</Text>
        </Pressable>
      );
    }
    if (isPlaying) {
      return (
        <Pressable
          onPress={cashOut}
          disabled={locked || revealedCount === 0}
          style={[styles.mainBtn, styles.cashOutBtn, styles.mainBtnFlex, revealedCount === 0 && styles.locked]}
        >
          <Text style={styles.cashOutText}>CASH OUT ₹{cashOutAmount.toFixed(2)}</Text>
        </Pressable>
      );
    }
    return (
      <Pressable onPress={autoMode ? runAuto : start} disabled={locked} style={[styles.mainBtnWrap, styles.mainBtnFlex]}>
        <LinearGradient colors={['#5FB012', '#3C8506']} style={[styles.mainBtn, styles.betBtn]}>
          <MaterialCommunityIcons name="play-outline" size={30} color="#FFFFFF" style={styles.betIcon} />
          <Text style={styles.betText}>{autoMode ? 'START AUTO' : 'BET'}</Text>
        </LinearGradient>
      </Pressable>
    );
  };

  const minesDropdownHeight = MINES_DROPDOWN_VISIBLE * (MINES_OPTION_HEIGHT + MINES_OPTION_GAP);

  return (
    <LinearGradient
      colors={['#0A3C98', '#0B5BD6']}
      style={styles.root}
      onLayout={(e) => setRootHeight(e.nativeEvent.layout.height)}
    >
      <View
        style={[styles.topBar, { paddingTop: insets.top + 8 }]}
        onLayout={(e) => setTopBarBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        <Pressable
          onPress={() => setPopover(popover === 'mines' ? null : 'mines')}
          onLayout={(e) => setMinesPillLayout(e.nativeEvent.layout)}
          disabled={isPlaying || autoRunning}
          style={[styles.minesPill, (isPlaying || autoRunning) && styles.locked]}
        >
          <Text style={styles.minesPillText}>Mines: {activeMines}</Text>
          <MaterialCommunityIcons name={popover === 'mines' ? 'chevron-up' : 'chevron-down'} size={22} color="#FFFFFF" />
        </Pressable>
        <View style={styles.nextPill}>
          <Text style={styles.nextPillText}>Next: {nextMultiplier !== null ? `${nextMultiplier.toFixed(2)}x` : '—'}</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(progress, 1) * 100}%` }]} />
      </View>

      <View style={styles.boardArea}>
        <View style={styles.board}>{Array.from({ length: TILE_COUNT }, (_, i) => renderTile(i))}</View>
        {result?.kind === 'won' && (
          <View style={styles.winWrap} pointerEvents="box-none">
            <View style={styles.winCard}>
              <Text style={styles.winMultiplier}>x{result.multiplier.toFixed(2)}</Text>
              <Text style={styles.winPayout}>₹{result.payout.toFixed(2)}</Text>
              {result.payout >= maxPayout && <Text style={styles.winNote}>Max win reached</Text>}
            </View>
            <Pressable onPress={() => setResult(null)} style={styles.winClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        )}
        {selectingTiles && autoTiles.length === 0 && (
          <Text style={styles.autoHint} pointerEvents="none">
            Tap tiles to pick them for Auto Game
          </Text>
        )}
      </View>

      <View style={styles.optionsRow}>
        <Pressable
          onPress={randomPick}
          disabled={!randomEnabled}
          style={[styles.randomBtn, !randomEnabled && styles.locked]}
        >
          <Text style={[styles.randomBtnText, randomEnabled && styles.randomBtnTextOn]} numberOfLines={1} adjustsFontSizeToFit>
            RANDOM
          </Text>
        </Pressable>
        <Pressable
          onPress={toggleAutoMode}
          disabled={locked || isPlaying}
          style={[styles.autoPill, (locked || isPlaying) && !autoMode && styles.locked]}
        >
          <MaterialCommunityIcons name="autorenew" size={24} color="#FFFFFF" />
          <Toggle value={autoMode} />
          <Text style={styles.autoPillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            Auto Game
          </Text>
        </Pressable>
      </View>

      <View style={styles.betPanel} onLayout={(e) => setBetPanelY(e.nativeEvent.layout.y)}>
        <View style={styles.actionRow} onLayout={(e) => setActionRowY(e.nativeEvent.layout.y)}>
          <Pressable
            onPress={() => setPopover(popover === 'autoRounds' ? null : 'autoRounds')}
            disabled={!autoMode || locked || isPlaying}
            style={[styles.autoPlayBtn, !autoMode && styles.locked]}
          >
            <MaterialCommunityIcons name="autorenew" size={40} color="#CFE0FA" />
            <MaterialCommunityIcons name="play" size={16} color="#CFE0FA" style={styles.autoPlayInner} />
            {autoMode && (
              <View style={styles.autoRoundsBadge}>
                <Text style={styles.autoRoundsBadgeText}>{autoRunning && autoLeft > 0 ? autoLeft : autoRounds}</Text>
              </View>
            )}
          </Pressable>
          {renderMainButton()}
        </View>

        <View style={styles.stakeRow} onLayout={(e) => setStakeRowY(e.nativeEvent.layout.y)}>
          <View style={styles.stakeBox}>
            <Text style={styles.stakeLabel}>Bet INR</Text>
            <TextInput
              style={styles.stakeInput}
              value={isPlaying && round ? Number(round.stake).toFixed(2) : stakeText}
              onChangeText={setStakeText}
              onBlur={commitStakeText}
              onSubmitEditing={commitStakeText}
              editable={!isPlaying && !autoRunning}
              keyboardType="decimal-pad"
              returnKeyType="done"
              selectTextOnFocus
              textAlign="center"
            />
          </View>
          <Pressable onPress={() => stepStake(-1)} disabled={isPlaying || autoRunning} style={styles.roundBtn}>
            <MaterialCommunityIcons name="minus" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => setPopover(popover === 'stake' ? null : 'stake')}
            disabled={isPlaying || autoRunning}
            style={styles.roundBtn}
          >
            <MaterialCommunityIcons name="database-outline" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={() => stepStake(1)} disabled={isPlaying || autoRunning} style={styles.roundBtn}>
            <MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.gamePill}>
          <MaterialCommunityIcons name="chevron-left" size={20} color="#FFFFFF" />
          <Text style={styles.gamePillText}>MINES</Text>
        </Pressable>
        <Pressable onPress={() => setRulesOpen(true)} style={styles.helpBtn}>
          <Text style={styles.helpText}>?</Text>
        </Pressable>
        <View style={styles.bottomSpacer} />
        <Text style={styles.balanceText}>
          {coins.toFixed(2)} <Text style={styles.balanceUnit}>INR</Text>
        </Text>
        <Pressable onPress={() => setHistoryOpen(true)} style={styles.menuBtn}>
          <MaterialCommunityIcons name="menu" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Popovers sit in the screen itself (no dimming), anchored to their
          buttons; tapping anywhere else closes them. */}
      {popover !== null && <Pressable style={StyleSheet.absoluteFill} onPress={() => setPopover(null)} />}

      {popover === 'mines' && minesPillLayout && (
        <View
          style={[
            styles.dropdown,
            {
              top: topBarBottom - 4,
              left: minesPillLayout.x,
              width: minesPillLayout.width + 12,
              height: minesDropdownHeight,
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.dropdownContent}
            contentOffset={{ x: 0, y: Math.max(0, (mineCount - 3) * (MINES_OPTION_HEIGHT + MINES_OPTION_GAP)) }}
            persistentScrollbar
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
              <Pressable
                key={n}
                onPress={() => chooseMines(n)}
                style={[styles.dropdownOption, n === mineCount && styles.dropdownOptionActive]}
              >
                <Text style={styles.dropdownOptionText}>{n}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {popover === 'stake' && rootHeight > 0 && (
        <View style={[styles.stakePopover, { bottom: rootHeight - (betPanelY + stakeRowY) + 8 }]}>
          <Text style={styles.popoverTitle}>Bet INR</Text>
          <View style={styles.popoverGrid}>
            {QUICK_STAKES.map((amount) => {
              const allowed = amount >= minStake && amount <= maxStake;
              return (
                <Pressable
                  key={amount}
                  disabled={!allowed}
                  onPress={() => {
                    setStakeValue(amount);
                    setPopover(null);
                  }}
                  style={[styles.popoverOption, stake === amount && styles.dropdownOptionActive, !allowed && styles.locked]}
                >
                  <Text style={styles.popoverOptionText}>{amount.toFixed(2)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {popover === 'autoRounds' && rootHeight > 0 && (
        <View style={[styles.stakePopover, { bottom: rootHeight - (betPanelY + actionRowY) + 8 }]}>
          <Text style={styles.popoverTitle}>Auto Game rounds</Text>
          <View style={styles.popoverGrid}>
            {AUTO_ROUND_OPTIONS.map((n) => (
              <Pressable
                key={n}
                onPress={() => {
                  setAutoRounds(n);
                  setPopover(null);
                }}
                style={[styles.popoverOption, styles.popoverOptionThird, n === autoRounds && styles.dropdownOptionActive]}
              >
                <Text style={styles.popoverOptionText}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {rulesOpen && rootHeight > 0 && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRulesOpen(false)} />
          <View
            style={[
              styles.rulesSheet,
              {
                bottom: rootHeight - (betPanelY + stakeRowY) + 8,
                maxHeight: betPanelY + stakeRowY - topBarBottom - 24,
              },
            ]}
          >
            <View style={styles.rulesHeader}>
              <Text style={styles.rulesTitle}>How to Play</Text>
              <Pressable onPress={() => setRulesOpen(false)} style={styles.rulesClose} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.rulesBody}>
              <View style={styles.rulesLogo}>
                <View style={styles.rulesLogoIcons}>
                  <MaterialCommunityIcons name="star-outline" size={24} color="#1FA3E0" style={styles.rulesLogoStarA} />
                  <MaterialCommunityIcons name="star-outline" size={20} color="#1FA3E0" style={styles.rulesLogoStarB} />
                  <MaterialCommunityIcons name="bomb" size={20} color="#1FA3E0" style={styles.rulesLogoBomb} />
                </View>
                <Text style={styles.rulesLogoText}>MINES</Text>
              </View>

              <View style={styles.demoBoard}>
                {Array.from({ length: TILE_COUNT }, (_, i) => {
                  if (i === DEMO_MINE) {
                    return (
                      <LinearGradient key={i} colors={['#FF3B4E', '#C4001F']} style={styles.demoTile}>
                        <MaterialCommunityIcons name="flare" size={DEMO_TILE * 0.55} color="#FFD23F" />
                      </LinearGradient>
                    );
                  }
                  if (DEMO_STARS.has(i)) {
                    return (
                      <LinearGradient key={i} colors={['#FFB431', '#F07E0C']} style={styles.demoTile}>
                        <MaterialCommunityIcons name="star" size={DEMO_TILE * 0.6} color="#FFF6E0" />
                      </LinearGradient>
                    );
                  }
                  return <View key={i} style={[styles.demoTile, styles.demoTilePlain]} />;
                })}
              </View>

              <Text style={styles.rulesText}>Each tile hides either a star or a mine.</Text>
              <Text style={styles.rulesText}>
                Increase the total number of stars for bigger odds and higher rewards. You can cash out after each turn,
                or try for increased winnings.
              </Text>
              <Text style={styles.rulesText}>
                Auto Game: switch it on, tap the tiles you want opened, choose the number of rounds and press Start
                Auto. Each round opens those tiles and cashes out if they are all safe.
              </Text>

              <Text style={styles.limitsTitle}>GAME LIMITS</Text>
              <Text style={styles.limitsIntro}>
                Game limits are managed by operator. Current game limits for this game are below:
              </Text>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>Maximum bet INR:</Text>
                <Text style={styles.limitValue}>{inr(maxStake)}</Text>
              </View>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>Minimum bet INR:</Text>
                <Text style={styles.limitValue}>{inr(minStake)}</Text>
              </View>
              {Number.isFinite(maxPayout) && (
                <View style={styles.limitRow}>
                  <Text style={styles.limitLabel}>Maximum win for one bet INR:</Text>
                  <Text style={styles.limitValue}>{inr(maxPayout)}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </>
      )}

      <Modal visible={historyOpen} transparent animationType="fade" onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.backdrop}>
          {/* Sibling, not parent, of the sheet so its ScrollView can scroll. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHistoryOpen(false)} />
          <View style={[styles.sheet, styles.historySheet]}>
            <Text style={styles.sheetTitle}>My bets</Text>
            <ScrollView>
              {history.length === 0 ? (
                <Text style={styles.historyEmpty}>No rounds yet.</Text>
              ) : (
                history.map((h) => {
                  const won = h.status === 'WON';
                  return (
                    <View key={h.id} style={styles.historyRow}>
                      <Text style={styles.historyMines}>{h.mineCount} mines</Text>
                      <Text style={styles.historyStake}>₹{Number(h.stake).toFixed(2)}</Text>
                      <Text style={[styles.historyResult, { color: won ? '#35E0B0' : '#FF5A6E' }]}>
                        {won ? `${Number(h.multiplier).toFixed(2)}x · ₹${Number(h.payout).toFixed(2)}` : 'BUST'}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(6, 40, 104, 0.55)',
  },
  minesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '42%',
    paddingVertical: 9,
    borderRadius: 22,
    backgroundColor: '#0D4C9C',
    borderWidth: 1.5,
    borderColor: '#0A3A7C',
  },
  minesPillText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  nextPill: { paddingHorizontal: 22, paddingVertical: 9, borderRadius: 22, backgroundColor: '#F5C21B' },
  nextPillText: { color: '#1A2B55', fontSize: 16, fontWeight: '600' },
  locked: { opacity: 0.55 },
  progressTrack: {
    height: 5,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 3,
    backgroundColor: 'rgba(8, 40, 100, 0.7)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#F5C21B' },
  boardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  board: { width: BOARD_WIDTH, flexDirection: 'row', flexWrap: 'wrap', gap: BOARD_GAP },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#0E3E7E',
    borderWidth: 1.5,
    borderColor: '#1D5AAD',
    borderBottomWidth: 4,
    borderBottomColor: '#0A2E63',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileOpen: { backgroundColor: '#0A2C62', borderBottomWidth: 1.5 },
  tileHit: { backgroundColor: '#E03A50', borderColor: '#FF7A8A' },
  tileDimmed: { opacity: 0.45 },
  tilePending: { backgroundColor: '#3E8BFF', transform: [{ scale: 0.92 }] },
  tileSelected: { backgroundColor: '#1C62C4', borderColor: '#F5C21B', borderBottomColor: '#B88A00' },
  tileSelectedOpen: { borderColor: '#F5C21B' },
  tileDot: {
    width: TILE_HEIGHT * 0.32,
    height: TILE_HEIGHT * 0.32,
    borderRadius: TILE_HEIGHT * 0.16,
    backgroundColor: '#3A78D4',
  },
  tileDotSelected: { backgroundColor: '#F5C21B' },
  winWrap: { position: 'absolute', alignItems: 'center' },
  winClose: {
    marginTop: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6, 30, 80, 0.92)',
    borderWidth: 2,
    borderColor: '#35E0B0',
  },
  winCard: {
    alignItems: 'center',
    paddingHorizontal: 34,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 30, 80, 0.92)',
    borderWidth: 2,
    borderColor: '#35E0B0',
  },
  winMultiplier: { color: '#35E0B0', fontSize: 30, fontWeight: '800' },
  winPayout: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 2 },
  winNote: { color: '#F5C21B', fontSize: 12, fontWeight: '700', marginTop: 4 },
  autoHint: { position: 'absolute', bottom: 12, color: '#CFE0FA', fontSize: 14, fontWeight: '600' },
  optionsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 12, marginBottom: 12 },
  randomBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D58B8',
    borderWidth: 1.5,
    borderColor: '#0A3F86',
  },
  randomBtnText: { color: '#8FB8F0', fontSize: 18, fontWeight: '600', letterSpacing: 0.5 },
  randomBtnTextOn: { color: '#FFFFFF' },
  autoPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: '#0A3F86',
    overflow: 'hidden',
  },
  autoPillText: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  toggleTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    padding: 3,
    backgroundColor: '#5D6C86',
    justifyContent: 'center',
  },
  toggleTrackOn: { backgroundColor: '#5FB012' },
  toggleKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF' },
  toggleKnobOn: { alignSelf: 'flex-end' },
  betPanel: {
    marginHorizontal: 6,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#0A4696',
    gap: 14,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  autoPlayBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1560C8',
    borderWidth: 3,
    borderColor: '#082C66',
  },
  autoPlayInner: { position: 'absolute' },
  autoRoundsBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 24,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5C21B',
  },
  autoRoundsBadgeText: { color: '#1A2B55', fontSize: 11, fontWeight: '800' },
  mainBtnFlex: { flex: 1 },
  mainBtnWrap: { borderRadius: 30 },
  mainBtn: {
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#10240A',
  },
  betBtn: { flexDirection: 'row' },
  betIcon: { position: 'absolute', left: 22 },
  betText: { color: '#EAF6DC', fontSize: 20, fontWeight: '600', letterSpacing: 0.5 },
  cashOutBtn: { backgroundColor: '#F5C21B', borderColor: '#6B4E00' },
  cashOutText: { color: '#1A2B55', fontSize: 18, fontWeight: '800' },
  stopBtn: { backgroundColor: '#E8102F', borderColor: '#5A0010' },
  stopText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  stakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 34,
    backgroundColor: '#0D4E9E',
    borderWidth: 1.5,
    borderColor: '#0A3A7C',
  },
  stakeBox: { flex: 1, alignItems: 'center' },
  stakeLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  stakeInput: {
    alignSelf: 'stretch',
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#0A3A78',
    textAlign: 'center',
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0A3A7C',
    backgroundColor: '#0D56B0',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: '#0A4696',
  },
  gamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34%',
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#0D56B0',
    borderWidth: 1.5,
    borderColor: '#0A3A7C',
  },
  gamePillText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  helpBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F28C12',
    borderWidth: 1.5,
    borderColor: '#7A3E00',
  },
  helpText: { color: '#3A1C00', fontSize: 16, fontWeight: '800' },
  bottomSpacer: { flex: 1 },
  balanceText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  balanceUnit: { color: '#8FB8F0', fontSize: 14, fontWeight: '500' },
  menuBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D56B0',
    borderWidth: 1.5,
    borderColor: '#0A3A7C',
  },
  // Mines dropdown
  dropdown: {
    position: 'absolute',
    borderRadius: 12,
    backgroundColor: '#0A3163',
    borderWidth: 1,
    borderColor: '#072750',
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  dropdownContent: { paddingHorizontal: 14, paddingVertical: MINES_OPTION_GAP / 2 + 6 },
  dropdownOption: {
    height: MINES_OPTION_HEIGHT,
    marginVertical: MINES_OPTION_GAP / 2,
    borderRadius: MINES_OPTION_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C3F7A',
    borderWidth: 1,
    borderColor: '#0A3468',
  },
  dropdownOptionActive: { backgroundColor: '#1768C9', borderColor: '#2A7FE0' },
  dropdownOptionText: { color: '#FFFFFF', fontSize: 17, fontWeight: '500' },
  // Quick-bet / auto rounds popover
  stakePopover: {
    position: 'absolute',
    left: '9%',
    right: '9%',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#0A3163',
    borderWidth: 1,
    borderColor: '#072750',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  popoverTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '500', textAlign: 'center', marginBottom: 12 },
  popoverGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  popoverOption: {
    width: '48%',
    flexGrow: 1,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C3F7A',
    borderWidth: 1,
    borderColor: '#0A3468',
  },
  popoverOptionThird: { width: '30%' },
  popoverOptionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  // How to Play / Game limits sheet
  rulesSheet: {
    position: 'absolute',
    left: 8,
    right: 8,
    borderRadius: 22,
    backgroundColor: '#212327',
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#34363C',
  },
  rulesTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  rulesClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16181B',
    borderWidth: 1,
    borderColor: '#4A4D55',
  },
  rulesBody: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  rulesLogo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  rulesLogoIcons: { width: 46, height: 46 },
  rulesLogoStarA: { position: 'absolute', top: 0, right: 2 },
  rulesLogoStarB: { position: 'absolute', top: 12, left: 0 },
  rulesLogoBomb: { position: 'absolute', bottom: 0, left: 16 },
  rulesLogoText: { color: '#FFFFFF', fontSize: 28, fontWeight: '400' },
  demoBoard: {
    width: DEMO_TILE * 5 + DEMO_GAP * 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: DEMO_GAP,
    alignSelf: 'center',
    marginVertical: 26,
  },
  demoTile: {
    width: DEMO_TILE,
    height: DEMO_TILE,
    borderRadius: DEMO_TILE * 0.22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoTilePlain: {
    backgroundColor: '#F2F5FA',
    shadowColor: '#4FA3FF',
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 3,
  },
  rulesText: { color: '#E6E7EA', fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 12 },
  limitsTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', marginTop: 16, marginBottom: 12 },
  limitsIntro: { color: '#B9BBC1', fontSize: 15, lineHeight: 21, marginBottom: 12 },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
    borderRadius: 10,
    backgroundColor: '#17181B',
  },
  limitLabel: { flex: 1, color: '#C9CBD0', fontSize: 15 },
  limitValue: {
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#4A4E5A',
  },
  // My bets modal
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 18, padding: 18, backgroundColor: '#0A3F8C' },
  sheetTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 14, textAlign: 'center' },
  historySheet: { maxHeight: '70%' },
  historyEmpty: { color: '#8FB8F0', textAlign: 'center', paddingVertical: 20 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1D5AAD',
  },
  historyMines: { color: '#FFFFFF', fontSize: 14, width: 80 },
  historyStake: { color: '#8FB8F0', fontSize: 14, flex: 1 },
  historyResult: { fontSize: 14, fontWeight: '700' },
});
