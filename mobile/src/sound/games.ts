import type { SoundEvent } from './types';

/** The generic cues the screens that already trigger their own sounds use. */
export type GameCue = 'tick' | 'win' | 'land' | 'big' | 'lose';

export type GameKind =
  /** Aviator-style: the sound follows the round (take-off, flight, crash) and your bet. */
  | 'crash'
  /** Start, then safe steps, then cash out or lose (Mines, Chicken Road, …). */
  | 'steps'
  /** One request plays the whole round (wheel, slots, dice duel, …). */
  | 'instant'
  /** Timed rounds you bet on (Roulette, Baccarat, Dragon Tiger, …). */
  | 'table'
  /** Timed number draws (Win Go, K3, 5D, TRX). */
  | 'lottery'
  /** The screen plays its own cues (tick / land / win) at the right moments. */
  | 'screen';

export interface GameDef {
  /** Folder of the sound pack in assets/sounds/games. */
  key: string;
  /** Route name in the navigator. */
  route: string;
  /** API prefix (what apiFetch is called with, no host). */
  path: string;
  kind: GameKind;
  /** steps: the calls (after `path`) that start a round, take a step and cash out. */
  steps?: { start: string; step: string; cashout: string };
  /** instant: the call (after `path`) that plays a round. */
  play?: string;
  /** instant: ms after the press when the reels / dice / balls settle, and when the result is shown. */
  landAt?: number;
  resultAt?: number;
  /** lottery: how long before the end of a round its 'countdown' sound starts (the sound's last ding falls on the end). */
  countdownMs?: number;
  /** screen: where the screen's generic cues land in the pack. Defaults: tick→tick, land→land, win→win. */
  cues?: Partial<Record<GameCue, SoundEvent>>;
}

const crash = (key: string, route: string, path: string): GameDef => ({ key, route, path, kind: 'crash' });
const steps = (key: string, route: string, path: string, step: string): GameDef => ({
  key,
  route,
  path,
  kind: 'steps',
  steps: { start: '/start', step, cashout: '/cashout' },
});
const instant = (key: string, route: string, path: string, play: string, landAt: number, resultAt = 2700): GameDef => ({
  key,
  route,
  path,
  kind: 'instant',
  play,
  landAt,
  resultAt,
});
const table = (key: string, route: string, path: string): GameDef => ({ key, route, path, kind: 'table' });
const lottery = (key: string, route: string, path: string, countdownMs?: number): GameDef => ({ key, route, path, kind: 'lottery', countdownMs });
const screen = (key: string, route: string, path: string, cues?: GameDef['cues']): GameDef => ({ key, route, path, kind: 'screen', cues });

export const GAMES: GameDef[] = [
  crash('aviator', 'Aviator', '/aviator'),
  crash('cricketx', 'CricketX', '/cricket-x'),
  crash('rocket', 'Rocket', '/rocket'),
  crash('goalrush', 'GoalRush', '/goal-rush'),
  crash('bigcatch', 'BigCatch', '/big-catch'),
  crash('cosmonaut', 'Cosmonaut', '/cosmonaut'),
  crash('skyjet', 'SkyJet', '/sky-jet'),
  crash('nightracer', 'NightRacer', '/night-racer'),
  crash('airship', 'Airship', '/airship'),

  steps('chickenroad', 'ChickenRoad', '/chicken-road', '/advance'),
  steps('mines', 'Mines', '/mines', '/reveal'),
  steps('treasuredig', 'TreasureDig', '/treasure-dig', '/dig'),
  steps('bombsquad', 'BombSquad', '/bomb-squad', '/cut'),
  steps('vaultheist', 'VaultHeist', '/vault-heist', '/crack'),
  steps('penaltyhero', 'PenaltyHero', '/penalty', '/kick'),
  steps('luckycups', 'LuckyCups', '/lucky-cups', '/pick'),

  instant('luckywheel', 'LuckyWheel', '/lucky-wheel', '/spin', 2200, 4300),
  instant('diceduel', 'DiceDuel', '/dice-duel', '/play', 1300),
  instant('colorball', 'ColorBall', '/color-ball', '/play', 1800),
  instant('fortunesix', 'FortuneSix', '/fortune-six', '/play', 300),
  instant('wolfmoon', 'WolfMoon', '/wolf-moon', '/spin', 1500),
  instant('fruitmachine', 'FruitMachine', '/fruit-machine', '/spin', 1500),
  instant('fishermanscatch', 'FishermansCatch', '/fishermans-catch', '/spin', 1500),
  instant('bookofpharaoh', 'BookOfPharaoh', '/book-of-pharaoh', '/spin', 1500),

  table('sevenupdown', 'SevenUpDown', '/seven-up-down'),
  table('dragontiger', 'DragonTiger', '/dragon-tiger'),
  table('andarbahar', 'AndarBahar', '/andar-bahar'),
  table('teenpatti', 'TeenPatti', '/teen-patti'),
  table('jhandimunda', 'JhandiMunda', '/jhandi-munda'),
  table('roulette', 'Roulette', '/roulette'),
  table('baccarat', 'Baccarat', '/baccarat'),

  lottery('wingo', 'WinGo', '/wingo', 5100),
  lottery('k3', 'K3Lottery', '/k3', 5100),
  lottery('fived', 'FiveDLottery', '/5d', 5100),
  lottery('trxwin', 'TrxWin', '/trx', 5100),

  // The screens below already play their own cues at the right moments; the sound here only picks the pack.
  screen('scratchcard', 'ScratchCard', '/scratch-card', { land: 'start' }),
  screen('aces', 'Aces', '/aces'),
  screen('blackjack', 'Blackjack', '/blackjack', { land: 'lose' }),
  screen('candyblast', 'CandyBlast', '/candy-blast'),
  screen('casinoholdem', 'CasinoHoldem', '/casino-holdem', { land: 'lose' }),
  screen('coinflip', 'CoinFlip', '/coinflip', { tick: 'step', land: 'lose' }),
  screen('diamonds', 'Diamonds', '/diamonds', { land: 'lose' }),
  screen('dice', 'Dice', '/dice', { land: 'lose' }),
  screen('dragontower', 'DragonTower', '/dragon-tower', { tick: 'step', land: 'special' }),
  screen('gatesofzeus', 'GatesOfZeus', '/gates-of-zeus'),
  screen('hilo', 'Hilo', '/hilo', { tick: 'step', land: 'lose' }),
  screen('keno', 'Keno', '/keno'),
  screen('limbo', 'Limbo', '/limbo', { tick: 'start', land: 'land' }),
  screen('moneycoming', 'MoneyComing', '/money-coming'),
  screen('neon777', 'Neon777', '/neon-777'),
  screen('plinko', 'Plinko', '/plinko'),
  screen('pump', 'Pump', '/pump', { tick: 'step', land: 'special' }),
  screen('slot', 'Slot', '/slot'),
  screen('threecardpoker', 'ThreeCardPoker', '/three-card-poker', { land: 'lose' }),
  screen('videopoker', 'VideoPoker', '/video-poker', { land: 'lose' }),
  screen('vortex', 'Vortex', '/vortex'),
];

export const GAMES_BY_KEY: Record<string, GameDef> = Object.fromEntries(GAMES.map((g) => [g.key, g]));
const BY_ROUTE: Record<string, GameDef> = Object.fromEntries(GAMES.map((g) => [g.route, g]));
const BY_SEGMENT: Record<string, GameDef> = Object.fromEntries(GAMES.map((g) => [g.path.slice(1), g]));

export function gameForRoute(route: string | undefined | null): GameDef | null {
  return (route && BY_ROUTE[route]) || null;
}

/** The game an API path belongs to ('/wingo/60/bet' → Win Go), if any. */
export function gameForPath(path: string): GameDef | null {
  const seg = path.split('?')[0].split('/')[1];
  return (seg && BY_SEGMENT[seg]) || null;
}
