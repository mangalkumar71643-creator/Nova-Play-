import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { initialAchievements, initialMissions, initialNotifications } from '../data/mockData';
import { Achievement, AppNotification, Mission, User, VipBonusRecord, WalletTransaction } from '../data/models';
import { fetchUser } from '../services/userService';
import { fetchWallet } from '../services/walletService';
import { claimBackendDailyBonus, fetchDailyBonusStatus } from '../api/backend';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'novaplay:progress:v2';

// Cosmetic-only state: missions, notifications, favorites and VIP bonus
// history/claims are NOT wired to the backend wallet. They used to grant
// coins directly on the client, which is unsafe once coins are real money
// (nothing stops a modified client from calling them arbitrarily) — so for
// now claiming them just updates local UI state with no wallet effect.
// Wire them to real, server-verified progress before re-enabling payouts.
type PersistedState = {
  missions: Mission[];
  notifications: AppNotification[];
  favoriteGameIds: string[];
  vipBonusHistory: VipBonusRecord[];
  claimedVipBonuses: string[];
};

type GameState = {
  loading: boolean;
  user: User | null;
  coins: number;
  withdrawable: number;
  lockedBonus: number;
  wageringRequired: number;
  wageringProgress: number;
  payoutAccountHolderName: string | null;
  payoutAccountNumber: string | null;
  payoutIfsc: string | null;
  hasPayoutAccount: boolean;
  firstDepositBonusClaimed: boolean;
  dailyWithdrawalLimit: number;
  remainingWithdrawalLimit: number;
  transactions: WalletTransaction[];
  missions: Mission[];
  achievements: Achievement[];
  notifications: AppNotification[];
  streak: number;
  claimedToday: boolean;
  favoriteGameIds: string[];
  vipBonusHistory: VipBonusRecord[];
  refreshWallet: () => Promise<void>;
  claimMission: (missionId: string) => void;
  claimDailyReward: () => Promise<{ amount: number; streak: number } | null>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  toggleFavoriteGame: (gameId: string) => void;
  isVipBonusClaimed: (level: number, type: 'weekly' | 'upgrade') => boolean;
  claimVipBonus: (level: number, type: 'weekly' | 'upgrade', title: string, amount: number) => boolean;
};

const GameStateContext = createContext<GameState | undefined>(undefined);

export function GameStateProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [coins, setCoins] = useState(0);
  const [withdrawable, setWithdrawable] = useState(0);
  const [lockedBonus, setLockedBonus] = useState(0);
  const [wageringRequired, setWageringRequired] = useState(0);
  const [wageringProgress, setWageringProgress] = useState(0);
  const [payoutAccountHolderName, setPayoutAccountHolderName] = useState<string | null>(null);
  const [payoutAccountNumber, setPayoutAccountNumber] = useState<string | null>(null);
  const [payoutIfsc, setPayoutIfsc] = useState<string | null>(null);
  const [hasPayoutAccount, setHasPayoutAccount] = useState(false);
  const [firstDepositBonusClaimed, setFirstDepositBonusClaimed] = useState(false);
  const [dailyWithdrawalLimit, setDailyWithdrawalLimit] = useState(0);
  const [remainingWithdrawalLimit, setRemainingWithdrawalLimit] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [achievements] = useState<Achievement[]>(initialAchievements);
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications);
  const [streak, setStreak] = useState(0);
  const [claimedToday, setClaimedToday] = useState(false);
  const [favoriteGameIds, setFavoriteGameIds] = useState<string[]>(['g-neon-rush', 'g-sky-glider', 'g-match-reels', 'g-peak-climb']);
  const [vipBonusHistory, setVipBonusHistory] = useState<VipBonusRecord[]>([]);
  const [claimedVipBonuses, setClaimedVipBonuses] = useState<string[]>([]);

  const refreshWallet = useCallback(async () => {
    const [wallet, dailyStatus] = await Promise.all([fetchWallet(), fetchDailyBonusStatus()]);
    setCoins(wallet.coins);
    setWithdrawable(wallet.withdrawable);
    setLockedBonus(wallet.lockedBonus);
    setWageringRequired(wallet.wageringRequired);
    setWageringProgress(wallet.wageringProgress);
    setPayoutAccountHolderName(wallet.payoutAccountHolderName);
    setPayoutAccountNumber(wallet.payoutAccountNumber);
    setPayoutIfsc(wallet.payoutIfsc);
    setHasPayoutAccount(wallet.hasPayoutAccount);
    setFirstDepositBonusClaimed(wallet.firstDepositBonusClaimed);
    setDailyWithdrawalLimit(wallet.dailyWithdrawalLimit);
    setRemainingWithdrawalLimit(wallet.remainingWithdrawalLimit);
    setTransactions(wallet.transactions);
    setStreak(dailyStatus.dailyStreak);
    setClaimedToday(dailyStatus.claimedToday);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const [persistedRaw, fetchedUser] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        fetchUser(),
      ]);
      if (cancelled) return;

      setUser(fetchedUser);
      await refreshWallet().catch(() => {
        // Not authenticated against the backend yet — the effect below
        // re-fetches once AuthContext flips isAuthenticated to true.
      });

      if (persistedRaw) {
        try {
          const persisted = JSON.parse(persistedRaw) as PersistedState;
          setMissions(persisted.missions);
          setNotifications(persisted.notifications);
          setFavoriteGameIds(persisted.favoriteGameIds);
          setVipBonusHistory(persisted.vipBonusHistory ?? []);
          setClaimedVipBonuses(persisted.claimedVipBonuses ?? []);
        } catch {
          // ignore corrupt storage, defaults already set
        }
      }
      if (!cancelled) setLoading(false);
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshWallet]);

  // GameStateProvider mounts once (above RootNavigator) and doesn't
  // remount when login/logout flips isAuthenticated, so the wallet needs
  // its own effect to re-sync with the backend on that transition —
  // otherwise a freshly logged-in user would see a stale/zero balance
  // until some other screen happened to call refreshWallet().
  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) {
      refreshWallet().catch(() => {});
    } else {
      setCoins(0);
      setWithdrawable(0);
      setLockedBonus(0);
      setWageringRequired(0);
      setWageringProgress(0);
      setPayoutAccountHolderName(null);
      setPayoutAccountNumber(null);
      setPayoutIfsc(null);
      setHasPayoutAccount(false);
      setFirstDepositBonusClaimed(false);
      setDailyWithdrawalLimit(0);
      setRemainingWithdrawalLimit(0);
      setTransactions([]);
      setStreak(0);
      setClaimedToday(false);
    }
  }, [isAuthenticated, loading, refreshWallet]);

  useEffect(() => {
    if (loading) return;
    const persisted: PersistedState = {
      missions,
      notifications,
      favoriteGameIds,
      vipBonusHistory,
      claimedVipBonuses,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => {});
  }, [loading, missions, notifications, favoriteGameIds, vipBonusHistory, claimedVipBonuses]);

  // Cosmetic only — see the PersistedState comment above. Marks progress
  // as claimed but does not touch the (backend-authoritative) wallet.
  const claimMission = useCallback((missionId: string) => {
    setMissions((prev) => {
      const mission = prev.find((m) => m.id === missionId);
      if (!mission || mission.claimed || mission.progress < mission.target) return prev;
      return prev.map((m) => (m.id === missionId ? { ...m, claimed: true } : m));
    });
  }, []);

  const claimDailyReward = useCallback(async (): Promise<{ amount: number; streak: number } | null> => {
    if (claimedToday) return null;
    const result = await claimBackendDailyBonus();
    await refreshWallet();
    return { amount: result.amount, streak: result.streak };
  }, [claimedToday, refreshWallet]);

  // Cosmetic only — see the PersistedState comment above.
  const isVipBonusClaimed = useCallback(
    (level: number, type: 'weekly' | 'upgrade') => claimedVipBonuses.includes(`${level}-${type}`),
    [claimedVipBonuses]
  );

  const claimVipBonus = useCallback(
    (level: number, type: 'weekly' | 'upgrade', title: string, amount: number) => {
      const key = `${level}-${type}`;
      if (claimedVipBonuses.includes(key)) return false;
      setClaimedVipBonuses((prev) => [...prev, key]);
      setVipBonusHistory((prev) => [
        { id: `vb-${Date.now()}-${Math.round(Math.random() * 1000)}`, title, amount, timestampISO: new Date().toISOString() },
        ...prev,
      ]);
      return true;
    },
    [claimedVipBonuses]
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const toggleFavoriteGame = useCallback((gameId: string) => {
    setFavoriteGameIds((prev) => (prev.includes(gameId) ? prev.filter((id) => id !== gameId) : [...prev, gameId]));
  }, []);

  const value: GameState = {
    loading,
    user,
    coins,
    withdrawable,
    lockedBonus,
    wageringRequired,
    wageringProgress,
    payoutAccountHolderName,
    payoutAccountNumber,
    payoutIfsc,
    hasPayoutAccount,
    firstDepositBonusClaimed,
    dailyWithdrawalLimit,
    remainingWithdrawalLimit,
    transactions,
    missions,
    achievements,
    notifications,
    streak,
    claimedToday,
    favoriteGameIds,
    vipBonusHistory,
    refreshWallet,
    claimMission,
    claimDailyReward,
    markNotificationRead,
    markAllNotificationsRead,
    toggleFavoriteGame,
    isVipBonusClaimed,
    claimVipBonus,
  };

  return <GameStateContext.Provider value={value}>{children}</GameStateContext.Provider>;
}

export function useGameState(): GameState {
  const ctx = useContext(GameStateContext);
  if (!ctx) throw new Error('useGameState must be used within GameStateProvider');
  return ctx;
}
