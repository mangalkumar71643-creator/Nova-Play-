import { apiFetch } from './client';

export interface BackendUser {
  id: string;
  // Short public-facing account number ("UID" in the UI) — a 5-digit
  // number unique per account, separate from the internal `id` above.
  uid: number | null;
  phone: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  kycStatus: 'NOT_STARTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  isSelfExcluded: boolean;
  selfExclusionUntil: string | null;
  depositLimitDaily: string | null;
  depositLimitWeekly: string | null;
  depositLimitMonthly: string | null;
  role: 'USER' | 'ADMIN';
}

export interface AuthResult {
  user: BackendUser;
  token: string;
  isNewUser: boolean;
}

export function fetchBackendMe() {
  return apiFetch<BackendUser>('/auth/me');
}

export interface OtpRequestResult {
  /** Only present when the backend's SMS_PROVIDER_MODE=mock — shows the
   * code on-screen for local testing since no real SMS is sent. */
  devCode: string | null;
}

export function requestPhoneOtp(phone: string) {
  return apiFetch<OtpRequestResult>('/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export function verifyPhoneOtp(phone: string, code: string) {
  return apiFetch<AuthResult>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
}

export function completePhoneProfile(input: {
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
}) {
  return apiFetch<AuthResult>('/auth/otp/complete-profile', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface BackendWallet {
  id: string;
  balance: string;
  currency: string;
  lockedBonus: string;
  wageringRequired: string;
  wageringProgress: string;
  payoutAccountHolderName: string | null;
  payoutAccountNumber: string | null;
  payoutIfsc: string | null;
  hasPayoutAccount: boolean;
  firstDepositBonusClaimed: boolean;
  withdrawable: number;
  dailyWithdrawalLimit: number;
  remainingWithdrawalLimit: number;
}

export interface DepositResult extends BackendWallet {
  bonusGranted: number;
}

export function fetchBackendWallet() {
  return apiFetch<BackendWallet>('/wallet');
}

export interface BackendTransaction {
  id: string;
  type:
    | 'DEPOSIT'
    | 'WITHDRAWAL'
    | 'BET_STAKE'
    | 'BET_PAYOUT'
    | 'BET_REFUND'
    | 'GAME_STAKE'
    | 'GAME_PAYOUT'
    | 'BONUS'
    | 'DEPOSIT_BONUS'
    | 'WITHDRAWAL_REVERSAL';
  amount: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
}

export function fetchBackendTransactions() {
  return apiFetch<BackendTransaction[]>('/wallet/transactions');
}

export function depositToWallet(amount: number) {
  return apiFetch<DepositResult>('/wallet/deposit', { method: 'POST', body: JSON.stringify({ amount }) });
}

export function withdrawFromWallet(amount: number) {
  return apiFetch<BackendWallet>('/wallet/withdraw', { method: 'POST', body: JSON.stringify({ amount }) });
}

export function setPayoutBankAccount(accountHolderName: string, accountNumber: string, ifsc: string) {
  return apiFetch<BackendWallet>('/wallet/payout-account', {
    method: 'PUT',
    body: JSON.stringify({ accountHolderName, accountNumber, ifsc }),
  });
}

export interface SupportTicketResult {
  id: string;
  topic: string;
  message: string | null;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
}

export function escalateSupportTicket(topic: string, message?: string) {
  return apiFetch<SupportTicketResult>('/support/escalate', {
    method: 'POST',
    body: JSON.stringify({ topic, message }),
  });
}

/** Mints a short-lived, chat-scoped token for the Live Support web page
 * (see backend/public/chat.html) — deliberately not the user's full
 * session token, since this one gets opened in the device browser. */
export function startChatSession() {
  return apiFetch<{ chatToken: string }>('/support/chat/session', { method: 'POST' });
}

export function submitBackendKyc(documentType: string, documentReference: string) {
  return apiFetch('/kyc/submit', {
    method: 'POST',
    body: JSON.stringify({ documentType, documentReference }),
  });
}

export function setBackendDepositLimits(input: {
  depositLimitDaily?: number | null;
  depositLimitWeekly?: number | null;
  depositLimitMonthly?: number | null;
}) {
  return apiFetch('/responsible-gambling/deposit-limits', { method: 'PUT', body: JSON.stringify(input) });
}

export function selfExcludeBackend(days: number) {
  return apiFetch('/responsible-gambling/self-exclude', { method: 'POST', body: JSON.stringify({ days }) });
}

export interface FairnessStatus {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export function fetchFairnessStatus() {
  return apiFetch<FairnessStatus>('/games/fairness');
}

export function setFairnessClientSeed(clientSeed: string) {
  return apiFetch<FairnessStatus>('/games/fairness/client-seed', {
    method: 'PUT',
    body: JSON.stringify({ clientSeed }),
  });
}

export interface RotateSeedResult {
  revealedServerSeed: string;
  revealedServerSeedHash: string;
  newServerSeedHash: string;
}

export function rotateFairnessSeed() {
  return apiFetch<RotateSeedResult>('/games/fairness/rotate', { method: 'POST' });
}

export interface DailyBonusStatus {
  dailyStreak: number;
  lastDailyClaimAt: string | null;
  claimedToday: boolean;
}

export function fetchDailyBonusStatus() {
  return apiFetch<DailyBonusStatus>('/games/daily-bonus/status');
}

export interface DailyBonusClaimResult {
  streak: number;
  amount: number;
  newBalance: string;
}

export function claimBackendDailyBonus() {
  return apiFetch<DailyBonusClaimResult>('/games/daily-bonus/claim', { method: 'POST' });
}

// ---- Aviator --------------------------------------------------------------

export interface AviatorConfig {
  minStake: number;
  maxStake: number;
  maxPayout?: number;
  bettingDurationSeconds: number;
  resultPauseSeconds: number;
  growthRate: number;
  houseEdgePercent: number;
  minAutoCashout: number;
}

export function fetchAviatorConfig() {
  return apiFetch<AviatorConfig>('/aviator/config');
}

export type AviatorPhase = 'BETTING' | 'FLYING' | 'CRASHED';

export interface AviatorRoundView {
  periodNumber: string;
  bettingStartTime: string;
  flyStartTime: string;
  // Both null until the round actually crashes — derived from the secret
  // crash point, so the backend withholds them until then (see
  // aviatorService.ts's getCurrentRoundView).
  crashTime: string | null;
  endTime: string | null;
  serverSeedHash: string;
  phase: AviatorPhase;
  multiplier: number;
  crashMultiplier: number | null;
  /** Server clock at the time of the response (Cricket X only). */
  serverTime?: string;
}

export function fetchAviatorCurrentRound() {
  return apiFetch<AviatorRoundView>('/aviator/current');
}

export interface AviatorHistoryEntry {
  periodNumber: string;
  bettingStartTime: string;
  crashMultiplier: number;
  serverSeed: string;
  serverSeedHash: string;
}

export function fetchAviatorHistory(limit = 30) {
  return apiFetch<AviatorHistoryEntry[]>(`/aviator/history?limit=${limit}`);
}

export interface AviatorBetResult {
  id: string;
  roundId: string;
  userId: string;
  amount: string;
  autoCashoutAt: string | null;
  cashoutMultiplier: string | null;
  status: 'PENDING' | 'WON' | 'LOST';
  payout: string;
  createdAt: string;
}

export function placeAviatorBet(amount: number, autoCashoutAt?: number) {
  return apiFetch<AviatorBetResult>('/aviator/bet', {
    method: 'POST',
    body: JSON.stringify({ amount, autoCashoutAt }),
  });
}

export function cashOutAviatorBet(betId: string) {
  return apiFetch<{ multiplier: number; payout: number }>('/aviator/cashout', {
    method: 'POST',
    body: JSON.stringify({ betId }),
  });
}

export function fetchAviatorMyCurrentBet() {
  return apiFetch<AviatorBetResult | null>('/aviator/my-current-bet');
}

export interface AviatorMyBet extends AviatorBetResult {
  round: {
    periodNumber: string;
    crashMultiplier: string;
    settled: boolean;
  };
}

export function fetchAviatorMyBets() {
  return apiFetch<AviatorMyBet[]>('/aviator/my-bets');
}

// Every player's bet on a round, masked to just first+last letter of
// their name (e.g. "m***l") — never phone/email/uid.
export interface AviatorPublicBet {
  id: string;
  player: string;
  amount: string;
  cashoutMultiplier: string | null;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST';
  createdAt: string;
}

export function fetchAviatorRoundBets(periodNumber: string, limit = 100) {
  return apiFetch<AviatorPublicBet[]>(
    `/aviator/round-bets?periodNumber=${encodeURIComponent(periodNumber)}&limit=${limit}`
  );
}

export function fetchAviatorTopBets(limit = 50) {
  return apiFetch<AviatorPublicBet[]>(`/aviator/top-bets?limit=${limit}`);
}

// ---- Chicken Road ----------------------------------------------------
// Unlike Aviator/Win Go there's no shared round — each play is its own
// private round the player steps through and cashes out (or busts) on
// their own.

export type ChickenRoadDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'HARDCORE';

export interface ChickenRoadDifficultyConfig {
  difficulty: ChickenRoadDifficulty;
  steps: number;
  multipliers: number[];
}

export interface ChickenRoadConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  difficulties: ChickenRoadDifficultyConfig[];
}

export interface ChickenRoadRound {
  id: string;
  userId: string;
  difficulty: ChickenRoadDifficulty;
  stake: string;
  currentStep: number;
  multiplier: string;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  serverSeedHash: string;
  createdAt: string;
  settledAt: string | null;
}

export function fetchChickenRoadConfig() {
  return apiFetch<ChickenRoadConfig>('/chicken-road/config');
}

export function fetchChickenRoadCurrent() {
  return apiFetch<ChickenRoadRound | null>('/chicken-road/current');
}

export function fetchChickenRoadHistory(limit = 30) {
  return apiFetch<ChickenRoadRound[]>(`/chicken-road/my-history?limit=${limit}`);
}

export function startChickenRoadRound(stake: number, difficulty: ChickenRoadDifficulty) {
  return apiFetch<ChickenRoadRound>('/chicken-road/start', {
    method: 'POST',
    body: JSON.stringify({ stake, difficulty }),
  });
}

export function advanceChickenRoadStep(roundId: string) {
  return apiFetch<{ round: ChickenRoadRound; busted: boolean }>('/chicken-road/advance', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export function cashOutChickenRoadRound(roundId: string) {
  return apiFetch<ChickenRoadRound>('/chicken-road/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

// ---------- Penalty Hero ----------

export type PenaltyDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';

export interface PenaltyConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  zones: number;
  kicks: number;
  difficulties: { difficulty: PenaltyDifficulty; cover: number; multipliers: number[] }[];
}

/** One kick: the zone shot at (row * 3 + col, top row first), the zones the keeper covered, where he dived. */
export interface PenaltyShot {
  zone: number;
  covered: number[];
  dive: number;
  saved: boolean;
}

export interface PenaltyRound {
  id: string;
  difficulty: PenaltyDifficulty;
  stake: string;
  goals: number;
  multiplier: string;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  shots: PenaltyShot[];
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  settledAt: string | null;
}

export function fetchPenaltyConfig() {
  return apiFetch<PenaltyConfig>('/penalty/config');
}

export function fetchPenaltyCurrent() {
  return apiFetch<PenaltyRound | null>('/penalty/current');
}

export function fetchPenaltyHistory(limit = 30) {
  return apiFetch<PenaltyRound[]>(`/penalty/my-history?limit=${limit}`);
}

export function startPenaltyRound(stake: number, difficulty: PenaltyDifficulty) {
  return apiFetch<PenaltyRound>('/penalty/start', { method: 'POST', body: JSON.stringify({ stake, difficulty }) });
}

export function kickPenalty(roundId: string, zone: number) {
  return apiFetch<{ round: PenaltyRound; shot: PenaltyShot }>('/penalty/kick', { method: 'POST', body: JSON.stringify({ roundId, zone }) });
}

export function cashOutPenalty(roundId: string) {
  return apiFetch<PenaltyRound>('/penalty/cashout', { method: 'POST', body: JSON.stringify({ roundId }) });
}

// ---------- Lucky Cups ----------

export interface CupsConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  cups: number;
  rounds: number;
  modes: { balls: number; multipliers: number[] }[];
}

/** One pick: the cup chosen (0 left, 1 middle, 2 right) and the cups that hid the balls. */
export interface CupPick {
  cup: number;
  ballCups: number[];
  won: boolean;
}

export interface CupsRound {
  id: string;
  balls: number;
  stake: string;
  wins: number;
  multiplier: string;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  picks: CupPick[];
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  settledAt: string | null;
}

export function fetchCupsConfig() {
  return apiFetch<CupsConfig>('/lucky-cups/config');
}

export function fetchCupsCurrent() {
  return apiFetch<CupsRound | null>('/lucky-cups/current');
}

export function fetchCupsHistory(limit = 30) {
  return apiFetch<CupsRound[]>(`/lucky-cups/my-history?limit=${limit}`);
}

export function startCupsRound(stake: number, balls: number) {
  return apiFetch<CupsRound>('/lucky-cups/start', { method: 'POST', body: JSON.stringify({ stake, balls }) });
}

export function pickCup(roundId: string, cup: number) {
  return apiFetch<{ round: CupsRound; pick: CupPick }>('/lucky-cups/pick', { method: 'POST', body: JSON.stringify({ roundId, cup }) });
}

export function cashOutCups(roundId: string) {
  return apiFetch<CupsRound>('/lucky-cups/cashout', { method: 'POST', body: JSON.stringify({ roundId }) });
}

// ---------- Bomb Squad ----------

export interface BombConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  wires: number;
  modes: { live: number; multipliers: number[] }[];
}

export interface BombRound {
  id: string;
  live: number;
  stake: string;
  /** Wires cut so far, in order (0-7). */
  cuts: number[];
  safeCuts: number;
  multiplier: string;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  /** Only once the round is over. */
  liveWires?: number[];
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  settledAt: string | null;
}

export function fetchBombConfig() {
  return apiFetch<BombConfig>('/bomb-squad/config');
}

export function fetchBombCurrent() {
  return apiFetch<BombRound | null>('/bomb-squad/current');
}

export function fetchBombHistory(limit = 30) {
  return apiFetch<BombRound[]>(`/bomb-squad/my-history?limit=${limit}`);
}

export function startBombRound(stake: number, live: number) {
  return apiFetch<BombRound>('/bomb-squad/start', { method: 'POST', body: JSON.stringify({ stake, live }) });
}

export function cutBombWire(roundId: string, wire: number) {
  return apiFetch<{ round: BombRound; boom: boolean }>('/bomb-squad/cut', { method: 'POST', body: JSON.stringify({ roundId, wire }) });
}

export function cashOutBomb(roundId: string) {
  return apiFetch<BombRound>('/bomb-squad/cashout', { method: 'POST', body: JSON.stringify({ roundId }) });
}

// ---------- Vault Heist ----------

export interface VaultConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  digits: number;
  locks: number;
  modes: { alarms: number; multipliers: number[] }[];
}

/** One try at a lock: the digit dialled, that lock's alarm digits, and whether it cracked. */
export interface VaultTry {
  digit: number;
  alarmDigits: number[];
  ok: boolean;
}

export interface VaultRound {
  id: string;
  alarms: number;
  stake: string;
  cracked: number;
  multiplier: string;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  tries: VaultTry[];
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  settledAt: string | null;
}

export function fetchVaultConfig() {
  return apiFetch<VaultConfig>('/vault-heist/config');
}

export function fetchVaultCurrent() {
  return apiFetch<VaultRound | null>('/vault-heist/current');
}

export function fetchVaultHistory(limit = 30) {
  return apiFetch<VaultRound[]>(`/vault-heist/my-history?limit=${limit}`);
}

export function startVaultRound(stake: number, alarms: number) {
  return apiFetch<VaultRound>('/vault-heist/start', { method: 'POST', body: JSON.stringify({ stake, alarms }) });
}

export function crackVaultLock(roundId: string, digit: number) {
  return apiFetch<{ round: VaultRound; attempt: VaultTry }>('/vault-heist/crack', { method: 'POST', body: JSON.stringify({ roundId, digit }) });
}

export function cashOutVault(roundId: string) {
  return apiFetch<VaultRound>('/vault-heist/cashout', { method: 'POST', body: JSON.stringify({ roundId }) });
}

// ---------- Treasure Dig ----------

export interface TreasureConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  mounds: number;
  modes: { crabs: number; multipliers: number[] }[];
}

export interface TreasureRound {
  id: string;
  crabs: number;
  stake: string;
  /** Mounds dug so far, in order (0-15, row by row). */
  digs: number[];
  treasures: number;
  multiplier: string;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  /** Only once the round is over. */
  crabMounds?: number[];
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  settledAt: string | null;
}

export function fetchTreasureConfig() {
  return apiFetch<TreasureConfig>('/treasure-dig/config');
}

export function fetchTreasureCurrent() {
  return apiFetch<TreasureRound | null>('/treasure-dig/current');
}

export function fetchTreasureHistory(limit = 30) {
  return apiFetch<TreasureRound[]>(`/treasure-dig/my-history?limit=${limit}`);
}

export function startTreasureRound(stake: number, crabs: number) {
  return apiFetch<TreasureRound>('/treasure-dig/start', { method: 'POST', body: JSON.stringify({ stake, crabs }) });
}

export function digTreasureMound(roundId: string, mound: number) {
  return apiFetch<{ round: TreasureRound; crab: boolean }>('/treasure-dig/dig', { method: 'POST', body: JSON.stringify({ roundId, mound }) });
}

export function cashOutTreasure(roundId: string) {
  return apiFetch<TreasureRound>('/treasure-dig/cashout', { method: 'POST', body: JSON.stringify({ roundId }) });
}

// ---------- Lucky Wheel ----------

export type WheelRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface WheelConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  segments: number;
  /** Each risk level's multipliers, clockwise from the top. */
  wheels: { risk: WheelRisk; segments: number[]; rtpPercent: number }[];
}

export interface WheelSpinRow {
  id: string;
  risk: WheelRisk;
  stake: string;
  segment: number;
  multiplier: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}

export function fetchWheelConfig() {
  return apiFetch<WheelConfig>('/lucky-wheel/config');
}

export function spinLuckyWheel(stake: number, risk: WheelRisk) {
  return apiFetch<WheelSpinRow>('/lucky-wheel/spin', { method: 'POST', body: JSON.stringify({ stake, risk }) });
}

export function fetchWheelHistory(limit = 30) {
  return apiFetch<WheelSpinRow[]>(`/lucky-wheel/my-history?limit=${limit}`);
}

// ---------- Scratch Card ----------

export interface ScratchConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  panels: number;
  /** The prize table, lowest first; `chance` is the chance a ticket carries that prize. */
  symbols: { key: string; multiplier: number; chance: number }[];
}

export interface ScratchTicketRow {
  id: string;
  stake: string;
  /** The nine panels' symbols (indices into `symbols`), left to right, top to bottom. */
  panels: number[];
  /** The symbol shown three times, or -1 for no win. */
  prize: number;
  multiplier: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}

export function fetchScratchConfig() {
  return apiFetch<ScratchConfig>('/scratch-card/config');
}

export function buyScratchTicket(stake: number) {
  return apiFetch<ScratchTicketRow>('/scratch-card/buy', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchScratchHistory(limit = 30) {
  return apiFetch<ScratchTicketRow[]>(`/scratch-card/my-history?limit=${limit}`);
}

// ---------- Dice Duel ----------

export type DuelPick = 'PLAYER' | 'HOUSE' | 'TIE';

export interface DiceDuelConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  /** Each pick's pay (stake included), its chance and its exact return. */
  picks: { pick: DuelPick; multiplier: number; chance: number; rtpPercent: number }[];
}

export interface DiceDuelBetRow {
  id: string;
  stake: string;
  pick: DuelPick;
  playerDice: number[];
  houseDice: number[];
  outcome: DuelPick;
  multiplier: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}

export function fetchDiceDuelConfig() {
  return apiFetch<DiceDuelConfig>('/dice-duel/config');
}

export function playDiceDuel(stake: number, pick: DuelPick) {
  return apiFetch<DiceDuelBetRow>('/dice-duel/play', { method: 'POST', body: JSON.stringify({ stake, pick }) });
}

export function fetchDiceDuelHistory(limit = 30) {
  return apiFetch<DiceDuelBetRow[]>(`/dice-duel/my-history?limit=${limit}`);
}

// ---------- Color Ball ----------

export type BallColor = 'RED' | 'BLUE' | 'GREEN' | 'GOLD';

export interface ColorBallConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  /** The drum: ball n (1-20) has colour balls[n - 1]. */
  balls: BallColor[];
  /** Each colour's ball count, pay (stake included) and exact return. */
  colors: { color: BallColor; balls: number; multiplier: number; rtpPercent: number }[];
}

export interface ColorBallBetRow {
  id: string;
  stake: string;
  pick: BallColor;
  ball: number;
  color: BallColor;
  multiplier: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}

export function fetchColorBallConfig() {
  return apiFetch<ColorBallConfig>('/color-ball/config');
}

export function playColorBall(stake: number, pick: BallColor) {
  return apiFetch<ColorBallBetRow>('/color-ball/play', { method: 'POST', body: JSON.stringify({ stake, pick }) });
}

export function fetchColorBallHistory(limit = 30) {
  return apiFetch<ColorBallBetRow[]>(`/color-ball/my-history?limit=${limit}`);
}

// ---------- Fortune 6 ----------

export interface FortuneSixConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  numbers: number;
  drawn: number;
  picks: number;
  rtpPercent: number;
  /** What a ticket pays when its 6th number is drawn at each position, and the chance of that. */
  pays: { position: number; multiplier: number; chance: number }[];
}

export interface FortuneSixBetRow {
  id: string;
  stake: string;
  picks: number[];
  /** The 35 balls in draw order. */
  drawn: number[];
  /** Position (6-35) of the ball that completed the ticket, or null. */
  position: number | null;
  multiplier: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}

export function fetchFortuneSixConfig() {
  return apiFetch<FortuneSixConfig>('/fortune-six/config');
}

export function playFortuneSix(stake: number, picks: number[]) {
  return apiFetch<FortuneSixBetRow>('/fortune-six/play', { method: 'POST', body: JSON.stringify({ stake, picks }) });
}

export function fetchFortuneSixHistory(limit = 30) {
  return apiFetch<FortuneSixBetRow[]>(`/fortune-six/my-history?limit=${limit}`);
}

export interface MinesConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  tiles: number;
  minMines: number;
  maxMines: number;
  // multipliers[mineCount][safeTilesRevealed]
  multipliers: Record<string, number[]>;
}

export interface MinesRound {
  id: string;
  userId: string;
  stake: string;
  mineCount: number;
  revealed: number[];
  // Only present once the round has ended.
  minePositions?: number[];
  multiplier: string;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  serverSeedHash: string;
  createdAt: string;
  settledAt: string | null;
}

export function fetchMinesConfig() {
  return apiFetch<MinesConfig>('/mines/config');
}

export function fetchMinesCurrent() {
  return apiFetch<MinesRound | null>('/mines/current');
}

export function fetchMinesHistory(limit = 30) {
  return apiFetch<MinesRound[]>(`/mines/my-history?limit=${limit}`);
}

export function startMinesRound(stake: number, mineCount: number) {
  return apiFetch<MinesRound>('/mines/start', {
    method: 'POST',
    body: JSON.stringify({ stake, mineCount }),
  });
}

export function revealMinesTile(roundId: string, tile: number) {
  return apiFetch<{ round: MinesRound; hitMine: boolean }>('/mines/reveal', {
    method: 'POST',
    body: JSON.stringify({ roundId, tile }),
  });
}

export function cashOutMinesRound(roundId: string) {
  return apiFetch<MinesRound>('/mines/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

// ---- 7 Up Down ----

export type SevenUpDownArea = 'DOWN' | 'SEVEN' | 'UP' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6' | 'N8' | 'N9' | 'N10' | 'N11' | 'N12';

export interface SevenUpDownConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  roundSeconds: number;
  betSeconds: number;
  resultAtSeconds: number;
  multipliers: Record<SevenUpDownArea, number>;
}

export interface SevenUpDownRoundView {
  periodNumber: string;
  startTime: string;
  betEndTime: string;
  resultTime: string;
  endTime: string;
  serverTime: string;
  phase: 'BETTING' | 'ROLLING' | 'RESULT';
  serverSeedHash: string;
  dice: [number, number] | null;
  total: number | null;
  serverSeed: string | null;
}

export interface SevenUpDownBet {
  id: string;
  area: SevenUpDownArea;
  amount: string;
  multiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
}

export interface SevenUpDownHistoryEntry {
  periodNumber: string;
  dice1: number;
  dice2: number;
  total: number;
}

export function fetchSevenUpDownConfig() {
  return apiFetch<SevenUpDownConfig>('/seven-up-down/config');
}

export function fetchSevenUpDownCurrent() {
  return apiFetch<SevenUpDownRoundView>('/seven-up-down/current');
}

export function fetchSevenUpDownHistory(limit = 100) {
  return apiFetch<SevenUpDownHistoryEntry[]>(`/seven-up-down/history?limit=${limit}`);
}

export function placeSevenUpDownBets(bets: { area: SevenUpDownArea; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: SevenUpDownBet[] }>('/seven-up-down/bet', {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function cancelSevenUpDownBets(betIds?: string[]) {
  return apiFetch<{ cancelled: string[]; refund: number }>('/seven-up-down/cancel', {
    method: 'POST',
    body: JSON.stringify(betIds ? { betIds } : {}),
  });
}

export function fetchSevenUpDownMyRound(periodNumber?: string) {
  const q = periodNumber ? `?periodNumber=${encodeURIComponent(periodNumber)}` : '';
  return apiFetch<{ periodNumber: string | null; bets: SevenUpDownBet[] }>(`/seven-up-down/my-round${q}`);
}

// ---- Plinko ----

export type PlinkoRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PlinkoConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  minRows: number;
  maxRows: number;
  risks: PlinkoRisk[];
  rtpPercent: number;
  // multipliers[risk][rows] = payout for each landing slot, left to right
  multipliers: Record<PlinkoRisk, Record<string, number[]>>;
}

export interface PlinkoBet {
  id: string;
  stake: string;
  rows: number;
  risk: PlinkoRisk;
  path: number[]; // 0 = bounced left, 1 = bounced right, one per row
  slot: number;
  multiplier: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}

export function fetchPlinkoConfig() {
  return apiFetch<PlinkoConfig>('/plinko/config');
}

export function dropPlinkoBall(stake: number, rows: number, risk: PlinkoRisk) {
  return apiFetch<PlinkoBet>('/plinko/drop', {
    method: 'POST',
    body: JSON.stringify({ stake, rows, risk }),
  });
}

export function fetchPlinkoHistory(limit = 30) {
  return apiFetch<PlinkoBet[]>(`/plinko/my-history?limit=${limit}`);
}

// ---- Dragon Tiger ----

export type DragonTigerArea = 'DRAGON' | 'TIE' | 'TIGER' | 'SUITED_TIE';
export type CardSuit = 'S' | 'H' | 'C' | 'D';
export interface PlayingCard {
  rank: number; // 1 = A ... 13 = K
  suit: CardSuit;
}

export interface DragonTigerConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  roundSeconds: number;
  betSeconds: number;
  resultAtSeconds: number;
  rtpPercent: number;
  multipliers: Record<DragonTigerArea, number>;
}

export interface DragonTigerRoundView {
  periodNumber: string;
  startTime: string;
  betEndTime: string;
  resultTime: string;
  endTime: string;
  serverTime: string;
  phase: 'BETTING' | 'DEALING' | 'RESULT';
  serverSeedHash: string;
  dragon: PlayingCard | null;
  tiger: PlayingCard | null;
  winner: 'DRAGON' | 'TIGER' | 'TIE' | null;
  suitedTie: boolean | null;
  serverSeed: string | null;
}

export interface DragonTigerBet {
  id: string;
  area: DragonTigerArea;
  amount: string;
  multiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
}

export interface DragonTigerHistoryEntry {
  periodNumber: string;
  dragon: PlayingCard;
  tiger: PlayingCard;
  winner: 'DRAGON' | 'TIGER' | 'TIE';
  suitedTie: boolean;
}

export function fetchDragonTigerConfig() {
  return apiFetch<DragonTigerConfig>('/dragon-tiger/config');
}

export function fetchDragonTigerCurrent() {
  return apiFetch<DragonTigerRoundView>('/dragon-tiger/current');
}

export function fetchDragonTigerHistory(limit = 100) {
  return apiFetch<DragonTigerHistoryEntry[]>(`/dragon-tiger/history?limit=${limit}`);
}

export function placeDragonTigerBets(bets: { area: DragonTigerArea; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: DragonTigerBet[] }>('/dragon-tiger/bet', {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function cancelDragonTigerBets(betIds?: string[]) {
  return apiFetch<{ cancelled: string[]; refund: number }>('/dragon-tiger/cancel', {
    method: 'POST',
    body: JSON.stringify(betIds ? { betIds } : {}),
  });
}

export function fetchDragonTigerMyRound(periodNumber?: string) {
  const q = periodNumber ? `?periodNumber=${encodeURIComponent(periodNumber)}` : '';
  return apiFetch<{ periodNumber: string | null; bets: DragonTigerBet[] }>(`/dragon-tiger/my-round${q}`);
}

export type VortexElement = 'WATER' | 'EARTH' | 'FIRE';
export type VortexOutcome = VortexElement | 'CRASH';

export interface VortexElementConfig {
  element: VortexElement;
  factor: number;
  sections: number;
  chancePercent: number;
  ladder: number[];
}

export interface VortexConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  wheel: VortexOutcome[];
  elements: VortexElementConfig[];
  crashChancePercent: number;
}

export interface VortexRound {
  id: string;
  userId: string;
  stake: string;
  water: number;
  earth: number;
  fire: number;
  spins: number;
  segments: number[];
  multiplier: string;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  endReason: string | null;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  settledAt: string | null;
}

export interface VortexSpinResult {
  round: VortexRound;
  segment: number;
  outcome: VortexOutcome;
}

export function fetchVortexConfig() {
  return apiFetch<VortexConfig>('/vortex/config');
}

export function fetchVortexCurrent() {
  return apiFetch<VortexRound | null>('/vortex/current');
}

export function fetchVortexHistory(limit = 30) {
  return apiFetch<VortexRound[]>(`/vortex/my-history?limit=${limit}`);
}

export function startVortexRound(stake: number) {
  return apiFetch<VortexSpinResult>('/vortex/start', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function spinVortexRound(roundId: string) {
  return apiFetch<VortexSpinResult>('/vortex/spin', { method: 'POST', body: JSON.stringify({ roundId }) });
}

export function cashOutVortexRound(roundId: string) {
  return apiFetch<VortexRound>('/vortex/cashout', { method: 'POST', body: JSON.stringify({ roundId }) });
}

export type AndarBaharArea = 'ANDAR' | 'BAHAR' | 'C1_5' | 'C6_10' | 'C11_15' | 'C16_25' | 'C26_35' | 'C36_49';

export interface AndarBaharConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  roundSeconds: number;
  betSeconds: number;
  resultAtSeconds: number;
  rtpPercent: number;
  multipliers: Record<AndarBaharArea, number>;
}

export interface AndarBaharRoundView {
  periodNumber: string;
  startTime: string;
  betEndTime: string;
  resultTime: string;
  endTime: string;
  serverTime: string;
  phase: 'BETTING' | 'DEALING' | 'RESULT';
  serverSeedHash: string;
  joker: PlayingCard | null;
  cards: PlayingCard[] | null;
  winner: 'ANDAR' | 'BAHAR' | null;
  totalCards: number | null;
  serverSeed: string | null;
}

export interface AndarBaharBet {
  id: string;
  area: AndarBaharArea;
  amount: string;
  multiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
}

export interface AndarBaharHistoryEntry {
  periodNumber: string;
  joker: PlayingCard;
  winner: 'ANDAR' | 'BAHAR';
  totalCards: number;
}

export function fetchAndarBaharConfig() {
  return apiFetch<AndarBaharConfig>('/andar-bahar/config');
}

export function fetchAndarBaharCurrent() {
  return apiFetch<AndarBaharRoundView>('/andar-bahar/current');
}

export function fetchAndarBaharHistory(limit = 100) {
  return apiFetch<AndarBaharHistoryEntry[]>(`/andar-bahar/history?limit=${limit}`);
}

export function placeAndarBaharBets(bets: { area: AndarBaharArea; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: AndarBaharBet[] }>('/andar-bahar/bet', {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function cancelAndarBaharBets(betIds?: string[]) {
  return apiFetch<{ cancelled: string[]; refund: number }>('/andar-bahar/cancel', {
    method: 'POST',
    body: JSON.stringify(betIds ? { betIds } : {}),
  });
}

export function fetchAndarBaharMyRound(periodNumber?: string) {
  const q = periodNumber ? `?periodNumber=${encodeURIComponent(periodNumber)}` : '';
  return apiFetch<{ periodNumber: string | null; bets: AndarBaharBet[] }>(`/andar-bahar/my-round${q}`);
}

export type TeenPattiArea = 'PLAYER_A' | 'PLAYER_B' | 'TIE';

export interface TeenPattiConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  roundSeconds: number;
  betSeconds: number;
  resultAtSeconds: number;
  rtpPercent: number;
  multipliers: Record<TeenPattiArea, number>;
}

export interface TeenPattiRoundView {
  periodNumber: string;
  startTime: string;
  betEndTime: string;
  resultTime: string;
  endTime: string;
  serverTime: string;
  phase: 'BETTING' | 'DEALING' | 'RESULT';
  serverSeedHash: string;
  playerA: PlayingCard[] | null;
  playerB: PlayingCard[] | null;
  handA: string | null;
  handB: string | null;
  winner: 'PLAYER_A' | 'PLAYER_B' | 'TIE' | null;
  serverSeed: string | null;
}

export interface TeenPattiBet {
  id: string;
  area: TeenPattiArea;
  amount: string;
  multiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
}

export interface TeenPattiHistoryEntry {
  periodNumber: string;
  playerA: PlayingCard[];
  playerB: PlayingCard[];
  handA: string;
  handB: string;
  winner: 'PLAYER_A' | 'PLAYER_B' | 'TIE';
}

export function fetchTeenPattiConfig() {
  return apiFetch<TeenPattiConfig>('/teen-patti/config');
}

export function fetchTeenPattiCurrent() {
  return apiFetch<TeenPattiRoundView>('/teen-patti/current');
}

export function fetchTeenPattiHistory(limit = 100) {
  return apiFetch<TeenPattiHistoryEntry[]>(`/teen-patti/history?limit=${limit}`);
}

export function placeTeenPattiBets(bets: { area: TeenPattiArea; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: TeenPattiBet[] }>('/teen-patti/bet', {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function cancelTeenPattiBets(betIds?: string[]) {
  return apiFetch<{ cancelled: string[]; refund: number }>('/teen-patti/cancel', {
    method: 'POST',
    body: JSON.stringify(betIds ? { betIds } : {}),
  });
}

export function fetchTeenPattiMyRound(periodNumber?: string) {
  const q = periodNumber ? `?periodNumber=${encodeURIComponent(periodNumber)}` : '';
  return apiFetch<{ periodNumber: string | null; bets: TeenPattiBet[] }>(`/teen-patti/my-round${q}`);
}

// ---- Cricket X (same crash engine and shapes as Aviator) -------------------

export function fetchCricketXConfig() {
  return apiFetch<AviatorConfig>('/cricket-x/config');
}

export function fetchCricketXCurrentRound() {
  return apiFetch<AviatorRoundView>('/cricket-x/current');
}

export function fetchCricketXHistory(limit = 30) {
  return apiFetch<AviatorHistoryEntry[]>(`/cricket-x/history?limit=${limit}`);
}

export function placeCricketXBet(amount: number, autoCashoutAt?: number) {
  return apiFetch<AviatorBetResult>('/cricket-x/bet', {
    method: 'POST',
    body: JSON.stringify({ amount, autoCashoutAt }),
  });
}

export function cashOutCricketXBet(betId: string) {
  return apiFetch<{ multiplier: number; payout: number }>('/cricket-x/cashout', {
    method: 'POST',
    body: JSON.stringify({ betId }),
  });
}

export function fetchCricketXMyBets() {
  return apiFetch<AviatorMyBet[]>('/cricket-x/my-bets');
}

// ---- Rocket (same crash engine and shapes as Aviator) ----------------------

export function fetchRocketConfig() {
  return apiFetch<AviatorConfig>('/rocket/config');
}

export function fetchRocketCurrentRound() {
  return apiFetch<AviatorRoundView>('/rocket/current');
}

export function fetchRocketHistory(limit = 30) {
  return apiFetch<AviatorHistoryEntry[]>(`/rocket/history?limit=${limit}`);
}

export function placeRocketBet(amount: number, autoCashoutAt?: number) {
  return apiFetch<AviatorBetResult>('/rocket/bet', {
    method: 'POST',
    body: JSON.stringify({ amount, autoCashoutAt }),
  });
}

export function cashOutRocketBet(betId: string) {
  return apiFetch<{ multiplier: number; payout: number }>('/rocket/cashout', {
    method: 'POST',
    body: JSON.stringify({ betId }),
  });
}

export function fetchRocketMyBets() {
  return apiFetch<AviatorMyBet[]>('/rocket/my-bets');
}

// ---- Goal Rush (same crash engine and shapes as Aviator) -------------------

export function fetchGoalRushConfig() {
  return apiFetch<AviatorConfig>('/goal-rush/config');
}

export function fetchGoalRushCurrentRound() {
  return apiFetch<AviatorRoundView>('/goal-rush/current');
}

export function fetchGoalRushHistory(limit = 30) {
  return apiFetch<AviatorHistoryEntry[]>(`/goal-rush/history?limit=${limit}`);
}

export function placeGoalRushBet(amount: number, autoCashoutAt?: number) {
  return apiFetch<AviatorBetResult>('/goal-rush/bet', {
    method: 'POST',
    body: JSON.stringify({ amount, autoCashoutAt }),
  });
}

export function cashOutGoalRushBet(betId: string) {
  return apiFetch<{ multiplier: number; payout: number }>('/goal-rush/cashout', {
    method: 'POST',
    body: JSON.stringify({ betId }),
  });
}

export function fetchGoalRushMyBets() {
  return apiFetch<AviatorMyBet[]>('/goal-rush/my-bets');
}

// ---- Big Catch (the crash engine with a Half Reel cash-out) ----------------

export interface BigCatchConfig extends AviatorConfig {
  halfCashout: boolean;
}

export interface BigCatchBet extends AviatorBetResult {
  halfCashoutMultiplier: string | null;
  halfPayout: string;
}

export interface BigCatchMyBet extends BigCatchBet {
  round: { periodNumber: string; crashMultiplier: string; settled: boolean };
}

export function fetchBigCatchConfig() {
  return apiFetch<BigCatchConfig>('/big-catch/config');
}

export function fetchBigCatchCurrentRound() {
  return apiFetch<AviatorRoundView>('/big-catch/current');
}

export function fetchBigCatchHistory(limit = 30) {
  return apiFetch<AviatorHistoryEntry[]>(`/big-catch/history?limit=${limit}`);
}

export function placeBigCatchBet(amount: number, autoCashoutAt?: number) {
  return apiFetch<BigCatchBet>('/big-catch/bet', {
    method: 'POST',
    body: JSON.stringify({ amount, autoCashoutAt }),
  });
}

/** Cash out the whole bet, or with `half` take half the stake and leave the rest riding (once per bet). */
export function cashOutBigCatchBet(betId: string, half = false) {
  return apiFetch<{ multiplier: number; payout: number; half: boolean }>('/big-catch/cashout', {
    method: 'POST',
    body: JSON.stringify({ betId, half }),
  });
}

export function fetchBigCatchMyBets() {
  return apiFetch<BigCatchMyBet[]>('/big-catch/my-bets');
}

// ---- Cosmonaut (the crash engine with manual and automatic half cash-outs) --

export interface CosmonautConfig extends BigCatchConfig {
  autoHalf: boolean;
}

export interface CosmonautBet extends BigCatchBet {
  autoHalfAt: string | null;
}

export interface CosmonautMyBet extends CosmonautBet {
  round: { periodNumber: string; crashMultiplier: string; settled: boolean };
}

export function fetchCosmonautConfig() {
  return apiFetch<CosmonautConfig>('/cosmonaut/config');
}

export function fetchCosmonautCurrentRound() {
  return apiFetch<AviatorRoundView>('/cosmonaut/current');
}

export function fetchCosmonautHistory(limit = 30) {
  return apiFetch<AviatorHistoryEntry[]>(`/cosmonaut/history?limit=${limit}`);
}

export function placeCosmonautBet(amount: number, autoCashoutAt?: number, autoHalfAt?: number) {
  return apiFetch<CosmonautBet>('/cosmonaut/bet', {
    method: 'POST',
    body: JSON.stringify({ amount, autoCashoutAt, autoHalfAt }),
  });
}

/**
 * Cash out the whole bet, or with `half` take half the stake and leave the
 * rest flying (once per bet). A full cash-out past the Auto ½ target also
 * reports the half it settled on the way (`halfAt`).
 */
export function cashOutCosmonautBet(betId: string, half = false) {
  return apiFetch<{ multiplier: number; payout: number; half: boolean; halfAt?: number | null; halfPaid?: number }>('/cosmonaut/cashout', {
    method: 'POST',
    body: JSON.stringify({ betId, half }),
  });
}

export function fetchCosmonautMyBets() {
  return apiFetch<CosmonautMyBet[]>('/cosmonaut/my-bets');
}

// ---- Sky Jet (the crash engine with a progressive jackpot) -------------------

export interface SkyJetConfig extends AviatorConfig {
  crashEdgePercent: number;
  jackpotSharePercent: number;
  /** A bet of this stake would always hit; the chance is stake / this. */
  jackpotOddsStake: number;
}

export interface SkyJetRoundView extends AviatorRoundView {
  jackpot: number;
}

export interface SkyJetMyBet extends AviatorMyBet {
  jackpotChecked: boolean;
  jackpotPayout: string;
}

export interface SkyJetJackpotInfo {
  amount: number;
  wins: { amount: string; periodNumber: string; createdAt: string; player: string }[];
}

export function fetchSkyJetConfig() {
  return apiFetch<SkyJetConfig>('/sky-jet/config');
}

export function fetchSkyJetCurrentRound() {
  return apiFetch<SkyJetRoundView>('/sky-jet/current');
}

export function fetchSkyJetHistory(limit = 30) {
  return apiFetch<AviatorHistoryEntry[]>(`/sky-jet/history?limit=${limit}`);
}

export function fetchSkyJetJackpot() {
  return apiFetch<SkyJetJackpotInfo>('/sky-jet/jackpot');
}

export function placeSkyJetBet(amount: number, autoCashoutAt?: number) {
  return apiFetch<AviatorBetResult>('/sky-jet/bet', {
    method: 'POST',
    body: JSON.stringify({ amount, autoCashoutAt }),
  });
}

export function cashOutSkyJetBet(betId: string) {
  return apiFetch<{ multiplier: number; payout: number }>('/sky-jet/cashout', {
    method: 'POST',
    body: JSON.stringify({ betId }),
  });
}

export function fetchSkyJetMyBets() {
  return apiFetch<SkyJetMyBet[]>('/sky-jet/my-bets');
}

// ---- Night Racer (the crash engine with a per-bet nitro) -------------------

export interface NightRacerConfig extends AviatorConfig {
  nitro: boolean;
}

export interface NightRacerBet extends AviatorBetResult {
  nitroAt: string | null;
  engineBlownAt: string | null;
}

export interface NightRacerMyBet extends NightRacerBet {
  round: { periodNumber: string; crashMultiplier: string; settled: boolean };
}

export function fetchNightRacerConfig() {
  return apiFetch<NightRacerConfig>('/night-racer/config');
}

export function fetchNightRacerCurrentRound() {
  return apiFetch<AviatorRoundView>('/night-racer/current');
}

export function fetchNightRacerHistory(limit = 30) {
  return apiFetch<AviatorHistoryEntry[]>(`/night-racer/history?limit=${limit}`);
}

export function placeNightRacerBet(amount: number, autoCashoutAt?: number) {
  return apiFetch<NightRacerBet>('/night-racer/bet', {
    method: 'POST',
    body: JSON.stringify({ amount, autoCashoutAt }),
  });
}

export function cashOutNightRacerBet(betId: string) {
  return apiFetch<{ multiplier: number; payout: number }>('/night-racer/cashout', {
    method: 'POST',
    body: JSON.stringify({ betId }),
  });
}

/** Fires the bet's nitro at the live multiplier: its own multiplier then runs twice as fast, with a chance the engine blows. */
export function fireNightRacerNitro(betId: string) {
  return apiFetch<{ nitroAt: number }>('/night-racer/nitro', {
    method: 'POST',
    body: JSON.stringify({ betId }),
  });
}

export function fetchNightRacerNitroStatus(betId: string) {
  return apiFetch<{ nitroAt: number | null; blown: boolean; blownAt: number | null; status: string }>(`/night-racer/nitro-status?betId=${encodeURIComponent(betId)}`);
}

export function fetchNightRacerMyBets() {
  return apiFetch<NightRacerMyBet[]>('/night-racer/my-bets');
}

// ---- Airship (same crash engine and shapes as Aviator) ---------------------

export function fetchAirshipConfig() {
  return apiFetch<AviatorConfig>('/airship/config');
}

export function fetchAirshipCurrentRound() {
  return apiFetch<AviatorRoundView>('/airship/current');
}

export function fetchAirshipHistory(limit = 30) {
  return apiFetch<AviatorHistoryEntry[]>(`/airship/history?limit=${limit}`);
}

export function placeAirshipBet(amount: number, autoCashoutAt?: number) {
  return apiFetch<AviatorBetResult>('/airship/bet', {
    method: 'POST',
    body: JSON.stringify({ amount, autoCashoutAt }),
  });
}

export function cashOutAirshipBet(betId: string) {
  return apiFetch<{ multiplier: number; payout: number }>('/airship/cashout', {
    method: 'POST',
    body: JSON.stringify({ betId }),
  });
}

export function fetchAirshipMyBets() {
  return apiFetch<AviatorMyBet[]>('/airship/my-bets');
}

// ---- Jhandi Munda ------------------------------------------------------------

export type JhandiSymbol = 'HEART' | 'SPADE' | 'DIAMOND' | 'CLUB' | 'FLAG' | 'CROWN';

export interface JhandiMundaConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  roundSeconds: number;
  betSeconds: number;
  resultAtSeconds: number;
  rtpPercent: number;
  symbols: JhandiSymbol[];
  /** Total return per unit staked, by how many dice show the symbol. */
  paytable: Record<string, number>;
}

export interface JhandiMundaRoundView {
  periodNumber: string;
  startTime: string;
  betEndTime: string;
  resultTime: string;
  endTime: string;
  serverTime: string;
  phase: 'BETTING' | 'ROLLING' | 'RESULT';
  serverSeedHash: string;
  dice: JhandiSymbol[] | null;
  counts: Record<JhandiSymbol, number> | null;
  serverSeed: string | null;
}

export interface JhandiMundaBet {
  id: string;
  area: JhandiSymbol;
  amount: string;
  matches: number | null;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
  createdAt: string;
}

export interface JhandiMundaHistoryEntry {
  periodNumber: string;
  dice: JhandiSymbol[];
  counts: Record<JhandiSymbol, number>;
  serverSeed: string;
  serverSeedHash: string;
}

export function fetchJhandiMundaConfig() {
  return apiFetch<JhandiMundaConfig>('/jhandi-munda/config');
}

export function fetchJhandiMundaCurrent() {
  return apiFetch<JhandiMundaRoundView>('/jhandi-munda/current');
}

export function fetchJhandiMundaHistory(limit = 100) {
  return apiFetch<JhandiMundaHistoryEntry[]>(`/jhandi-munda/history?limit=${limit}`);
}

export function placeJhandiMundaBets(bets: { area: JhandiSymbol; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: JhandiMundaBet[] }>('/jhandi-munda/bet', {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function cancelJhandiMundaBets(betIds?: string[]) {
  return apiFetch<{ cancelled: string[]; refund: number }>('/jhandi-munda/cancel', {
    method: 'POST',
    body: JSON.stringify(betIds ? { betIds } : {}),
  });
}

export function fetchJhandiMundaMyRound(periodNumber?: string) {
  const q = periodNumber ? `?periodNumber=${encodeURIComponent(periodNumber)}` : '';
  return apiFetch<{ periodNumber: string | null; bets: JhandiMundaBet[] }>(`/jhandi-munda/my-round${q}`);
}

// ---- Roulette (European, single zero) ----------------------------------------

export interface RouletteConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  roundSeconds: number;
  betSeconds: number;
  resultAtSeconds: number;
  rtpPercent: number;
  redNumbers: number[];
  /** Total return per unit staked, by how many numbers the bet covers. */
  multipliers: Record<string, number>;
}

export interface RouletteRoundView {
  periodNumber: string;
  startTime: string;
  betEndTime: string;
  resultTime: string;
  endTime: string;
  serverTime: string;
  phase: 'BETTING' | 'SPINNING' | 'RESULT';
  serverSeedHash: string;
  result: number | null;
  color: 'RED' | 'BLACK' | 'GREEN' | null;
  serverSeed: string | null;
}

export interface RouletteBet {
  id: string;
  /** Bet spot key, e.g. "S:17", "SP:0-1", "CO:5", "DZ2", "RED". */
  area: string;
  amount: string;
  multiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
  createdAt: string;
}

export interface RouletteHistoryEntry {
  periodNumber: string;
  result: number;
  color: 'RED' | 'BLACK' | 'GREEN';
  serverSeed: string;
  serverSeedHash: string;
}

export function fetchRouletteConfig() {
  return apiFetch<RouletteConfig>('/roulette/config');
}

export function fetchRouletteCurrent() {
  return apiFetch<RouletteRoundView>('/roulette/current');
}

export function fetchRouletteHistory(limit = 100) {
  return apiFetch<RouletteHistoryEntry[]>(`/roulette/history?limit=${limit}`);
}

export function placeRouletteBets(bets: { area: string; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: RouletteBet[] }>('/roulette/bet', {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function cancelRouletteBets(betIds?: string[]) {
  return apiFetch<{ cancelled: string[]; refund: number }>('/roulette/cancel', {
    method: 'POST',
    body: JSON.stringify(betIds ? { betIds } : {}),
  });
}

export function fetchRouletteMyRound(periodNumber?: string) {
  const q = periodNumber ? `?periodNumber=${encodeURIComponent(periodNumber)}` : '';
  return apiFetch<{ periodNumber: string | null; bets: RouletteBet[] }>(`/roulette/my-round${q}`);
}

// ---- K3 Lottery (three dice, Win Go style duration tracks) --------------------

export type K3Duration = 60 | 180 | 300 | 600;

export interface K3Config {
  durations: K3Duration[];
  minStake: number;
  maxStake: number;
  maxPayout: number;
  lockSeconds: number;
  rtpPercent: number;
  /** Total return per unit staked, by bet key (e.g. "SUM:10", "BIG", "PAIR:3"). */
  multipliers: Record<string, number>;
}

export interface K3RoundView {
  periodNumber: string;
  durationSeconds: K3Duration;
  startTime: string;
  endTime: string;
  serverTime: string;
  serverSeedHash: string;
  locked: boolean;
}

export interface K3Result {
  dice: number[];
  sum: number;
  size: 'BIG' | 'SMALL';
  parity: 'ODD' | 'EVEN';
}

export interface K3HistoryEntry extends K3Result {
  periodNumber: string;
  serverSeed: string;
  serverSeedHash: string;
}

export interface K3MyBet {
  id: string;
  area: string;
  amount: string;
  multiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
  createdAt: string;
  periodNumber: string;
  durationSeconds: K3Duration;
  result: K3Result | null;
}

export function fetchK3Config() {
  return apiFetch<K3Config>('/k3/config');
}

export function fetchK3Current(duration: K3Duration) {
  return apiFetch<K3RoundView>(`/k3/${duration}/current`);
}

export function fetchK3History(duration: K3Duration, limit = 50) {
  return apiFetch<K3HistoryEntry[]>(`/k3/${duration}/history?limit=${limit}`);
}

export function placeK3Bets(duration: K3Duration, bets: { area: string; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: K3MyBet[] }>(`/k3/${duration}/bet`, {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function fetchK3MyBets(limit = 50) {
  return apiFetch<K3MyBet[]>(`/k3/my-bets?limit=${limit}`);
}

// ---- Win Go (rebuilt, /wingo) --------------------------------------------------

export type WinGoDuration = 30 | 60 | 180 | 300 | 600;

export interface WinGoConfig {
  durations: WinGoDuration[];
  minStake: number;
  maxStake: number;
  maxPayout: number;
  lockSeconds: number;
  rtpPercent: number;
  payouts: { number: number; size: number; violet: number; color: number; colorMixed: number };
}

export interface WinGoRoundView {
  periodNumber: string;
  durationSeconds: WinGoDuration;
  startTime: string;
  endTime: string;
  serverTime: string;
  serverSeedHash: string;
  locked: boolean;
}

export interface WinGoResult {
  number: number;
  size: 'BIG' | 'SMALL';
  colors: ('GREEN' | 'RED' | 'VIOLET')[];
}

export interface WinGoHistoryEntry extends WinGoResult {
  periodNumber: string;
  serverSeed: string;
  serverSeedHash: string;
}

export interface WinGoMyBet {
  id: string;
  /** NUM:0-9, GREEN, RED, VIOLET, BIG or SMALL. */
  area: string;
  amount: string;
  paidMultiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
  createdAt: string;
  periodNumber: string;
  durationSeconds: WinGoDuration;
  result: WinGoResult | null;
}

export function fetchWinGoConfig() {
  return apiFetch<WinGoConfig>('/wingo/config');
}

export function fetchWinGoCurrent(duration: WinGoDuration) {
  return apiFetch<WinGoRoundView>(`/wingo/${duration}/current`);
}

export function fetchWinGoHistory(duration: WinGoDuration, limit = 100) {
  return apiFetch<WinGoHistoryEntry[]>(`/wingo/${duration}/history?limit=${limit}`);
}

export function placeWinGoBets(duration: WinGoDuration, bets: { area: string; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: WinGoMyBet[] }>(`/wingo/${duration}/bet`, {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function fetchWinGoMyBets(limit = 50) {
  return apiFetch<WinGoMyBet[]>(`/wingo/my-bets?limit=${limit}`);
}

// ---- 5D Lottery (five digits A-E, Win Go style duration tracks) --------------

export type FiveDDuration = 60 | 180 | 300 | 600;

export interface FiveDConfig {
  durations: FiveDDuration[];
  minStake: number;
  maxStake: number;
  maxPayout: number;
  lockSeconds: number;
  rtpPercent: number;
  /** Total return per unit staked, by bet key (e.g. "A:7", "B:BIG", "SUM:ODD"). */
  multipliers: Record<string, number>;
}

export interface FiveDRoundView {
  periodNumber: string;
  durationSeconds: FiveDDuration;
  startTime: string;
  endTime: string;
  serverTime: string;
  serverSeedHash: string;
  locked: boolean;
}

export interface FiveDResult {
  digits: number[];
  sum: number;
  sumSize: 'BIG' | 'SMALL';
  sumParity: 'ODD' | 'EVEN';
}

export interface FiveDHistoryEntry extends FiveDResult {
  periodNumber: string;
  serverSeed: string;
  serverSeedHash: string;
}

export interface FiveDMyBet {
  id: string;
  area: string;
  amount: string;
  multiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
  createdAt: string;
  periodNumber: string;
  durationSeconds: FiveDDuration;
  result: FiveDResult | null;
}

export function fetchFiveDConfig() {
  return apiFetch<FiveDConfig>('/5d/config');
}

export function fetchFiveDCurrent(duration: FiveDDuration) {
  return apiFetch<FiveDRoundView>(`/5d/${duration}/current`);
}

export function fetchFiveDHistory(duration: FiveDDuration, limit = 50) {
  return apiFetch<FiveDHistoryEntry[]>(`/5d/${duration}/history?limit=${limit}`);
}

export function placeFiveDBets(duration: FiveDDuration, bets: { area: string; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: FiveDMyBet[] }>(`/5d/${duration}/bet`, {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function fetchFiveDMyBets(limit = 50) {
  return apiFetch<FiveDMyBet[]>(`/5d/my-bets?limit=${limit}`);
}

// ---- Trx Win Go (Win Go numbers from TRON block hashes) ----------------------

export type TrxDuration = 60 | 180 | 300 | 600;

export interface TrxConfig {
  durations: TrxDuration[];
  minStake: number;
  maxStake: number;
  maxPayout: number;
  lockSeconds: number;
  rtpPercent: number;
  payouts: { number: number; size: number; violet: number; color: number; colorMixed: number };
  /** A round whose block can't be read for this long is refunded. */
  voidAfterMinutes: number;
}

export interface TrxRoundView {
  periodNumber: string;
  durationSeconds: TrxDuration;
  startTime: string;
  /** The draw: the first TRON block at or after this time decides the number. */
  endTime: string;
  serverTime: string;
  locked: boolean;
}

export interface TrxBlock {
  blockNumber: number;
  /** 64 hex characters; the number is its last decimal digit. */
  blockHash: string;
  blockTime: string;
}

export interface TrxResult extends TrxBlock {
  number: number;
  size: 'BIG' | 'SMALL';
  colors: ('GREEN' | 'RED' | 'VIOLET')[];
}

export interface TrxHistoryEntry extends TrxResult {
  periodNumber: string;
  drawAt: string;
}

export interface TrxMyBet {
  id: string;
  /** NUM:0-9, GREEN, RED, VIOLET, BIG or SMALL. */
  area: string;
  amount: string;
  paidMultiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
  createdAt: string;
  periodNumber: string;
  durationSeconds: TrxDuration;
  result: TrxResult | null;
}

export function fetchTrxConfig() {
  return apiFetch<TrxConfig>('/trx/config');
}

export function fetchTrxCurrent(duration: TrxDuration) {
  return apiFetch<TrxRoundView>(`/trx/${duration}/current`);
}

export function fetchTrxHistory(duration: TrxDuration, limit = 100) {
  return apiFetch<TrxHistoryEntry[]>(`/trx/${duration}/history?limit=${limit}`);
}

export function placeTrxBets(duration: TrxDuration, bets: { area: string; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: TrxMyBet[] }>(`/trx/${duration}/bet`, {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function fetchTrxMyBets(limit = 50) {
  return apiFetch<TrxMyBet[]>(`/trx/my-bets?limit=${limit}`);
}

// ---- Baccarat ----

export type BaccaratArea = 'PLAYER' | 'BANKER' | 'TIE' | 'PLAYER_PAIR' | 'BANKER_PAIR';
export type BaccaratWinner = 'PLAYER' | 'BANKER' | 'TIE';

export interface BaccaratConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  roundSeconds: number;
  betSeconds: number;
  resultAtSeconds: number;
  rtpPercent: number;
  multipliers: Record<BaccaratArea, number>;
}

export interface BaccaratHand {
  player: PlayingCard[];
  banker: PlayingCard[];
  playerTotal: number;
  bankerTotal: number;
  winner: BaccaratWinner;
  playerPair: boolean;
  bankerPair: boolean;
  natural: boolean;
}

export interface BaccaratRoundView {
  periodNumber: string;
  startTime: string;
  betEndTime: string;
  resultTime: string;
  endTime: string;
  serverTime: string;
  phase: 'BETTING' | 'DEALING' | 'RESULT';
  serverSeedHash: string;
  hand: BaccaratHand | null;
  serverSeed: string | null;
}

export interface BaccaratBet {
  id: string;
  area: BaccaratArea;
  amount: string;
  multiplier: string;
  paidMultiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
  createdAt: string;
}

export interface BaccaratHistoryEntry extends BaccaratHand {
  periodNumber: string;
}

export interface BaccaratMyBet extends BaccaratBet {
  periodNumber: string;
  hand: BaccaratHand | null;
}

export function fetchBaccaratConfig() {
  return apiFetch<BaccaratConfig>('/baccarat/config');
}

export function fetchBaccaratCurrent() {
  return apiFetch<BaccaratRoundView>('/baccarat/current');
}

export function fetchBaccaratHistory(limit = 100) {
  return apiFetch<BaccaratHistoryEntry[]>(`/baccarat/history?limit=${limit}`);
}

export function placeBaccaratBets(bets: { area: BaccaratArea; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: BaccaratBet[] }>('/baccarat/bet', {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function cancelBaccaratBets(betIds?: string[]) {
  return apiFetch<{ cancelled: string[]; refund: number }>('/baccarat/cancel', {
    method: 'POST',
    body: JSON.stringify(betIds ? { betIds } : {}),
  });
}

export function fetchBaccaratMyRound(periodNumber?: string) {
  const q = periodNumber ? `?periodNumber=${encodeURIComponent(periodNumber)}` : '';
  return apiFetch<{ periodNumber: string | null; bets: BaccaratBet[] }>(`/baccarat/my-round${q}`);
}

export function fetchBaccaratMyBets(limit = 50) {
  return apiFetch<BaccaratMyBet[]>(`/baccarat/my-bets?limit=${limit}`);
}

// ---- Royal Gems slot ----

export type SlotSymbol = 'J' | 'Q' | 'K' | 'A' | 'EMERALD' | 'SAPPHIRE' | 'RUBY' | 'WILD';

export interface SlotConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  symbols: SlotSymbol[];
  paytable: Record<SlotSymbol, number>;
  reels: SlotSymbol[][];
  paylines: [number, number, number][];
  multipliers: number[];
}

export interface SlotSpin {
  id: string;
  stake: string;
  stops: number[];
  grid: SlotSymbol[];
  winLines: number[];
  baseWin: string;
  multiplier: number;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}

export function fetchSlotConfig() {
  return apiFetch<SlotConfig>('/slot/config');
}

export function spinSlot(stake: number) {
  return apiFetch<SlotSpin>('/slot/spin', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchSlotHistory(limit = 30) {
  return apiFetch<SlotSpin[]>(`/slot/my-history?limit=${limit}`);
}

// ---- Golden Aces (cascading slot) ----

export type AcesCard = 'CLUB' | 'DIAMOND' | 'HEART' | 'SPADE' | 'J' | 'Q' | 'K' | 'A';
export type AcesSym = AcesCard | 'SCATTER' | 'WILD';
export interface AcesCell {
  s: AcesSym;
  g: boolean;
}
export interface AcesWayWin {
  symbol: AcesCard;
  reels: number;
  ways: number;
  pay: number;
}
export interface AcesStep {
  grid: AcesCell[][];
  multiplier: number;
  wins: AcesWayWin[];
  win: number;
  winning: [number, number][];
  flipped: [number, number][];
  bigJokers: [number, number][];
}
export interface AcesRound {
  steps: AcesStep[];
  final: AcesCell[][];
  scatters: number;
  win: number;
}
export interface AcesOutcome {
  base: AcesRound;
  freeGames: AcesRound[];
  totalWin: number;
}
export interface AcesSpinRow {
  id: string;
  stake: string;
  totalWin: string;
  payout: string;
  cascades: number;
  freeGames: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface AcesConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  paytable: Record<AcesCard, [number, number, number]>;
  baseMultipliers: number[];
  freeMultipliers: number[];
  freeGames: number;
  freeRetrigger: number;
  scattersToTrigger: number;
}

export function fetchAcesConfig() {
  return apiFetch<AcesConfig>('/aces/config');
}

export function spinAces(stake: number) {
  return apiFetch<{ spin: AcesSpinRow; outcome: AcesOutcome }>('/aces/spin', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchAcesHistory(limit = 30) {
  return apiFetch<AcesSpinRow[]>(`/aces/my-history?limit=${limit}`);
}

// ---- Dice ----

export interface DiceBet {
  id: string;
  stake: string;
  target: string;
  rollOver: boolean;
  multiplier: string;
  result: string;
  won: boolean;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface DiceConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  minChance: number;
  maxChance: number;
  rtpPercent: number;
}

export function fetchDiceConfig() {
  return apiFetch<DiceConfig>('/dice/config');
}

export function rollDice(stake: number, target: number, rollOver: boolean) {
  return apiFetch<DiceBet>('/dice/roll', { method: 'POST', body: JSON.stringify({ stake, target, rollOver }) });
}

export function fetchDiceHistory(limit = 30) {
  return apiFetch<DiceBet[]>(`/dice/my-history?limit=${limit}`);
}

// ---- Limbo ----

export interface LimboBet {
  id: string;
  stake: string;
  target: string;
  result: string;
  won: boolean;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface LimboConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  minTarget: number;
  maxTarget: number;
  rtpPercent: number;
}

export function fetchLimboConfig() {
  return apiFetch<LimboConfig>('/limbo/config');
}

export function playLimbo(stake: number, target: number) {
  return apiFetch<LimboBet>('/limbo/play', { method: 'POST', body: JSON.stringify({ stake, target }) });
}

export function fetchLimboHistory(limit = 30) {
  return apiFetch<LimboBet[]>(`/limbo/my-history?limit=${limit}`);
}

// ---- Blackjack ----

export type BlackjackAction = 'hit' | 'stand' | 'double' | 'split' | 'insurance' | 'noInsurance';
export type BlackjackOutcome = 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE' | 'BUST';
export interface BlackjackSeat {
  cards: number[];
  stake: number;
  doubled: boolean;
  fromSplit: boolean;
  done: boolean;
  outcome: BlackjackOutcome | null;
  payout: number;
  total: number;
  soft: boolean;
}
export interface BlackjackHand {
  id: string;
  stake: string;
  totalStake: string;
  payout: string;
  status: 'ACTIVE' | 'SETTLED';
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  phase: 'INSURANCE' | 'PLAYER' | 'DONE';
  /** Card numbers 0-51 (rank = card % 13, 0 = Ace; suit = floor(card / 13)); only the up card while the hand is live. */
  dealer: number[];
  dealerHidden: boolean;
  dealerTotal: number;
  dealerBlackjack: boolean | null;
  hands: BlackjackSeat[];
  active: number;
  insurance: { offered: boolean; taken: boolean | null; stake: number; payout: number };
  actions: BlackjackAction[];
}
export interface BlackjackConfig {
  minStake: number;
  maxStake: number;
  maxPayout?: number;
  winPays: number;
  blackjackPays: number;
  insurancePays: number;
  rtpPercent: number;
}

export function fetchBlackjackConfig() {
  return apiFetch<BlackjackConfig>('/blackjack/config');
}

export function dealBlackjack(stake: number) {
  return apiFetch<BlackjackHand>('/blackjack/deal', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function blackjackAction(handId: string, action: BlackjackAction) {
  return apiFetch<BlackjackHand>('/blackjack/action', { method: 'POST', body: JSON.stringify({ handId, action }) });
}

export function fetchActiveBlackjack() {
  return apiFetch<{ hand: BlackjackHand | null }>('/blackjack/active');
}

export function fetchBlackjackHistory(limit = 30) {
  return apiFetch<BlackjackHand[]>(`/blackjack/my-history?limit=${limit}`);
}

// ---- Keno ----

export type KenoRisk = 'CLASSIC' | 'LOW' | 'MEDIUM' | 'HIGH';
export interface KenoBet {
  id: string;
  stake: string;
  picks: number[];
  risk: KenoRisk;
  drawn: number[];
  hits: number;
  multiplier: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface KenoConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  board: number;
  drawn: number;
  maxPicks: number;
  risks: KenoRisk[];
  /** tables[risk][picks - 1][hits] = multiplier */
  tables: Record<KenoRisk, number[][]>;
  rtpPercent: number;
  rtpRange: [number, number];
}

export function fetchKenoConfig() {
  return apiFetch<KenoConfig>('/keno/config');
}

export function playKeno(stake: number, picks: number[], risk: KenoRisk) {
  return apiFetch<KenoBet>('/keno/bet', { method: 'POST', body: JSON.stringify({ stake, picks, risk }) });
}

export function fetchKenoHistory(limit = 30) {
  return apiFetch<KenoBet[]>(`/keno/my-history?limit=${limit}`);
}

// ---- Hi-Lo ----

export type HiloChoice = 'HIGHER' | 'LOWER' | 'SAME';
export type HiloAction = HiloChoice | 'SKIP' | 'CASHOUT';
export interface HiloStep {
  /** Card 0-51: rank = card % 13 (0 = Ace ... 12 = King), suit = floor(card / 13). */
  card: number;
  action: 'START' | 'SKIP' | HiloChoice;
  correct: boolean | null;
}
export interface HiloRound {
  id: string;
  stake: string;
  status: 'ACTIVE' | 'WON' | 'LOST';
  multiplier: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  steps: HiloStep[];
  wins: number;
  skipsLeft: number;
  currentMultiplier: number;
  cashOut: number;
  options: { choice: HiloChoice; chance: number; multiplier: number }[];
}
export interface HiloConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  maxSkips: number;
  rtpPercent: number;
}

export function fetchHiloConfig() {
  return apiFetch<HiloConfig>('/hilo/config');
}

export function startHilo(stake: number) {
  return apiFetch<HiloRound>('/hilo/start', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function hiloAction(roundId: string, action: HiloAction) {
  return apiFetch<HiloRound>('/hilo/action', { method: 'POST', body: JSON.stringify({ roundId, action }) });
}

export function fetchActiveHilo() {
  return apiFetch<{ round: HiloRound | null }>('/hilo/active');
}

export function fetchHiloHistory(limit = 30) {
  return apiFetch<HiloRound[]>(`/hilo/my-history?limit=${limit}`);
}

// ---- Dragon Tower ----

export type TowerDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT' | 'MASTER';
export interface TowerRound {
  id: string;
  stake: string;
  difficulty: TowerDifficulty;
  status: 'ACTIVE' | 'WON' | 'LOST';
  level: number;
  /** Tile picked on each level, bottom first. */
  picks: number[];
  /** Egg tiles on every level (bottom first) — only once the round is over. */
  layout: number[][] | null;
  multiplier: string;
  payout: string;
  tiles: number;
  eggs: number;
  currentMultiplier: number;
  nextMultiplier: number;
  cashOut: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface TowerConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rows: number;
  difficulties: Record<TowerDifficulty, { tiles: number; eggs: number }>;
  /** multipliers[difficulty][level - 1] */
  multipliers: Record<TowerDifficulty, number[]>;
  rtpPercent: number;
}

export function fetchTowerConfig() {
  return apiFetch<TowerConfig>('/dragon-tower/config');
}

export function startTower(stake: number, difficulty: TowerDifficulty) {
  return apiFetch<TowerRound>('/dragon-tower/start', { method: 'POST', body: JSON.stringify({ stake, difficulty }) });
}

export function pickTower(roundId: string, tile: number) {
  return apiFetch<TowerRound>('/dragon-tower/pick', { method: 'POST', body: JSON.stringify({ roundId, tile }) });
}

export function cashOutTower(roundId: string) {
  return apiFetch<TowerRound>('/dragon-tower/cashout', { method: 'POST', body: JSON.stringify({ roundId }) });
}

export function fetchActiveTower() {
  return apiFetch<{ round: TowerRound | null }>('/dragon-tower/active');
}

export function fetchTowerHistory(limit = 30) {
  return apiFetch<TowerRound[]>(`/dragon-tower/my-history?limit=${limit}`);
}

// ---- Video Poker ----

export type PokerHand = 'NOTHING' | 'JACKS_OR_BETTER' | 'TWO_PAIR' | 'THREE_OF_A_KIND' | 'STRAIGHT' | 'FLUSH' | 'FULL_HOUSE' | 'FOUR_OF_A_KIND' | 'STRAIGHT_FLUSH' | 'ROYAL_FLUSH';
export interface PokerRound {
  id: string;
  stake: string;
  status: 'ACTIVE' | 'WON' | 'LOST';
  /** Cards 0-51 (rank = card % 13, Ace = 0; suit = floor(card / 13)): as dealt while active, the final hand after the draw. */
  hand: number[];
  /** Positions (0-4) kept at the draw. */
  held: number[];
  /** The hand the five cards make: the dealt hand while active, the paid hand after the draw. */
  result: PokerHand;
  multiplier: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface PokerConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  /** Best hand first; multiplier is the total returned per unit bet. */
  paytable: { hand: PokerHand; multiplier: number }[];
  rtpPercent: number;
}

export function fetchPokerConfig() {
  return apiFetch<PokerConfig>('/video-poker/config');
}

export function dealPoker(stake: number) {
  return apiFetch<PokerRound>('/video-poker/deal', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function drawPoker(roundId: string, held: number[]) {
  return apiFetch<PokerRound>('/video-poker/draw', { method: 'POST', body: JSON.stringify({ roundId, held }) });
}

export function fetchActivePoker() {
  return apiFetch<{ round: PokerRound | null }>('/video-poker/active');
}

export function fetchPokerHistory(limit = 30) {
  return apiFetch<PokerRound[]>(`/video-poker/my-history?limit=${limit}`);
}

// ---- Diamonds ----

export type DiamondsResult = 'NONE' | 'PAIR' | 'TWO_PAIR' | 'THREE_OF_A_KIND' | 'FULL_HOUSE' | 'FOUR_OF_A_KIND' | 'FIVE_OF_A_KIND';
export interface DiamondsBet {
  id: string;
  stake: string;
  /** Colour (0-6) of each of the five gems, left to right. */
  gems: number[];
  result: DiamondsResult;
  multiplier: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface DiamondsConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  colors: number;
  /** Best result first. */
  paytable: { result: DiamondsResult; multiplier: number; chancePercent: number }[];
  rtpPercent: number;
}

export function fetchDiamondsConfig() {
  return apiFetch<DiamondsConfig>('/diamonds/config');
}

export function playDiamonds(stake: number) {
  return apiFetch<DiamondsBet>('/diamonds/play', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchDiamondsHistory(limit = 30) {
  return apiFetch<DiamondsBet[]>(`/diamonds/my-history?limit=${limit}`);
}

// ---- Pump ----

export type PumpDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
export interface PumpRound {
  id: string;
  stake: string;
  difficulty: PumpDifficulty;
  status: 'ACTIVE' | 'WON' | 'LOST';
  pumps: number;
  /** The pump the balloon pops on — only once the round is over. */
  popAt: number | null;
  multiplier: string;
  payout: string;
  maxPumps: number;
  currentMultiplier: number;
  nextMultiplier: number;
  /** Chance the next pump doesn't pop, in percent. */
  nextChance: number;
  cashOut: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface PumpConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  slots: number;
  difficulties: Record<PumpDifficulty, { pops: number; maxPumps: number }>;
  /** multipliers[difficulty][pumps - 1] */
  multipliers: Record<PumpDifficulty, number[]>;
  rtpPercent: number;
}

export function fetchPumpConfig() {
  return apiFetch<PumpConfig>('/pump/config');
}

export function startPump(stake: number, difficulty: PumpDifficulty) {
  return apiFetch<PumpRound>('/pump/start', { method: 'POST', body: JSON.stringify({ stake, difficulty }) });
}

export function pumpOnce(roundId: string) {
  return apiFetch<PumpRound>('/pump/pump', { method: 'POST', body: JSON.stringify({ roundId }) });
}

export function cashOutPump(roundId: string) {
  return apiFetch<PumpRound>('/pump/cashout', { method: 'POST', body: JSON.stringify({ roundId }) });
}

export function fetchActivePump() {
  return apiFetch<{ round: PumpRound | null }>('/pump/active');
}

export function fetchPumpHistory(limit = 30) {
  return apiFetch<PumpRound[]>(`/pump/my-history?limit=${limit}`);
}

// ---- Coin Flip ----

export type CoinSide = 'HEADS' | 'TAILS';
export interface CoinFlipRound {
  id: string;
  stake: string;
  status: 'ACTIVE' | 'WON' | 'LOST';
  wins: number;
  /** The side called on each flip and where it landed: 0 heads, 1 tails. */
  picks: number[];
  results: number[];
  multiplier: string;
  payout: string;
  maxFlips: number;
  currentMultiplier: number;
  nextMultiplier: number;
  cashOut: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface CoinFlipConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  maxFlips: number;
  /** multipliers[wins - 1] */
  multipliers: number[];
  rtpPercent: number;
}

export function fetchCoinFlipConfig() {
  return apiFetch<CoinFlipConfig>('/coinflip/config');
}

export function startCoinFlip(stake: number) {
  return apiFetch<CoinFlipRound>('/coinflip/start', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function flipCoin(roundId: string, side: CoinSide) {
  return apiFetch<CoinFlipRound>('/coinflip/flip', { method: 'POST', body: JSON.stringify({ roundId, side }) });
}

export function cashOutCoinFlip(roundId: string) {
  return apiFetch<CoinFlipRound>('/coinflip/cashout', { method: 'POST', body: JSON.stringify({ roundId }) });
}

export function fetchActiveCoinFlip() {
  return apiFetch<{ round: CoinFlipRound | null }>('/coinflip/active');
}

export function fetchCoinFlipHistory(limit = 30) {
  return apiFetch<CoinFlipRound[]>(`/coinflip/my-history?limit=${limit}`);
}

// ---- Casino Hold'em ----

export type HoldemHandClass = 'HIGH_CARD' | 'PAIR' | 'TWO_PAIR' | 'THREE_OF_A_KIND' | 'STRAIGHT' | 'FLUSH' | 'FULL_HOUSE' | 'FOUR_OF_A_KIND' | 'STRAIGHT_FLUSH' | 'ROYAL_FLUSH';
export type HoldemOutcome = 'FOLD' | 'DEALER_NOT_QUALIFIED' | 'WIN' | 'TIE' | 'LOSE';
export interface HoldemHand {
  id: string;
  ante: string;
  /** Ante plus the call, if made. */
  staked: string;
  status: 'ACTIVE' | 'WON' | 'LOST';
  /** Cards 0-51 (rank = card % 13, Ace = 0; suit = floor(card / 13)). */
  playerCards: number[];
  /** The flop while the hand is open, all five once it's over. */
  board: number[];
  /** Empty while the hand is open. */
  dealerCards: number[];
  action: 'CALL' | 'FOLD' | null;
  outcome: HoldemOutcome | null;
  player: { hand: HoldemHandClass; best: number[] } | null;
  dealer: { hand: HoldemHandClass; best: number[]; qualifies: boolean } | null;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface HoldemConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  /** Ante winnings (x to 1) by the player's hand, best first. */
  antePays: { hand: HoldemHandClass; pays: number }[];
  /** Call winnings (x to 1) when the player beats a qualifying dealer. */
  callPays: number;
  rtpPercent: number;
}

export function fetchHoldemConfig() {
  return apiFetch<HoldemConfig>('/casino-holdem/config');
}

export function dealHoldem(ante: number) {
  return apiFetch<HoldemHand>('/casino-holdem/deal', { method: 'POST', body: JSON.stringify({ ante }) });
}

export function holdemAction(handId: string, action: 'CALL' | 'FOLD') {
  return apiFetch<HoldemHand>('/casino-holdem/action', { method: 'POST', body: JSON.stringify({ handId, action }) });
}

export function fetchActiveHoldem() {
  return apiFetch<{ hand: HoldemHand | null }>('/casino-holdem/active');
}

export function fetchHoldemHistory(limit = 30) {
  return apiFetch<HoldemHand[]>(`/casino-holdem/my-history?limit=${limit}`);
}

// ---------- Three Card Poker ----------

export type ThreeCardHandClass = 'HIGH_CARD' | 'PAIR' | 'FLUSH' | 'STRAIGHT' | 'THREE_OF_A_KIND' | 'STRAIGHT_FLUSH';
export type ThreeCardOutcome = 'FOLD' | 'DEALER_NOT_QUALIFIED' | 'WIN' | 'TIE' | 'LOSE';
export interface ThreeCardHand {
  id: string;
  ante: string;
  /** Pair Plus side bet, "0" if none. */
  pairPlus: string;
  /** Ante, Pair Plus and the play bet, if made. */
  staked: string;
  status: 'ACTIVE' | 'WON' | 'LOST';
  /** Cards 0-51 (rank = card % 13, Ace = 0; suit = floor(card / 13)). */
  playerCards: number[];
  /** Empty while the hand is open. */
  dealerCards: number[];
  action: 'PLAY' | 'FOLD' | null;
  outcome: ThreeCardOutcome | null;
  player: { hand: ThreeCardHandClass };
  dealer: { hand: ThreeCardHandClass; qualifies: boolean } | null;
  /** Part of the payout that came from Pair Plus. */
  pairPlusPayout: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface ThreeCardConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  /** Ante winnings (x to 1) when the dealer doesn't qualify or the player wins. */
  antePays: number;
  /** Play winnings (x to 1) when the player beats a qualifying dealer. */
  playPays: number;
  /** Extra ante winnings for a straight or better whenever the player plays, best first. */
  anteBonus: { hand: ThreeCardHandClass; pays: number }[];
  /** Pair Plus winnings by the player's hand, best first. */
  pairPlus: { hand: ThreeCardHandClass; pays: number }[];
  rtpPercent: number;
  pairPlusRtpPercent: number;
}

export function fetchThreeCardConfig() {
  return apiFetch<ThreeCardConfig>('/three-card-poker/config');
}

export function dealThreeCard(ante: number, pairPlus: number) {
  return apiFetch<ThreeCardHand>('/three-card-poker/deal', { method: 'POST', body: JSON.stringify({ ante, pairPlus }) });
}

export function threeCardAction(handId: string, action: 'PLAY' | 'FOLD') {
  return apiFetch<ThreeCardHand>('/three-card-poker/action', { method: 'POST', body: JSON.stringify({ handId, action }) });
}

export function fetchActiveThreeCard() {
  return apiFetch<{ hand: ThreeCardHand | null }>('/three-card-poker/active');
}

export function fetchThreeCardHistory(limit = 30) {
  return apiFetch<ThreeCardHand[]>(`/three-card-poker/my-history?limit=${limit}`);
}

// ---------- Candy Blast (tumbling pay-anywhere slot) ----------

export type CandySymbol = 'BANANA' | 'GRAPES' | 'WATERMELON' | 'PLUM' | 'APPLE' | 'BLUE' | 'GREEN' | 'PURPLE' | 'HEART';
export type CandySym = CandySymbol | 'SCATTER' | 'BOMB';
export interface CandyCell {
  s: CandySym;
  /** A bomb's multiplier. */
  m?: number;
}
export interface CandyWin {
  symbol: CandySymbol;
  count: number;
  pay: number;
}
export interface CandyStep {
  /** Board before this step's burst (column by column, top row first). */
  grid: CandyCell[][];
  wins: CandyWin[];
  win: number;
  /** [col, row] of every bursting symbol. */
  burst: [number, number][];
}
export interface CandyRound {
  steps: CandyStep[];
  final: CandyCell[][];
  tumbleWin: number;
  /** Sum of the bombs on the final board, applied only if the tumbles won (0 = none). */
  bombTotal: number;
  scatters: number;
  scatterWin: number;
  win: number;
}
export interface CandyOutcome {
  base: CandyRound;
  freeSpins: CandyRound[];
  totalWin: number;
}
export interface CandySpinRow {
  id: string;
  stake: string;
  totalWin: string;
  payout: string;
  tumbles: number;
  freeSpins: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface CandyConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  cols: number;
  rows: number;
  minCount: number;
  /** Pays for [8-9, 10-11, 12+], best symbol first. */
  paytable: { symbol: CandySymbol; pays: [number, number, number] }[];
  /** Lollipops once the tumbles end: 4, 5, 6+. */
  scatterPays: [number, number, number];
  scattersToTrigger: number;
  scattersToRetrigger: number;
  freeSpins: number;
  freeRetrigger: number;
  bombValues: number[];
}

export function fetchCandyConfig() {
  return apiFetch<CandyConfig>('/candy-blast/config');
}

export function spinCandy(stake: number) {
  return apiFetch<{ spin: CandySpinRow; outcome: CandyOutcome }>('/candy-blast/spin', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchCandyHistory(limit = 30) {
  return apiFetch<CandySpinRow[]>(`/candy-blast/my-history?limit=${limit}`);
}

// ---------- Gates of Zeus (6x5 pay-anywhere tumbles with multiplier orbs) ----------

export type ZeusSymbol = 'BLUE' | 'GREEN' | 'PURPLE' | 'RED' | 'YELLOW' | 'CHALICE' | 'RING' | 'HOURGLASS' | 'CROWN';
export type ZeusSym = ZeusSymbol | 'SCATTER' | 'ORB';
export interface ZeusCell {
  s: ZeusSym;
  /** An orb's multiplier. */
  m?: number;
}
export interface ZeusStep {
  grid: ZeusCell[][];
  wins: { symbol: ZeusSymbol; count: number; pay: number }[];
  win: number;
  burst: [number, number][];
}
export interface ZeusRound {
  steps: ZeusStep[];
  final: ZeusCell[][];
  tumbleWin: number;
  /** Orbs on the final board, counted only if the tumbles won (0 = none). */
  orbTotal: number;
  /** What the tumble win was multiplied by (1 = none); in free spins, the running total. */
  multiplier: number;
  scatters: number;
  scatterWin: number;
  win: number;
}
export interface ZeusOutcome {
  base: ZeusRound;
  freeSpins: ZeusRound[];
  finalMultiplier: number;
  totalWin: number;
}
export interface ZeusSpinRow {
  id: string;
  stake: string;
  totalWin: string;
  payout: string;
  tumbles: number;
  freeSpins: number;
  finalMultiplier: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface ZeusConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  cols: number;
  rows: number;
  minCount: number;
  paytable: { symbol: ZeusSymbol; pays: [number, number, number] }[];
  scatterPays: [number, number, number];
  scattersToTrigger: number;
  scattersToRetrigger: number;
  freeSpins: number;
  freeRetrigger: number;
  orbValues: number[];
  maxWinX: number;
}

export function fetchZeusConfig() {
  return apiFetch<ZeusConfig>('/gates-of-zeus/config');
}

export function spinZeus(stake: number) {
  return apiFetch<{ spin: ZeusSpinRow; outcome: ZeusOutcome }>('/gates-of-zeus/spin', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchZeusHistory(limit = 30) {
  return apiFetch<ZeusSpinRow[]>(`/gates-of-zeus/my-history?limit=${limit}`);
}

// ---------- Wolf Moon (25-line slot with free spins and a Money Respin) ----------

export type WolfPayer = 'BUFFALO' | 'EAGLE' | 'COUGAR' | 'HORSE' | 'ACE' | 'KING' | 'QUEEN' | 'JACK';
export type WolfSym = WolfPayer | 'WILD' | 'SCATTER' | 'MOON';
export interface WolfCell {
  s: WolfSym;
  /** A moon's value in total bets. */
  v?: number;
  j?: 'MINI' | 'MAJOR';
}
export interface WolfLineWin {
  line: number;
  symbol: WolfPayer;
  count: number;
  pay: number;
}
export interface WolfBoard {
  grid: WolfCell[][];
  lines: WolfLineWin[];
  lineWin: number;
}
export interface WolfRespin {
  start: (WolfCell | null)[][];
  steps: { landed: [number, number, WolfCell][]; left: number }[];
  final: (WolfCell | null)[][];
  cash: number;
  minis: number;
  majors: number;
  mega: boolean;
  win: number;
}
export interface WolfOutcome {
  base: WolfBoard;
  scatters: number;
  moons: number;
  freeSpins: (WolfBoard & { giant: WolfSym })[];
  respin: WolfRespin | null;
  totalWin: number;
}
export interface WolfSpinRow {
  id: string;
  stake: string;
  totalWin: string;
  payout: string;
  freeSpins: number;
  moneyRespin: boolean;
  jackpot: 'MINI' | 'MAJOR' | 'MEGA' | null;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface WolfConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  rtpPercent: number;
  cols: number;
  rows: number;
  lines: number[][];
  paytable: { symbol: WolfPayer; pays: [number, number, number] }[];
  freeSpins: number;
  scatterReels: number[];
  moonsToTrigger: number;
  respins: number;
  moonValues: number[];
  jackpots: { MINI: number; MAJOR: number; MEGA: number };
  maxWinX: number;
}

export function fetchWolfConfig() {
  return apiFetch<WolfConfig>('/wolf-moon/config');
}

export function spinWolf(stake: number) {
  return apiFetch<{ spin: WolfSpinRow; outcome: WolfOutcome }>('/wolf-moon/spin', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchWolfHistory(limit = 30) {
  return apiFetch<WolfSpinRow[]>(`/wolf-moon/my-history?limit=${limit}`);
}

// ---------- Neon 777 (classic one-line slot with a Special Reel) ----------

export type Neon777Symbol = 'BLANK' | 'BAR1' | 'BAR2' | 'BAR3' | 'BLUE7' | 'RED7';
export type Neon777Result = 'RED7' | 'BLUE7' | 'ANY7' | 'BAR3' | 'BAR2' | 'BAR1' | 'ANYBAR' | 'NONE';
export interface Neon777Special {
  kind: 'NONE' | 'MULT' | 'BONUS' | 'RESPIN';
  value: number;
  chancePercent: number;
}
export interface Neon777Round {
  /** Stop of each main reel on its strip (the middle row). */
  stops: number[];
  /** Index into the config's special list. */
  special: number;
  result: Neon777Result;
  linePays: number;
  win: number;
}
export interface Neon777Outcome {
  rounds: Neon777Round[];
  totalWin: number;
}
export interface Neon777SpinRow {
  id: string;
  stake: string;
  totalWin: string;
  payout: string;
  respins: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface Neon777Config {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  strips: Neon777Symbol[][];
  linePays: Record<Exclude<Neon777Result, 'NONE'>, number>;
  special: Neon777Special[];
  maxRespins: number;
  hitRatePercent: number;
  rtpPercent: number;
}

export function fetchNeon777Config() {
  return apiFetch<Neon777Config>('/neon-777/config');
}

export function spinNeon777(stake: number) {
  return apiFetch<{ spin: Neon777SpinRow; outcome: Neon777Outcome }>('/neon-777/spin', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchNeon777History(limit = 30) {
  return apiFetch<Neon777SpinRow[]>(`/neon-777/my-history?limit=${limit}`);
}

// ---------- Fruit Machine (pub-style 3x3, five lines, Auto Nudge and Cash Ladder) ----------

export type FruitSymbol = 'CHERRY' | 'LEMON' | 'ORANGE' | 'PLUM' | 'GRAPES' | 'MELON' | 'BELL' | 'BAR' | 'SEVEN' | 'STAR';
export interface FruitLineWin {
  /** Index into the config's lines. */
  line: number;
  symbol: FruitSymbol;
  count: number;
  /** In line bets (the stake / lineCount). */
  pays: number;
}
export interface FruitOutcome {
  /** Where the reels first stop (the middle row's position on each strip). */
  stops: number[];
  nudges: number;
  /** Drops spent on each reel. */
  nudgePlan: number[];
  finalStops: number[];
  lines: FruitLineWin[];
  /** Top Cash Ladder rung reached (index into the config's ladder), or -1. */
  ladderRung: number;
  /** In stakes. */
  totalWin: number;
}
export interface FruitSpinRow {
  id: string;
  stake: string;
  totalWin: string;
  payout: string;
  nudges: number;
  ladderRung: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface FruitMachineConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  strips: FruitSymbol[][];
  lines: number[][];
  threePays: Partial<Record<FruitSymbol, number>>;
  twoCherries: number;
  lineCount: number;
  nudgeChances: { nudges: number; chancePercent: number }[];
  ladder: number[];
  climbChancePercent: number[];
  hitRatePercent: number;
  rtpPercent: number;
}

export function fetchFruitMachineConfig() {
  return apiFetch<FruitMachineConfig>('/fruit-machine/config');
}

export function spinFruitMachine(stake: number) {
  return apiFetch<{ spin: FruitSpinRow; outcome: FruitOutcome }>('/fruit-machine/spin', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchFruitMachineHistory(limit = 30) {
  return apiFetch<FruitSpinRow[]>(`/fruit-machine/my-history?limit=${limit}`);
}

// ---------- Fisherman's Catch (5x3, ten lines, fish-collecting free spins) ----------

export type FishSymbol = 'JACK' | 'QUEEN' | 'KING' | 'ACE' | 'LURE' | 'TACKLE' | 'ROD' | 'FISH' | 'BONUS' | 'WILD';
export interface FishLineWin {
  line: number;
  symbol: FishSymbol;
  count: number;
  /** In line bets (the stake / lineCount). */
  pays: number;
}
export interface FishFreeSpin {
  stops: number[];
  /** [reel][row] cash value of each fish, in stakes (0 where there's no fish). */
  fishValues: number[][];
  lines: FishLineWin[];
  fishermen: number;
  multiplier: number;
  /** In stakes. */
  collect: number;
  /** In stakes. */
  win: number;
  collected: number;
  spinsLeft: number;
  retrigger: number;
}
export interface FishermanOutcome {
  stops: number[];
  fishValues: number[][];
  lines: FishLineWin[];
  baseWin: number;
  boats: number;
  freeSpinsAwarded: number;
  freeSpins: FishFreeSpin[];
  /** In stakes. */
  totalWin: number;
}
export interface FishermanSpinRow {
  id: string;
  stake: string;
  totalWin: string;
  payout: string;
  freeSpins: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface FishermanConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  baseStrips: FishSymbol[][];
  freeStrips: FishSymbol[][];
  lines: number[][];
  lineCount: number;
  pays: Partial<Record<FishSymbol, [number, number, number]>>;
  wildPays: [number, number, number];
  fishValues: { value: number; chancePercent: number }[];
  freeSpinsFor: Record<string, number>;
  multipliers: number[];
  fishermenPerLevel: number;
  retriggerSpins: number;
  featureChancePercent: number;
  rtpPercent: number;
}

export function fetchFishermanConfig() {
  return apiFetch<FishermanConfig>('/fishermans-catch/config');
}

export function spinFisherman(stake: number) {
  return apiFetch<{ spin: FishermanSpinRow; outcome: FishermanOutcome }>('/fishermans-catch/spin', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchFishermanHistory(limit = 30) {
  return apiFetch<FishermanSpinRow[]>(`/fishermans-catch/my-history?limit=${limit}`);
}

// ---------- Book of Pharaoh (5x3, ten lines, book wild/scatter, expanding free-spin symbol) ----------

export type PharaohSymbol = 'TEN' | 'JACK' | 'QUEEN' | 'KING' | 'ACE' | 'ANKH' | 'SCARAB' | 'EYE' | 'PHARAOH' | 'BOOK';
export interface PharaohLineWin {
  line: number;
  symbol: PharaohSymbol;
  count: number;
  /** In line bets (the stake / lineCount). */
  pays: number;
}
export interface PharaohFreeSpin {
  stops: number[];
  lines: PharaohLineWin[];
  books: number;
  /** Reels the special symbol filled (empty when it didn't pay). */
  expandReels: number[];
  /** In stakes. */
  expand: number;
  /** In stakes. */
  win: number;
  retrigger: number;
  spinsLeft: number;
}
export interface PharaohOutcome {
  stops: number[];
  lines: PharaohLineWin[];
  books: number;
  /** Lines plus book scatter, in stakes. */
  baseWin: number;
  special: PharaohSymbol | null;
  freeSpins: PharaohFreeSpin[];
  /** In stakes. */
  totalWin: number;
}
export interface PharaohSpinRow {
  id: string;
  stake: string;
  totalWin: string;
  payout: string;
  freeSpins: number;
  special: PharaohSymbol | null;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}
export interface BookOfPharaohConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  strips: PharaohSymbol[][];
  lines: number[][];
  lineCount: number;
  pays: Record<Exclude<PharaohSymbol, 'BOOK'>, [number, number, number, number]>;
  scatterPays: Record<string, number>;
  freeSpins: number;
  featureChancePercent: number;
  rtpPercent: number;
}

export function fetchBookOfPharaohConfig() {
  return apiFetch<BookOfPharaohConfig>('/book-of-pharaoh/config');
}

export function spinBookOfPharaoh(stake: number) {
  return apiFetch<{ spin: PharaohSpinRow; outcome: PharaohOutcome }>('/book-of-pharaoh/spin', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchBookOfPharaohHistory(limit = 30) {
  return apiFetch<PharaohSpinRow[]>(`/book-of-pharaoh/my-history?limit=${limit}`);
}

// ---- Money Coming --------------------------------------------------------------

export interface MoneyComingSpecial {
  kind: 'NONE' | 'MULT' | 'WHEEL' | 'RESPIN';
  value: number;
  chancePercent: number;
}

export interface MoneyComingRound {
  stops: number[];
  special: number;
  /** Index into the wheel when the Lucky Wheel spun, else null. */
  wheel: number | null;
  /** The number the middle row reads (0 for no win). */
  reads: number;
  linePays: number;
  win: number;
}

export interface MoneyComingOutcome {
  rounds: MoneyComingRound[];
  totalWin: number;
}

export interface MoneyComingSpinRow {
  id: string;
  stake: string;
  totalWin: string;
  payout: string;
  respins: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}

export interface MoneyComingConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  strips: string[][];
  special: MoneyComingSpecial[];
  wheel: number[];
  maxRespins: number;
  hitRatePercent: number;
  rtpPercent: number;
}

export function fetchMoneyComingConfig() {
  return apiFetch<MoneyComingConfig>('/money-coming/config');
}

export function spinMoneyComing(stake: number) {
  return apiFetch<{ spin: MoneyComingSpinRow; outcome: MoneyComingOutcome }>('/money-coming/spin', { method: 'POST', body: JSON.stringify({ stake }) });
}

export function fetchMoneyComingHistory(limit = 30) {
  return apiFetch<MoneyComingSpinRow[]>(`/money-coming/my-history?limit=${limit}`);
}

// --- Gift codes (the Home gift box) ---

export type GiftCodeRedeemed = { amount: number; balance: number };

export function redeemGiftCode(code: string) {
  return apiFetch<GiftCodeRedeemed>('/gift-codes/redeem', { method: 'POST', body: JSON.stringify({ code }) });
}

// --- Deposit / withdrawal history ---

export type WalletHistoryKind = 'deposit' | 'withdraw';

export type WalletHistory = {
  kind: WalletHistoryKind;
  /** All-time total of completed ones. */
  total: number;
  count: number;
  /** Withdrawals still waiting for approval. */
  pending: number;
  items: { id: string; amount: number; status: 'PENDING' | 'COMPLETED' | 'FAILED'; createdAt: string }[];
};

export function fetchWalletHistory(kind: WalletHistoryKind) {
  return apiFetch<WalletHistory>(`/wallet/history?kind=${kind}`);
}

// --- Balance records (every balance change) ---

export type BalanceRecordFilter = 'all' | 'income' | 'expense';

export type BalanceRecord = {
  id: string;
  type: BackendTransaction['type'];
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  provider: string | null;
  amount: number;
  /** Signed change to the balance (0 for a deposit that never completed). */
  change: number;
  /** Balance right after this record. */
  balanceAfter: number;
  createdAt: string;
};

export function fetchBalanceRecords(filter: BalanceRecordFilter, before?: string) {
  const params = `filter=${filter}&limit=50${before ? `&before=${before}` : ''}`;
  return apiFetch<{ items: BalanceRecord[]; hasMore: boolean }>(`/wallet/records?${params}`);
}

// --- VIP and ranking (real data) ---

export type VipStatus = {
  /** Total staked in games; ₹1 = 1 XP. */
  xp: number;
  level: number;
  levels: { level: number; xpRequired: number; weeklyBonus?: number; upgradeBonus?: number }[];
  claimedUpgrades: number[];
  /** Levels whose weekly bonus was already taken this week. */
  weeklyClaimedLevels: number[];
  history: { kind: 'upgrade' | 'weekly'; level: number; amount: number; createdAt: string }[];
};

export function fetchVipStatus() {
  return apiFetch<VipStatus>('/players/vip');
}

export function claimVipBonus(kind: 'upgrade' | 'weekly', level: number) {
  return apiFetch<{ amount: number; balance: number }>('/players/vip/claim', { method: 'POST', body: JSON.stringify({ kind, level }) });
}

export type Ranking = {
  periodDays: number;
  top: { rank: number; name: string; won: number; isMe: boolean }[];
  me: { rank: number | null; won: number };
  players: number;
};

export function fetchRanking() {
  return apiFetch<Ranking>('/players/ranking');
}
