import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, StyleSheet, View } from 'react-native';
import { useGameState } from '../state/GameStateContext';
import { colors } from '../theme';
import { showAlert } from './AppAlert';

/**
 * Pull down on any game to reload it: the game screen is mounted afresh
 * (its round, config, history and bets are fetched again, like closing and
 * opening it) and the wallet is refreshed.
 *
 * The pull starts at the top of the screen (TOP_ZONE) and must be a clear
 * downward drag. It is caught only once the finger has moved that far, so
 * a tap — even one where the finger slips a little — always reaches the
 * button under it. (An outer ScrollView with a RefreshControl, used before,
 * took over every touch that moved a few pixels and swallowed those taps:
 * "Big"/"Small" and Aviator's Bet sometimes did nothing.)
 *
 * A screen can hold a refresh back with usePullToRefresh: `blockedReason`
 * while reloading would hide something live (a crash-game bet in the air:
 * the screen does not bring it back on reload), `disabled` while the screen
 * uses downward drags itself (scratching a card, pulling a lever).
 */
type Rules = { blockedReason: string | null; disabled: boolean };
type Ctl = { rules: React.MutableRefObject<Rules> };
const Ctx = createContext<Ctl | null>(null);

/** Where a pull may start, from the top of the screen. */
const TOP_ZONE = 140;
/** Movement before the pull takes the touch (a tap moves far less). */
const START_AFTER = 18;
/** How far to pull before letting go reloads. */
const TRIGGER = 80;
const MAX_PULL = 130;

export function usePullToRefresh({ blockedReason = null, disabled = false }: { blockedReason?: string | null; disabled?: boolean }) {
  const ctl = useContext(Ctx);
  useEffect(() => {
    if (!ctl) return;
    ctl.rules.current = { blockedReason, disabled };
  }, [ctl, blockedReason, disabled]);
  useEffect(
    () => () => {
      if (!ctl) return;
      ctl.rules.current = { blockedReason: null, disabled: false };
    },
    [ctl]
  );
}

export function withPullToRefresh<P extends object>(Screen: React.ComponentType<P>) {
  function PullToRefreshScreen(props: P) {
    const { refreshWallet } = useGameState();
    const rules = useRef<Rules>({ blockedReason: null, disabled: false });
    const [generation, setGeneration] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const refreshingRef = useRef(false);
    const pull = useRef(new Animated.Value(0)).current;
    const ctl = useRef<Ctl>({ rules }).current;

    const settle = useCallback(() => {
      Animated.timing(pull, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }, [pull]);

    const onRefresh = useCallback(async () => {
      const blocked = rules.current.blockedReason;
      if (blocked) {
        settle();
        showAlert('Round in progress', blocked, undefined, { kind: 'info' });
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      Animated.timing(pull, { toValue: TRIGGER * 0.7, duration: 120, useNativeDriver: true }).start();
      setGeneration((g) => g + 1);
      try {
        await refreshWallet();
      } catch {
        // The screen shows its own error if the server can't be reached.
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
        settle();
      }
    }, [refreshWallet, pull, settle]);

    const responder = useMemo(
      () =>
        PanResponder.create({
          // Never on touch-down, so taps are left alone; only a clear pull down from the top.
          onMoveShouldSetPanResponderCapture: (_e, g) =>
            !rules.current.disabled && !refreshingRef.current && g.y0 < TOP_ZONE && g.dy > START_AFTER && g.dy > Math.abs(g.dx) * 1.5,
          onPanResponderMove: (_e, g) => pull.setValue(Math.max(0, Math.min(MAX_PULL, g.dy - START_AFTER))),
          onPanResponderRelease: (_e, g) => {
            if (g.dy - START_AFTER >= TRIGGER) onRefresh();
            else settle();
          },
          onPanResponderTerminate: settle,
          onPanResponderTerminationRequest: () => false,
        }),
      [pull, onRefresh, settle]
    );

    const opacity = pull.interpolate({ inputRange: [0, 30, TRIGGER], outputRange: [0, 0.6, 1], extrapolate: 'clamp' });
    const rotate = pull.interpolate({ inputRange: [0, TRIGGER], outputRange: ['0deg', '270deg'], extrapolate: 'clamp' });

    return (
      <Ctx.Provider value={ctl}>
        <View style={styles.fill} {...responder.panHandlers}>
          <Screen key={generation} {...props} />
          <Animated.View pointerEvents="none" style={[styles.indicator, { opacity, transform: [{ translateY: pull }] }]}>
            {refreshing ? (
              <ActivityIndicator color={colors.gold} />
            ) : (
              <Animated.View style={{ transform: [{ rotate }] }}>
                <MaterialCommunityIcons name="refresh" size={24} color={colors.gold} />
              </Animated.View>
            )}
          </Animated.View>
        </View>
      </Ctx.Provider>
    );
  }
  PullToRefreshScreen.displayName = `PullToRefresh(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return PullToRefreshScreen;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  indicator: {
    position: 'absolute',
    top: 4,
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
});
