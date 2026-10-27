import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useGameState } from '../state/GameStateContext';
import { colors } from '../theme';
import { showAlert } from './AppAlert';

/**
 * Pull down on any game to reload it: the game screen is mounted afresh
 * (its round, config, history and bets are fetched again, like closing and
 * opening it) and the wallet is refreshed. Wraps the screen in an outer
 * ScrollView with a RefreshControl; the screens' own vertical ScrollViews
 * are nestedScrollEnabled, so a pull only refreshes once they are at the top.
 *
 * A screen can hold a refresh back with usePullToRefresh: `blockedReason`
 * while reloading would hide something live (a crash-game bet in the air:
 * the screen does not bring it back on reload), `disabled` while the screen
 * uses downward drags itself (scratching a card, pulling a lever).
 */
type Rules = { blockedReason: string | null; disabled: boolean };
type Ctl = { rules: React.MutableRefObject<Rules>; setDisabled: (v: boolean) => void };
const Ctx = createContext<Ctl | null>(null);

export function usePullToRefresh({ blockedReason = null, disabled = false }: { blockedReason?: string | null; disabled?: boolean }) {
  const ctl = useContext(Ctx);
  useEffect(() => {
    if (!ctl) return;
    ctl.rules.current = { blockedReason, disabled };
    ctl.setDisabled(disabled);
  }, [ctl, blockedReason, disabled]);
  useEffect(
    () => () => {
      if (!ctl) return;
      ctl.rules.current = { blockedReason: null, disabled: false };
      ctl.setDisabled(false);
    },
    [ctl]
  );
}

export function withPullToRefresh<P extends object>(Screen: React.ComponentType<P>) {
  function PullToRefreshScreen(props: P) {
    const { refreshWallet } = useGameState();
    const rules = useRef<Rules>({ blockedReason: null, disabled: false });
    const [disabled, setDisabled] = useState(false);
    const [generation, setGeneration] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const ctl = useRef<Ctl>({ rules, setDisabled }).current;

    const onRefresh = useCallback(async () => {
      const blocked = rules.current.blockedReason;
      if (blocked) {
        showAlert('Round in progress', blocked, undefined, { kind: 'info' });
        return;
      }
      setRefreshing(true);
      setGeneration((g) => g + 1);
      try {
        await refreshWallet();
      } catch {
        // The screen shows its own error if the server can't be reached.
      } finally {
        setRefreshing(false);
      }
    }, [refreshWallet]);

    return (
      <Ctx.Provider value={ctl}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.grow}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              enabled={!disabled}
              colors={[colors.gold]}
              tintColor={colors.gold}
              progressBackgroundColor={colors.surface}
            />
          }
        >
          <Screen key={generation} {...props} />
        </ScrollView>
      </Ctx.Provider>
    );
  }
  PullToRefreshScreen.displayName = `PullToRefresh(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return PullToRefreshScreen;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
});
