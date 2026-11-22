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
  playFor: (g: string, ev: string, opts?: { rate?: number; from?: number }) =>
    calls.push(`${stamp()} ${g}.${ev}${opts?.rate ? `@${opts.rate.toFixed(2)}` : ''}${opts?.from ? `+${opts.from.toFixed(1)}s` : ''}`),
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
// (The bet itself makes no sound here: a table game's chip sound is played by the screen at the tap, see ui.ts.)
check('table: no sound from the bet reply, then the countdown of the last 5 s, draw, landing', calls, [
  '3000 roulette.tick', '4000 roulette.tick', '5000 roulette.tick', '6000 roulette.tick', '7000 roulette.tick', '8000 roulette.reveal', '12000 roulette.land',
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
check('table: several bets in one reply give one sound (a win if any won)', calls, ['0 sevenupdown.win']);
fresh('sevenupdown');
post('/seven-up-down/bet', { periodNumber: 's1', bets: [{ id: 'z1', area: 'N7', amount: '10', status: 'PENDING' }] });
post('/seven-up-down/cancel', { cancelled: ['z1'], refund: 10 });
get('/seven-up-down/my-round', { periodNumber: 's1', bets: [{ id: 'z1', amount: '10', status: 'VOID', payout: '10' }] });
check('table: a cancelled bet is silent', calls, []);
// Seven Up Down's dice roll is something everyone watching sees, so everyone hears it, bet or not (the countdown beats stay for the players who have bets).
fresh('sevenupdown');
get('/seven-up-down/current', { periodNumber: 's7', phase: 'BETTING', serverTime: iso(0), betEndTime: iso(8000), resultTime: iso(10000), endTime: iso(15000) });
drain();
check("table: Seven Up Down's dice roll and landing are heard by everyone watching, with no bet", calls, ['8000 sevenupdown.reveal', '10000 sevenupdown.land']);

// ------------------------------------------------------------ lotteries
fresh('wingo');
post('/wingo/60/bet', { periodNumber: 'w1', bets: [{ id: 'w-a', area: 'GREEN', amount: '10', status: 'PENDING' }] });
get('/wingo/60/current', { periodNumber: 'w1', serverTime: iso(0), endTime: iso(9000), locked: false });
advance(1000);
get('/wingo/60/current', { periodNumber: 'w1', serverTime: iso(0), endTime: iso(8000), locked: false });
drain();
check('lottery: Win Go plays its one countdown sound 5.1 s before the end (not beats), then the draw', calls, [
  '0 wingo.start', '3900 wingo.countdown', '9000 wingo.reveal',
]);
get('/wingo/my-bets?limit=50', [{ id: 'w-a', area: 'GREEN', amount: '10', status: 'WON', payout: '20', periodNumber: 'w1' }, { id: 'old', status: 'LOST', amount: '5', payout: '0' }]);
check('lottery: the settled bet wins (an old one in the list stays silent)', calls.slice(-1), [`${now - base} wingo.win`]);
fresh('wingo');
get('/wingo/60/current', { periodNumber: 'w5', serverTime: iso(0), endTime: iso(30000), locked: false });
advance(31000);
check('lottery: the countdown plays for everyone watching, with or without a bet', calls, ['24900 wingo.countdown']);
fresh('wingo');
get('/wingo/60/current', { periodNumber: 'w6', serverTime: iso(0), endTime: iso(3000), locked: false });
advance(10);
check('lottery: joining with 3 s left starts the countdown from where it is (2.1 s in)', calls, ['0 wingo.countdown+2.1s']);
fresh('wingo');
get('/wingo/60/current', { periodNumber: 'w7', serverTime: iso(0), endTime: iso(9000), locked: false });
advance(4500);
get('/wingo/30/current', { periodNumber: 'w8', serverTime: iso(0), endTime: iso(25500), locked: false });
advance(30000);
check('lottery: another tab while the countdown is going stops it, and the old round plays nothing more', calls, ['3900 wingo.countdown', '4500 wingo.fade(countdown)', '24900 wingo.countdown']);
fresh('k3');
post('/k3/60/bet', { periodNumber: 'k1', bets: [{ id: 'k-a', area: 'SMALL', amount: '10', status: 'PENDING' }] });
get('/k3/my-bets?limit=50', [{ id: 'k-a', amount: '10', status: 'WON', payout: '300', periodNumber: 'k1' }]);
check('lottery: 30x is a big win', calls, ['0 k3.start', '0 k3.bigwin']);

// K3, 5D and Trx Win play the very same countdown sound as Win Go: 5.1 s before the end, for everyone watching, then the draw.
for (const [key, api] of [['k3', '/k3/60'], ['fived', '/5d/60'], ['trxwin', '/trx/60']] as const) {
  fresh(key);
  post(`${api}/bet`, { periodNumber: `${key}-1`, bets: [{ id: `${key}-a`, area: 'SMALL', amount: '10', status: 'PENDING' }] });
  get(`${api}/current`, { periodNumber: `${key}-1`, serverTime: iso(0), endTime: iso(9000), locked: false });
  advance(10000);
  check(`lottery: ${key} plays Win Go's one countdown sound 5.1 s before the end (not beats), then the draw`, calls, [`0 ${key}.start`, `3900 ${key}.countdown`, `9000 ${key}.reveal`]);
  fresh(key);
  get(`${api}/current`, { periodNumber: `${key}-2`, serverTime: iso(0), endTime: iso(30000), locked: false });
  advance(31000);
  check(`lottery: ${key} plays the countdown for everyone watching, with or without a bet`, calls, [`24900 ${key}.countdown`]);
  fresh(key);
  get(`${api}/current`, { periodNumber: `${key}-3`, serverTime: iso(0), endTime: iso(3000), locked: false });
  advance(10);
  check(`lottery: ${key}, joining with 3 s left, starts the countdown from where it is (2.1 s in)`, calls, [`0 ${key}.countdown+2.1s`]);
}

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
  table: ['reveal', 'win', 'bigwin', 'lose'], // its bet is the chip sound (ui.ts), not a sound of the pack
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

// ------------------------------------------------------------ interface sounds: every popup cross plays the popup-closing sound
{
  const APP = path.resolve(SRC, '..');
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : []));
  const files = [...walk(path.join(APP, 'screens')), ...walk(path.join(APP, 'components')), ...walk(path.join(APP, 'navigation'))];
  // A cross that clears something (a bet, the picks, a value) instead of closing a popup makes no popup sound.
  const CLEARS = /clearPicks|clearAll|setBet\(0\)|onChangeCashOutValue/;
  const balanced = (str: string, open: number) => {
    let depth = 0;
    for (let k = open; k < str.length; k++) {
      if (str[k] === '{') depth++;
      else if (str[k] === '}' && --depth === 0) return k + 1;
    }
    return -1;
  };
  const bad: string[] = [];
  let wired = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/name=["']close["']/g)) {
      const idx = m.index ?? 0;
      const lineNo = src.slice(0, idx).split('\n').length;
      // the press handler: the icon's own, or else the button around it
      const iconStart = src.lastIndexOf('<MaterialCommunityIcons', idx);
      const own = src.slice(iconStart, src.indexOf('/>', idx) + 2);
      let tag = own;
      if (!/onPress=\{/.test(own)) {
        const j = Math.max(src.lastIndexOf('<Pressable', idx), src.lastIndexOf('<TapPressable', idx), src.lastIndexOf('<TouchableOpacity', idx));
        const between = src.slice(Math.max(j, 0), idx);
        if (j < 0 || between.includes('</Pressable>') || between.includes('</TapPressable>') || between.includes('</TouchableOpacity>')) continue; // a picture, not a button
        let depth = 0, k = j;
        for (; k < idx; k++) {
          const c = src[k];
          if (c === '{') depth++;
          else if (c === '}') depth--;
          else if (c === '>' && depth === 0 && src[k - 1] !== '=') break;
        }
        tag = src.slice(j, k + 1);
      }
      const at = tag.search(/onPress=\{/);
      if (at < 0) continue;
      const handler = tag.slice(at, balanced(tag, tag.indexOf('{', at)));
      if (/^onPress=\{withPopupSound\(/.test(handler)) wired++;
      else if (!CLEARS.test(handler)) bad.push(`${path.relative(APP, f)}:${lineNo}`);
    }
  }
  check(`ui: all ${wired} popup crosses in the app play the popup-closing sound (and the clear-type crosses do not)`, bad, []);
  const ui = fs.readFileSync(path.join(SRC, 'ui.ts'), 'utf8');
  const uiFiles = [...ui.matchAll(/require\('\.\.\/\.\.\/(assets\/sounds\/ui\/[\w.-]+)'\)/g)].map((m) => m[1]);
  check('ui: every interface sound file exists', uiFiles.filter((f) => !fs.existsSync(path.join(APP, '..', f))), []);

  // Every game that puts chips on a bet plays the chip sound at the moment the chips are taken (once for a tap, Rebet or Double),
  // right where the bet is accepted, so a bet that is refused (betting closed, not enough balance) makes no sound.
  const noChip: string[] = [];
  let chipGames = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    if (/type PlacedChip\b/.test(src)) {
      chipGames++;
      if (!/setChips\(\(prev\) => \[\.\.\.prev, \.\.\.added\]\);\s*playChipBet\(\);/.test(src)) noChip.push(path.relative(APP, f));
    }
  }
  const bj = fs.readFileSync(path.join(APP, 'screens', 'BlackjackScreen.tsx'), 'utf8');
  const addChip = bj.slice(bj.indexOf('const addChip = '), bj.indexOf('const toggleSound'));
  if (!/playChipBet\(\);\s*setBet\(next\);/.test(addChip) || /play\('tick'\)/.test(addChip)) noChip.push('screens/BlackjackScreen.tsx (addChip)');
  check(`ui: the ${chipGames} chip table games and Blackjack play the chip sound when a chip is put on a bet`, noChip, []);
  check('ui: the chip sound is a real game feature (more than the 7 table games found)', [chipGames >= 7], [true]);

  // The touch sound. The menus (every screen and component that is not a game) use TapPressable, which plays it; the interface
  // buttons of the game screens (Back, Deposit, Rules, History, the sound switch ...) play it through withTapSound, and the buttons
  // that are part of the play keep the game's own sounds.
  const gameScreens = new Set([...gamesSource.matchAll(/^ {2}(?:crash|steps|instant|table|lottery|screen)\('\w+', '(\w+)'/gm)].map((m) => `${m[1]}Screen.tsx`));
  const menuFiles = files.filter((f) => !gameScreens.has(path.basename(f)) && path.basename(f) !== 'TapPressable.tsx');
  const read = (f: string) => fs.readFileSync(f, 'utf8');
  const rel = (f: string) => path.relative(APP, f);
  check(
    `ui: the ${menuFiles.length} menu screens, components and tabs use TapPressable and not the plain Pressable`,
    menuFiles.filter((f) => /import\s*\{[^}]*\bPressable\b[^}]*\}\s*from\s*'react-native'/.test(read(f))).map(rel),
    []
  );
  // A card that only keeps a tap from reaching the popup's backdrop (onPress does nothing) makes no sound.
  const loudAbsorbers: string[] = [];
  for (const f of menuFiles) read(f).split('\n').forEach((line, i) => { if (/<TapPressable\b/.test(line) && /onPress=\{\(\) => \{\}\}/.test(line) && !/\bsilent\b/.test(line)) loudAbsorbers.push(`${rel(f)}:${i + 1}`); });
  check('ui: a popup card that only absorbs taps (onPress does nothing) is silent', loudAbsorbers, []);
  const loudSwitches: string[] = [];
  for (const f of menuFiles) for (const m of read(f).matchAll(/<Switch\b[\s\S]*?\/>/g)) if (!/onValueChange=\{withTapSound\(/.test(m[0])) loudSwitches.push(`${rel(f)}:${read(f).slice(0, m.index).split('\n').length}`);
  check('ui: every switch in the menus makes the touch sound (onValueChange={withTapSound(...)})', loudSwitches, []);
  // The interface buttons of the game screens, as they are written there.
  const NAV = `(?:\\(navigation as any\\)|rootNavigation|navigation)\\.navigate\\('(?:Deposit|Withdraw|Wallet|Settings|Profile|Notifications|Help|Home|History)'\\)`;
  const IFACE = new RegExp(`onPress=\\{(?:\\(\\) => (?:navigation\\.goBack\\(\\)|${NAV}|openPanel\\('(?:history|rules|pay|bets)'\\)|openPanel\\(id\\)|setPanel\\('(?:info|pay)'\\)|setShowRules\\(true\\)|setSheet\\('rules'\\)|setHistoryOpen\\(true\\)|setRulesOpen\\(true\\))|toggleSound)\\}`, 'g');
  const silentGameButtons: string[] = [];
  let wrappedButtons = 0;
  for (const f of files.filter((x) => gameScreens.has(path.basename(x)))) {
    const src = read(f);
    for (const m of src.matchAll(IFACE)) silentGameButtons.push(`${rel(f)}:${src.slice(0, m.index).split('\n').length}`);
    wrappedButtons += [...src.matchAll(/onPress=\{withTapSound\(/g)].length;
  }
  check(`ui: ${wrappedButtons} interface buttons of the game screens (Back, Deposit, Rules, History, sound ...) make the touch sound`, silentGameButtons, []);
  // The result-rule card opens by itself once for a player; the "?" button of the game's top bar opens it again whenever they want.
  check('ui: every game with the result-rule card has its "?" button', files.filter((f) => /<ResultRuleNotice\b/.test(read(f)) && !/<ResultRuleButton\b/.test(read(f))).map(rel), []);
  check("ui: Win Go's bet sheet has the Result rule button", [/accessibilityLabel="Result rule"/.test(read(path.join(APP, 'screens', 'WinGoScreen.tsx')))], [true]);
  // The voice calls of the table games: "Please bet now" when betting opens and "Bet locked" when it closes, spoken together with the
  // games' start / close-of-betting banners (the owner asked for them in Seven Up Down, then for every game that shows such a banner).
  {
    const uiSource = read(path.join(APP, 'sound/ui.ts'));
    const hookSource = read(path.join(APP, 'sound/useBetCalls.ts'));
    // game screen, the arguments of its start banner and of its close banner
    const BANNER_GAMES: [string, string, string][] = [
      ['SevenUpDownScreen', "'Start Betting', true", "'Bet Locked', false"],
      ['DragonTigerScreen', "'Start Betting', true", "'Stop Betting', false"],
      ['AndarBaharScreen', "'Start Betting', true", "'Stop Betting', false"],
      ['TeenPattiScreen', "'Start Betting', true", "'Stop Betting', false"],
      ['BaccaratScreen', "'PLACE YOUR BETS', true", "'NO MORE BETS', false"],
      ['RouletteScreen', "'PLACE YOUR BETS'", "'NO MORE BETS'"],
    ];
    const missing: string[] = [];
    for (const [name, start, stop] of BANNER_GAMES) {
      const src = read(path.join(APP, 'screens', `${name}.tsx`));
      if (!new RegExp(`showBanner\\(${start}\\);\\s*betCalls\\.open\\(`).test(src)) missing.push(`${name}: the start banner has no betCalls.open`);
      if (!new RegExp(`showBanner\\(${stop}\\);[\\s\\S]{0,260}?betCalls\\.close\\(`).test(src)) missing.push(`${name}: the close banner has no betCalls.close`);
      if (!/const betCalls = useBetCalls\(\)/.test(src)) missing.push(`${name}: no useBetCalls()`);
    }
    check(`ui: the ${BANNER_GAMES.length} table games with a start / close-of-betting banner speak "Please bet now" / "Bet locked" with it`, missing, []);
    const listed = new Set(BANNER_GAMES.map(([name]) => `${name}.tsx`));
    check(
      'ui: no other game shows a start / close-of-betting banner without the voice calls',
      files.filter((f) => !listed.has(path.basename(f)) && /showBanner\(\s*'(?:Start Betting|Stop Betting|Bet Locked|PLACE YOUR BETS|NO MORE BETS)'/.test(read(f))).map(rel),
      []
    );
    check(
      'ui: the voice calls have their files, are made once for a round, follow the sound switch and are silent while the app is not in front',
      [
        fs.existsSync(path.join(APP, '..', 'assets/sounds/ui/bet_now.mp3')),
        fs.existsSync(path.join(APP, '..', 'assets/sounds/ui/bet_stop.mp3')),
        /open\(period: string\)[\s\S]*last\.current\.open === period\) return;[\s\S]*playBetCall\('now'\)/.test(hookSource),
        /close\(period: string\)[\s\S]*last\.current\.close === period\) return;[\s\S]*playBetCall\('stop'\)/.test(hookSource),
        /export function playBetCall[\s\S]*AppState\.currentState !== 'active'[\s\S]*playUi\(/.test(uiSource),
        /export function playUi[\s\S]*isSoundEnabled\(\)/.test(uiSource),
      ],
      [true, true, true, true, true, true]
    );
  }
  check('ui: the touch sound has a file and a TapPressable', [fs.existsSync(path.join(APP, '..', 'assets/sounds/ui/tap.mp3')), fs.existsSync(path.join(APP, 'components/TapPressable.tsx'))], [true, true]);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
