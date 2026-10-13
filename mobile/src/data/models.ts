import { ComponentProps } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type User = {
  id: string;
  username: string;
  avatarInitial: string;
  avatarColor: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  vipLevel: number;
  gamesPlayed: number;
  gamesWon: number;
};

export type TransactionType = 'earn' | 'spend';

export type WalletTransaction = {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  icon: IconName;
  timestamp: string;
  timestampISO: string;
  /** Only meaningful for withdrawals — PENDING (awaiting admin approval)
   * or FAILED (rejected & refunded) get a status badge in History; other
   * transaction types are always COMPLETED. */
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
};

export type GameCategoryId =
  | 'arcade'
  | 'puzzle'
  | 'racing'
  | 'sports'
  | 'adventure'
  | 'strategy'
  | 'casual'
  | 'multiplayer';

export type GameCategory = {
  id: GameCategoryId;
  name: string;
  icon: IconName;
  gradient: readonly [string, string];
};

export type Game = {
  id: string;
  title: string;
  categoryId: GameCategoryId;
  icon: IconName;
  gradient: readonly [string, string];
  players: number;
  rating: number;
  sizeMb: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  description: string;
  rewardMin: number;
  rewardMax: number;
  featured?: boolean;
};

export type Mission = {
  id: string;
  title: string;
  icon: IconName;
  progress: number;
  target: number;
  reward: number;
  claimed: boolean;
};

export type DailyRewardDay = {
  day: number;
  amount: number;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: IconName;
  target: number;
  progress: number;
};

export type VipBonusRecord = {
  id: string;
  title: string;
  amount: number;
  timestampISO: string;
};

export type VipLevelDef = {
  level: number;
  xpRequired: number;
  icon: IconName;
  gradient: readonly [string, string, string];
  weeklyBonus?: number;
  upgradeBonus?: number;
};

export type AppNotification = {
  id: string;
  icon: IconName;
  title: string;
  timestamp: string;
  read: boolean;
};
