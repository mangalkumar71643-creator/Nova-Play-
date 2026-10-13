import { WalletTransaction } from '../data/models';
import { IconName } from '../data/models';
import {
  BackendTransaction,
  BackendWallet,
  depositToWallet,
  fetchBackendTransactions,
  fetchBackendWallet,
  setPayoutBankAccount as setPayoutBankAccountRequest,
  withdrawFromWallet,
} from '../api/backend';

const TX_ICONS: Record<BackendTransaction['type'], IconName> = {
  DEPOSIT: 'bank-transfer-in',
  WITHDRAWAL: 'bank-transfer-out',
  BET_STAKE: 'ticket-outline',
  BET_PAYOUT: 'trophy-outline',
  BET_REFUND: 'cash-refund',
  GAME_STAKE: 'controller-classic-outline',
  GAME_PAYOUT: 'trophy-outline',
  BONUS: 'gift-outline',
  DEPOSIT_BONUS: 'gift-outline',
  WITHDRAWAL_REVERSAL: 'bank-transfer',
};

const TX_TITLES: Record<BackendTransaction['type'], string> = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  BET_STAKE: 'Bet placed',
  BET_PAYOUT: 'Bet won',
  BET_REFUND: 'Bet refunded',
  GAME_STAKE: 'Game stake',
  GAME_PAYOUT: 'Game win',
  BONUS: 'Bonus credit',
  DEPOSIT_BONUS: 'Deposit bonus',
  WITHDRAWAL_REVERSAL: 'Withdrawal reversed',
};

const CREDIT_TYPES = new Set<BackendTransaction['type']>([
  'DEPOSIT',
  'BET_PAYOUT',
  'GAME_PAYOUT',
  'BONUS',
  'BET_REFUND',
  'DEPOSIT_BONUS',
  'WITHDRAWAL_REVERSAL',
]);

function mapTransaction(tx: BackendTransaction): WalletTransaction {
  const signedAmount = CREDIT_TYPES.has(tx.type) ? Number(tx.amount) : -Number(tx.amount);
  const created = new Date(tx.createdAt);
  return {
    id: tx.id,
    title: TX_TITLES[tx.type],
    amount: signedAmount,
    type: signedAmount >= 0 ? 'earn' : 'spend',
    icon: TX_ICONS[tx.type],
    timestamp: created.toLocaleString(),
    timestampISO: tx.createdAt,
    status: tx.status,
  };
}

export interface WalletSummary {
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
}

function toSummary(wallet: BackendWallet, transactions: WalletTransaction[]): WalletSummary {
  return {
    coins: Number(wallet.balance),
    withdrawable: wallet.withdrawable,
    lockedBonus: Number(wallet.lockedBonus),
    wageringRequired: Number(wallet.wageringRequired),
    wageringProgress: Number(wallet.wageringProgress),
    payoutAccountHolderName: wallet.payoutAccountHolderName,
    payoutAccountNumber: wallet.payoutAccountNumber,
    payoutIfsc: wallet.payoutIfsc,
    hasPayoutAccount: wallet.hasPayoutAccount,
    firstDepositBonusClaimed: wallet.firstDepositBonusClaimed,
    dailyWithdrawalLimit: wallet.dailyWithdrawalLimit,
    remainingWithdrawalLimit: wallet.remainingWithdrawalLimit,
    transactions,
  };
}

/** Real wallet balance + transaction history from the backend — this is
 * the money-authoritative source; nothing in the app should mutate coins
 * locally anymore. */
export async function fetchWallet(): Promise<WalletSummary> {
  const [wallet, transactions] = await Promise.all([fetchBackendWallet(), fetchBackendTransactions()]);
  return toSummary(wallet, transactions.map(mapTransaction));
}

/** Returns the new balance plus how much first-deposit bonus (if any) was
 * granted by this deposit, so the UI can show what actually landed. */
export async function deposit(amount: number): Promise<{ newBalance: number; bonusGranted: number }> {
  const result = await depositToWallet(amount);
  return { newBalance: Number(result.balance), bonusGranted: result.bonusGranted };
}

/** Withdrawals now go to PENDING until an admin approves them (see
 * backend/public/admin.html) — this returns the new balance (already
 * reduced, so the amount can't be double-spent while pending). */
export async function withdraw(amount: number): Promise<number> {
  const wallet = await withdrawFromWallet(amount);
  return Number(wallet.balance);
}

export async function setPayoutBankAccount(accountHolderName: string, accountNumber: string, ifsc: string): Promise<void> {
  await setPayoutBankAccountRequest(accountHolderName, accountNumber, ifsc);
}
