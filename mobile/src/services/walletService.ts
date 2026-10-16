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
  WithdrawalFee,
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
  // StockPay's hosted UPI checkout deposits get their own label/icon so a
  // player can tell a UPI deposit apart from an admin credit at a glance.
  const isUpiDeposit = tx.type === 'DEPOSIT' && (tx.provider === 'stockpay' || tx.provider === 'stockpay_live');
  return {
    id: tx.id,
    title: isUpiDeposit ? 'UPI Deposit' : TX_TITLES[tx.type],
    amount: signedAmount,
    type: signedAmount >= 0 ? 'earn' : 'spend',
    icon: isUpiDeposit ? 'contactless-payment' : TX_ICONS[tx.type],
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
  vipLevel: number;
  freeWithdrawalsPerDay: number;
  freeWithdrawalsLeft: number;
  withdrawalFee: WithdrawalFee | null;
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
    vipLevel: wallet.vipLevel ?? 0,
    // An older server charges no fee at all: every withdrawal is free.
    freeWithdrawalsPerDay: wallet.freeWithdrawalsPerDay ?? 0,
    freeWithdrawalsLeft: wallet.freeWithdrawalsLeft ?? Number.POSITIVE_INFINITY,
    withdrawalFee: wallet.withdrawalFee ?? null,
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
 * reduced, so the amount can't be double-spent while pending), the fee kept
 * back and what goes to the bank. */
export async function withdraw(amount: number): Promise<{ balance: number; fee: number; payout: number }> {
  const wallet = await withdrawFromWallet(amount);
  const fee = wallet.fee ?? 0;
  return { balance: Number(wallet.balance), fee, payout: wallet.payout ?? amount - fee };
}

export async function setPayoutBankAccount(accountHolderName: string, accountNumber: string, ifsc: string): Promise<void> {
  await setPayoutBankAccountRequest(accountHolderName, accountNumber, ifsc);
}
