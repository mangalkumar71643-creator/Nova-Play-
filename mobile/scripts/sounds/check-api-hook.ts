/**
 * Checks sound/apiHook.ts against made-up API traffic, on a virtual clock (no audio, no network):
 *   cd mobile && npx tsx scripts/sounds/check-api-hook.ts
 * It prints every check and exits with 1 if any fails.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../src/sound');

// ------------------------------------------------------------ virtual clock
let now = Date.UTC(2026, 0, 1, 12, 0, 0);
let nextId = 1;
const timers: { id: number; at: number; fn: () => void }[] = [];
(globalThis as any).setTimeout = (fn: () => void, ms = 0) => {
  const id = nextId++;
  timers.push({ id, at: now + Math.max(0, ms), fn });
  return id;
};
(globalThis as any).clearTimeout = (id: number) => {
  const i = timers.findIndex((t) => t.id === id);
  if (i >= 0) timers.splice(i, 1);
};
Date.now = () => now;
function advance(ms: number) {
  const end = now + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    timers.shift();
    now = t.at;
    t.fn();
  }
  now = end;
}

// ------------------------------------------------------------ a stand-in for the engine
const packEvents: Record<string, string[]> = {};
const packsSource = fs.readFileSync(path.join(SRC, 'packs.ts'), 'utf8');
for (const m of packsSource.matchAll(/^ {2}(\w+): \{\n([\s\S]*?)^ {2}\},/gm)) {
  packEvents[m[1]] = [...m[2].matchAll(/^ {4}(\w+):/gm)].map((x) => x[1]);
}

let calls: string[] = [];
let base = now;
const stamp = () => `${now - base}`;
const results: Record<string, number> = {};
const activeListeners: ((k: string | null) => void)[] = [];
const fakeEngine = {
  BIG_WIN_MULTIPLIER: 10,
  playFor: (g: string, ev: string, opts?: { rate?: number }) => calls.push(`${stamp()} ${g}.${ev}${opts?.rate ? `@${opts.rate.toFixed(2)}` : ''}`),
  stopFor: (g: string, ev: string) => calls.push(`${stamp()} ${g}.stop(${ev})`),
  fadeFor: (g: string, ev: string) => calls.push(`${stamp()} ${g}.fade(${ev})`),
  hasFor: (g: string, ev: string) => (packEvents[g] ?? []).includes(ev),
  loopFor: (g: string, on: boolean) => calls.push(`${stamp()} ${g}.loop(${on ? 'on' : 'off'})`),
  noteResult: (g: string, mult: number) => {
    results[g] = mult;
  },
  onActiveGameChange: (fn: (k: string | null) => void) => activeListeners.push(fn),
};
const enginePath = require.resolve(path.join(SRC, 'engine'));
require.cache[enginePath] = { id: enginePath, filename: enginePath, loaded: true, exports: fakeEngine, children: [], paths: [] } as any;

const hook = require(path.join(SRC, 'apiHook')) as typeof import('../../src/sound/apiHook');

// ------------------------------------------------------------ tiny test kit
let failed = 0;
function check(name: string, got: string[], want: string[]) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`}`);
}
function fresh(game: string) {
  activeListeners.forEach((fn) => fn(game === 'none' ? null : 'other')); // forget everything
  calls = [];
  base = now;
}
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
const post = (p: string, body: unknown, req?: unknown) => hook.sfxResponse('POST', p, req === undefined ? undefined : JSON.stringify(req), body);
const get = (p: string, body: unknown) => hook.sfxResponse('GET', p, undefined, body);
const drain = () => advance(60_000);

// ------------------------------------------------------------ crash game
fresh('aviator');
post('/aviator/bet', { id: 'b1', amount: '100', status: 'PENDING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'BETTING' });
advance(500);
get('/aviator/current', { periodNumber: 'p1', phase: 'FLYING' });
advance(1000);
get('/aviator/current', { periodNumber: 'p1', phase: 'FLYING' });
advance(1000);
get('/aviator/current', { periodNumber: 'p1', phase: 'CRASHED' });
advance(300);
get('/aviator/my-bets', [{ id: 'b1', status: 'LOST', payout: '0', amount: '100' }]);
drain();
check('crash: bet, take-off + flight loop, crash, then the loss', calls, [
  '0 aviator.start', '500 aviator.launch', '500 aviator.loop(on)', '2500 aviator.loop(off)', '2500 aviator.special', '2800 aviator.lose',
]);

fresh('aviator');
post('/aviator/bet', { id: 'b1', amount: '100', status: 'PENDING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'BETTING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'FLYING' });
advance(2000);
post('/aviator/cashout', { multiplier: 2.5, payout: 250 }, { betId: 'b1' });
get('/aviator/current', { periodNumber: 'p1', phase: 'CRASHED' });
drain();
check('crash: a cashed-out bet hears the cash-out and no loss', calls, [
  '0 aviator.start', '0 aviator.launch', '0 aviator.loop(on)', '2000 aviator.cashout', '2000 aviator.loop(off)', '2000 aviator.special',
]);

fresh('aviator');
post('/aviator/bet', { id: 'b1', amount: '10', status: 'PENDING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'BETTING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'FLYING' });
post('/aviator/cashout', { multiplier: 14.2, payout: 142 }, { betId: 'b1' });
drain();
check('crash: a cash-out at 10x or more is a big win', calls.filter((c) => /cashout|bigwin/.test(c)), ['0 aviator.bigwin']);

fresh('aviator');
post('/aviator/bet', { id: 'b1', amount: '10', status: 'PENDING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'BETTING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'FLYING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'CRASHED' });
drain();
check('crash: no settled reply -> the loss still comes (1.6 s later)', calls.filter((c) => /lose|special/.test(c)), ['0 aviator.special', '1600 aviator.lose']);

fresh('aviator');
get('/aviator/current', { periodNumber: 'p1', phase: 'BETTING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'FLYING' });
drain();
check('crash: the loop stops by itself when polling stops', calls, ['0 aviator.launch', '0 aviator.loop(on)', '3500 aviator.loop(off)']);

fresh('aviator');
get('/aviator/current', { periodNumber: 'p1', phase: 'FLYING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'CRASHED' });
drain();
check('crash: opening mid-flight loops but does not announce a take-off or a loss', calls, ['0 aviator.loop(on)', '0 aviator.loop(off)', '0 aviator.special']);

fresh('aviator');
post('/aviator/bet', { id: 'b1', amount: '100', status: 'PENDING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'BETTING' });
get('/aviator/current', { periodNumber: 'p1', phase: 'FLYING' });
advance(1500);
get('/aviator/current', { periodNumber: 'p1', phase: 'FLYING' });
advance(1500);
get('/aviator/current', { periodNumber: 'p1', phase: 'FLYING' });
const beforeCrash = calls.length;
check('crash: nothing warns the player while the plane is still flying (only the bet was heard)', calls.filter((c) => /special|lose|fade|stop/.test(c)), []);
advance(400);
get('/aviator/current', { periodNumber: 'p1', phase: 'CRASHED' });
check('crash: the crash sound starts when the crash is known, not before', calls.slice(beforeCrash).filter((c) => /special/.test(c)), ['3400 aviator.special']);

// ------------------------------------------------------------ step games
fresh('mines');
post('/mines/start', { id: 'r1', status: 'PENDING', stake: '10' });
post('/mines/reveal', { round: { id: 'r1', status: 'PENDING', multiplier: '1.10' }, hitMine: false });
post('/mines/reveal', { round: { id: 'r1', status: 'PENDING', multiplier: '1.25' }, hitMine: false });
post('/mines/reveal', { round: { id: 'r1', status: 'LOST', multiplier: '0.00' }, hitMine: true });
drain();
check('steps: start, rising steps, a mine (explosion then the loss)', calls, [
  '0 mines.start', '0 mines.step@1.04', '0 mines.step@1.08', '0 mines.special', '700 mines.lose',
]);
fresh('mines');
post('/mines/start', { id: 'r1', status: 'PENDING', stake: '10' });
post('/mines/cashout', { id: 'r1', status: 'WON', multiplier: '3.20', payout: '32.00' });
post('/mines/cashout', { id: 'r2', status: 'WON', multiplier: '25.00', payout: '250.00' });
check('steps: cash-out, and a big one', calls, ['0 mines.start', '0 mines.cashout', '0 mines.bigwin']);
fresh('penaltyhero');
post('/penalty/start', { id: 'r1', status: 'PENDING' });
post('/penalty/kick', { round: { id: 'r1', status: 'PENDING', multiplier: '1.5' }, shot: { saved: false } });
check('steps: another route name (kick)', calls, ['0 penaltyhero.start', '0 penaltyhero.step@1.04']);

// ------------------------------------------------------------ instant games
fresh('wolfmoon');
hook.sfxRequest('POST', '/wolf-moon/spin');
advance(400);
post('/wolf-moon/spin', { spin: { stake: '10', payout: '30.00', multiplier: 3 }, outcome: {} });
drain();
check('instant: spin sound at the press, reels land at 1.5 s, the win at 2.7 s', calls, ['0 wolfmoon.start', '1500 wolfmoon.land', '2700 wolfmoon.win']);
fresh('wolfmoon');
hook.sfxRequest('POST', '/wolf-moon/spin');
advance(3500);
post('/wolf-moon/spin', { spin: { stake: '10', payout: '0', multiplier: 0 }, outcome: {} });
drain();
check('instant: a slow reply is not held back further, a loss sounds like one', calls, ['0 wolfmoon.start', '3500 wolfmoon.lose']);
fresh('wolfmoon');
hook.sfxRequest('POST', '/wolf-moon/spin');
advance(200);
post('/wolf-moon/spin', { spin: { stake: '10', payout: '120.00', multiplier: 12 }, outcome: {} });
drain();
check('instant: 12x is a big win', calls.filter((c) => /win/.test(c)), ['2700 wolfmoon.bigwin']);
fresh('wolfmoon');
hook.sfxRequest('POST', '/wolf-moon/spin');
advance(200);
post('/wolf-moon/spin', { spin: { stake: '10', payout: '5.00', multiplier: 0.5 }, outcome: {} });
drain();
check('instant: a return below the stake is neither win nor loss', calls.filter((c) => /win|lose/.test(c)), []);
fresh('luckywheel');
hook.sfxRequest('POST', '/lucky-wheel/spin');
advance(300);
hook.sfxError('POST', '/lucky-wheel/spin');
drain();
check('instant: a failed request cuts the spin sound short and plays nothing more', calls, ['0 luckywheel.start', '300 luckywheel.stop(start)']);
fresh('luckywheel');
hook.sfxRequest('POST', '/lucky-wheel/spin');
advance(500);
post('/lucky-wheel/spin', { stake: '10', payout: '20', multiplier: '2.00' });
drain();
check('instant: the wheel (4.2 s) lands at 2.2 s, result at 4.3 s', calls, ['0 luckywheel.start', '2200 luckywheel.land', '4300 luckywheel.win']);

// ------------------------------------------------------------ table game
fresh('roulette');
post('/roulette/bet', { periodNumber: 'r9', bets: [{ id: 'x1', area: 'RED', amount: '10', status: 'PENDING' }] });
get('/roulette/current', { periodNumber: 'r9', phase: 'BETTING', serverTime: iso(0), betEndTime: iso(8000), resultTime: iso(12000), endTime: iso(15000) });
drain();
check('table: bet, countdown of the last 5 s, draw, landing', calls, [
  '0 roulette.start', '3000 roulette.tick', '4000 roulette.tick', '5000 roulette.tick', '6000 roulette.tick', '7000 roulette.tick', '8000 roulette.reveal', '12000 roulette.land',
]);
get('/roulette/my-round', { periodNumber: 'r9', bets: [{ id: 'x1', area: 'RED', amount: '10', status: 'WON', payout: '20' }] });
check('table: the settled win', calls.slice(-1), [`${now - base} roulette.win`]);
fresh('roulette');
get('/roulette/current', { periodNumber: 'r9', phase: 'BETTING', serverTime: iso(0), betEndTime: iso(8000), resultTime: iso(12000), endTime: iso(15000) });
drain();
check('table: nothing is heard without a bet', calls, []);
fresh('baccarat');
get('/baccarat/my-round', { periodNumber: 'b1', bets: [{ id: 'y1', area: 'BANKER', amount: '50', status: 'PENDING' }] });
get('/baccarat/my-round', { periodNumber: 'b1', bets: [{ id: 'y1', area: 'BANKER', amount: '50', status: 'LOST', payout: '0' }] });
get('/baccarat/my-round', { periodNumber: 'b1', bets: [{ id: 'y1', area: 'BANKER', amount: '50', status: 'LOST', payout: '0' }] });
check('table: a bet placed earlier is followed, and its loss is heard once', calls, ['0 baccarat.lose']);
fresh('sevenupdown');
post('/seven-up-down/bet', { periodNumber: 's1', bets: [{ id: 'z1', area: 'UP', amount: '10', status: 'PENDING' }, { id: 'z2', area: 'N7', amount: '10', status: 'PENDING' }] });
get('/seven-up-down/my-round', { periodNumber: 's1', bets: [{ id: 'z1', amount: '10', status: 'WON', payout: '20' }, { id: 'z2', amount: '10', status: 'LOST', payout: '0' }] });
check('table: several bets in one reply give one sound (a win if any won)', calls, ['0 sevenupdown.start', '0 sevenupdown.win']);
fresh('sevenupdown');
post('/seven-up-down/bet', { periodNumber: 's1', bets: [{ id: 'z1', area: 'N7', amount: '10', status: 'PENDING' }] });
post('/seven-up-down/cancel', { cancelled: ['z1'], refund: 10 });
get('/seven-up-down/my-round', { periodNumber: 's1', bets: [{ id: 'z1', amount: '10', status: 'VOID', payout: '10' }] });
check('table: a cancelled bet is silent', calls, ['0 sevenupdown.start']);

// ------------------------------------------------------------ lotteries
fresh('wingo');
post('/wingo/60/bet', { periodNumber: 'w1', bets: [{ id: 'w-a', area: 'GREEN', amount: '10', status: 'PENDING' }] });
get('/wingo/60/current', { periodNumber: 'w1', serverTime: iso(0), endTime: iso(9000), locked: false });
advance(1000);
get('/wingo/60/current', { periodNumber: 'w1', serverTime: iso(0), endTime: iso(8000), locked: false });
drain();
check('lottery: bet, last-5-seconds beats once each, draw', calls, [
  '0 wingo.start', '4000 wingo.tick', '5000 wingo.tick', '6000 wingo.tick', '7000 wingo.tick', '8000 wingo.tick', '9000 wingo.reveal',
]);
get('/wingo/my-bets?limit=50', [{ id: 'w-a', area: 'GREEN', amount: '10', status: 'WON', payout: '20', periodNumber: 'w1' }, { id: 'old', status: 'LOST', amount: '5', payout: '0' }]);
check('lottery: the settled bet wins (an old one in the list stays silent)', calls.slice(-1), [`${now - base} wingo.win`]);
fresh('k3');
post('/k3/60/bet', { periodNumber: 'k1', bets: [{ id: 'k-a', area: 'SMALL', amount: '10', status: 'PENDING' }] });
get('/k3/my-bets?limit=50', [{ id: 'k-a', amount: '10', status: 'WON', payout: '300', periodNumber: 'k1' }]);
check('lottery: 30x is a big win', calls, ['0 k3.start', '0 k3.bigwin']);

// ------------------------------------------------------------ screens that play their own cues
fresh('dice');
post('/dice/roll', { id: 'd1', stake: '10', payout: '25', multiplier: '2.5' });
check('screen games: silent here, but the result is noted for the big-win choice', [...calls, `mult=${results.dice}`], ['mult=2.5']);
fresh('slot');
post('/slot/spin', { spin: { stake: '10', payout: '300' }, outcome: {} });
check('screen games: a result inside spin{} is noted too', [`mult=${results.slot}`], ['mult=30']);

// ------------------------------------------------------------ every game in games.ts has a pack that fits its kind
const gamesSource = fs.readFileSync(path.join(SRC, 'games.ts'), 'utf8');
const defs = [...gamesSource.matchAll(/^ {2}(crash|steps|instant|table|lottery|screen)\('(\w+)'/gm)].map((m) => ({ kind: m[1], key: m[2] }));
const need: Record<string, string[]> = {
  crash: ['start', 'cashout', 'special', 'lose'],
  steps: ['start', 'step', 'cashout', 'special', 'win', 'bigwin'],
  instant: ['start', 'win', 'bigwin', 'lose'],
  table: ['start', 'reveal', 'win', 'bigwin', 'lose'],
  lottery: ['start', 'reveal', 'win', 'bigwin', 'lose'],
  screen: ['win', 'bigwin'],
};
// Sounds a game is silent on by choice (the owner asked for them to go): the check does not ask for them.
const SILENT_BY_CHOICE: Record<string, string[]> = {
  aviator: ['launch', 'lose'],
  chickenroad: ['start', 'step', 'cashout', 'special', 'win', 'bigwin'], // music only
};
const missing: string[] = [];
const musicSource = fs.readFileSync(path.join(SRC, 'music.ts'), 'utf8');
const hasMusic = new Set([...musicSource.matchAll(/^ {2}(\w+): \{ src:/gm)].map((m) => m[1]));
for (const d of defs) for (const ev of need[d.kind]) if (!(packEvents[d.key] ?? []).includes(ev) && !(SILENT_BY_CHOICE[d.key] ?? []).includes(ev)) missing.push(`${d.key}.${ev}`);
// A crash game has some flight ambience: its own loop or a background music track.
for (const d of defs) if (d.kind === 'crash' && !(packEvents[d.key] ?? []).includes('loop') && !hasMusic.has(d.key)) missing.push(`${d.key}.loop|music`);
check('music: every track belongs to a game', [...hasMusic].filter((k) => !defs.some((d) => d.key === k)), []);
check(`packs: all ${defs.length} games have the sounds their kind needs`, missing, []);
const packKeys = Object.keys(packEvents).sort();
check('packs: every pack belongs to a game and every game has a pack', packKeys.filter((k) => !defs.some((d) => d.key === k)).concat(defs.filter((d) => !packKeys.includes(d.key)).map((d) => d.key)), []);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
