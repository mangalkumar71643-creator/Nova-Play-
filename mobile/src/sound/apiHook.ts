import { BIG_WIN_MULTIPLIER, fadeFor, hasFor, loopFor, noteResult, onActiveGameChange, playFor, stopFor } from './engine';
import { GameDef, gameForPath } from './games';
import type { SoundEvent } from './types';

/*
 * Plays the game sounds from the API traffic, so a game does not need a line of sound code in its screen:
 * a bet or a spin is heard when it is sent or answered, steps and cash-outs when the reply comes, a crash
 * game's take-off / flight / crash from its round polls, and a round's win or loss when the bets that were
 * waiting come back settled. Games whose screens play their own cues only have their results noted here
 * (so a screen's "win" can turn into the big-win sound).
 *
 * Everything is wrapped so that a sound can never break a request.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

interface Bet {
  stake: number;
  period?: string;
}

interface GameState {
  bets: Map<string, Bet>;
  phase: string | null;
  period: string | null;
  steps: number;
  pressedAt: number;
  sawReveal: boolean;
  timers: Set<ReturnType<typeof setTimeout>>;
  scheduled: Set<string>;
  watch: ReturnType<typeof setTimeout> | null;
  looping: boolean;
}

const states = new Map<string, GameState>();

function stateOf(game: string): GameState {
  let s = states.get(game);
  if (!s) {
    s = { bets: new Map(), phase: null, period: null, steps: 0, pressedAt: 0, sawReveal: false, timers: new Set(), scheduled: new Set(), watch: null, looping: false };
    states.set(game, s);
  }
  return s;
}

function dropTimers(s: GameState) {
  s.timers.forEach(clearTimeout);
  s.timers.clear();
  if (s.watch) clearTimeout(s.watch);
  s.watch = null;
}

// Leaving a game (or opening another) wipes what was being followed. What the game being opened has already
// learned (its first replies can arrive just before the screen is reported as the active one) is kept.
onActiveGameChange((key) => {
  for (const [game, s] of [...states]) {
    if (game === key) continue;
    dropTimers(s);
    states.delete(game);
  }
  // A crash game opened mid-flight: its first poll came before the screen was reported, so the loop starts now.
  if (key && states.get(key)?.looping) loopFor(key, true);
});

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

const inner = (body: Json): Json => (body && typeof body === 'object' ? body.round ?? body.spin ?? body.hand ?? body : null);

function betsOf(body: Json): Json[] {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.bets)) return body.bets;
  if (body && typeof body === 'object' && body.id && body.status) return [body];
  return [];
}

function parse(raw: unknown): Json {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** What follows the game's prefix: '/aviator/bet' → '/bet', '/wingo/60/bet' → '/bet'. */
function restOf(def: GameDef, path: string): string {
  let rest = path.split('?')[0].slice(def.path.length);
  if (def.kind === 'lottery') rest = rest.replace(/^\/\d+(?=\/)/, '');
  return rest;
}

function later(game: string, s: GameState, ms: number, fn: () => void) {
  const id = setTimeout(() => {
    s.timers.delete(id);
    if (states.get(game) === s) fn();
  }, Math.max(0, ms));
  s.timers.add(id);
}

function bigOr(mult: number, normal: SoundEvent): SoundEvent {
  return mult >= BIG_WIN_MULTIPLIER ? 'bigwin' : normal;
}

// ---------------------------------------------------------------- crash games
function onCrash(def: GameDef, method: string, rest: string, reqBody: unknown, body: Json) {
  const g = def.key;
  const s = stateOf(g);
  if (method === 'POST' && rest === '/bet') {
    if (body?.id && (!body.status || body.status === 'PENDING')) s.bets.set(String(body.id), { stake: num(body.amount) });
    playFor(g, 'start');
  } else if (method === 'POST' && rest === '/cashout') {
    const half = !!body?.half;
    const id = parse(reqBody)?.betId;
    if (!half && id) s.bets.delete(String(id));
    const mult = num(body?.multiplier);
    noteResult(g, mult);
    playFor(g, half ? 'cashout' : bigOr(mult, 'cashout'));
  } else if (method === 'GET' && rest === '/current') {
    onCrashPhase(def, s, body);
  } else if (method === 'GET' && (rest === '/my-bets' || rest === '/my-current-bet')) {
    settle(def, s, body, 'cashout');
  }
}

function onCrashPhase(def: GameDef, s: GameState, view: Json) {
  const g = def.key;
  const phase = view?.phase;
  if (typeof phase !== 'string') return;
  const prev = s.phase;
  s.phase = phase;
  if (phase === 'FLYING') {
    if (prev !== 'FLYING') {
      if (prev === 'BETTING') playFor(g, 'launch');
      s.looping = true;
      loopFor(g, true);
    }
    // The loop stops by itself if the round stops being polled (screen paused, network gone).
    if (s.watch) clearTimeout(s.watch);
    s.watch = setTimeout(() => {
      s.watch = null;
      s.looping = false;
      loopFor(g, false);
    }, 3500);
    return;
  }
  if (s.watch) clearTimeout(s.watch);
  s.watch = null;
  if (s.looping) {
    s.looping = false;
    loopFor(g, false);
  }
  if (phase === 'CRASHED' && (prev === 'FLYING' || prev === 'BETTING')) {
    // The take-off sound belongs to the flight: it ends when the plane does.
    if (hasFor(g, 'launch')) fadeFor(g, 'launch', 200);
    playFor(g, 'special');
    // The loss is heard when the bet comes back settled; this covers a reply that never comes.
    if (s.bets.size > 0) {
      later(g, s, 1600, () => {
        if (s.bets.size > 0) {
          s.bets.clear();
          playFor(g, 'lose');
        }
      });
    }
  }
}

// ---------------------------------------------------------------- step games
function onSteps(def: GameDef, method: string, rest: string, body: Json) {
  const g = def.key;
  const cfg = def.steps;
  if (method !== 'POST' || !cfg) return;
  const s = stateOf(g);
  if (rest === cfg.start) {
    s.steps = 0;
    playFor(g, 'start');
  } else if (rest === cfg.step) {
    const round = body?.round ?? body;
    const status = round?.status;
    if (status === 'LOST') {
      playFor(g, 'special');
      if (hasFor(g, 'lose')) later(g, s, 700, () => playFor(g, 'lose'));
    } else if (status === 'WON') {
      const mult = num(round?.multiplier);
      noteResult(g, mult);
      playFor(g, bigOr(mult, 'cashout'));
    } else {
      s.steps += 1;
      // Each safe step is a little higher than the one before.
      playFor(g, 'step', { rate: Math.min(1.6, 1 + 0.04 * s.steps) });
    }
  } else if (rest === cfg.cashout) {
    const mult = num(body?.multiplier);
    noteResult(g, mult);
    playFor(g, bigOr(mult, 'cashout'));
  }
}

// ---------------------------------------------------------------- instant games (one request plays the round)
function isPlay(def: GameDef, method: string, path: string): boolean {
  return method === 'POST' && def.kind === 'instant' && restOf(def, path) === def.play;
}

export function sfxRequest(method: string, path: string): void {
  try {
    const def = gameForPath(path);
    if (!def || !isPlay(def, method, path)) return;
    const s = stateOf(def.key);
    dropTimers(s);
    s.pressedAt = Date.now();
    playFor(def.key, 'start');
  } catch {
    // ignore
  }
}

export function sfxError(method: string, path: string): void {
  try {
    const def = gameForPath(path);
    if (!def || !isPlay(def, method, path)) return;
    dropTimers(stateOf(def.key));
    stopFor(def.key, 'start');
  } catch {
    // ignore
  }
}

function onInstant(def: GameDef, method: string, rest: string, body: Json) {
  if (method !== 'POST' || rest !== def.play) return;
  const g = def.key;
  const s = stateOf(g);
  const r = inner(body);
  const stake = num(r?.stake ?? r?.amount);
  const payout = num(r?.payout);
  let mult = num(r?.multiplier);
  if (!mult && stake > 0) mult = payout / stake;
  noteResult(g, mult);
  const elapsed = Date.now() - s.pressedAt;
  if (def.landAt !== undefined && hasFor(g, 'land') && def.landAt - elapsed > -200) {
    later(g, s, def.landAt - elapsed, () => playFor(g, 'land'));
  }
  const result: SoundEvent | null = mult > 1 ? bigOr(mult, 'win') : payout <= 0 ? 'lose' : null;
  if (result) later(g, s, (def.resultAt ?? 2700) - elapsed, () => playFor(g, result));
}

// ---------------------------------------------------------------- timed rounds (tables and lotteries)
function onRounds(def: GameDef, method: string, rest: string, body: Json) {
  const g = def.key;
  const s = stateOf(g);
  if (method === 'POST' && rest === '/bet') {
    const period = typeof body?.periodNumber === 'string' ? body.periodNumber : undefined;
    for (const b of betsOf(body)) if (b?.id && (!b.status || b.status === 'PENDING')) s.bets.set(String(b.id), { stake: num(b.amount), period });
    playFor(g, 'start');
  } else if (method === 'POST' && rest === '/cancel') {
    for (const id of Array.isArray(body?.cancelled) ? body.cancelled : []) s.bets.delete(String(id));
  } else if (method === 'GET' && rest === '/current') {
    scheduleRound(def, s, body);
  } else if (method === 'GET' && (rest === '/my-round' || rest === '/my-bets')) {
    settle(def, s, body, 'win');
  }
}

function schedule(def: GameDef, s: GameState, key: string, atLocalMs: number, fn: () => void) {
  const delay = atLocalMs - Date.now();
  if (!Number.isFinite(delay) || delay < -250 || delay > 30_000 || s.scheduled.has(key)) return;
  if (s.scheduled.size > 300) s.scheduled.clear();
  s.scheduled.add(key);
  later(def.key, s, delay, fn);
}

/** Countdown beats, the draw and the landing are timed from the server's clock, not from when the polls happen to arrive. */
function scheduleRound(def: GameDef, s: GameState, view: Json) {
  const g = def.key;
  const period = typeof view?.periodNumber === 'string' ? view.periodNumber : '';
  if (!period) return;
  if (s.period !== period) {
    s.period = period;
    s.sawReveal = false;
  }
  const server = Date.parse(view.serverTime);
  const offset = Number.isFinite(server) ? server - Date.now() : 0;
  const local = (iso: unknown) => Date.parse(String(iso)) - offset;
  const hasBets = () => [...s.bets.values()].some((b) => !b.period || b.period === period);
  const end = def.kind === 'table' ? local(view.betEndTime) : local(view.endTime);
  for (let k = 5; k >= 1; k--) {
    schedule(def, s, `${period}:t${k}`, end - k * 1000, () => {
      if (hasBets()) playFor(g, 'tick');
    });
  }
  schedule(def, s, `${period}:reveal`, end, () => {
    if (!hasBets()) return;
    s.sawReveal = true;
    playFor(g, 'reveal');
  });
  if (def.kind === 'table') {
    schedule(def, s, `${period}:land`, local(view.resultTime), () => {
      if (s.sawReveal || hasBets()) playFor(g, 'land');
    });
  }
}

/** Bets that were waiting and now come back won or lost make the win / lose sound (once). */
function settle(def: GameDef, s: GameState, body: Json, winEvent: SoundEvent) {
  const g = def.key;
  const rows = betsOf(body);
  if (rows.length === 0) return;
  const period = typeof body?.periodNumber === 'string' ? body.periodNumber : undefined;
  let any = false;
  let won = false;
  let staked = 0;
  let paid = 0;
  for (const b of rows) {
    const id = String(b?.id ?? '');
    if (!id) continue;
    const status = b.status;
    const known = s.bets.get(id);
    if (!known) {
      // A bet placed before this screen was opened: follow it from now on.
      if (status === 'PENDING') s.bets.set(id, { stake: num(b.amount), period: typeof b.periodNumber === 'string' ? b.periodNumber : period });
      continue;
    }
    if (!status || status === 'PENDING') continue;
    s.bets.delete(id);
    if (status === 'VOID') continue;
    any = true;
    staked += known.stake || num(b.amount);
    if (status === 'WON') {
      won = true;
      paid += num(b.payout);
    }
  }
  if (!any) return;
  const mult = staked > 0 ? paid / staked : 0;
  noteResult(g, mult);
  playFor(g, won ? bigOr(mult, winEvent) : 'lose');
}

// ---------------------------------------------------------------- entry point
export function sfxResponse(method: string, path: string, reqBody: unknown, body: unknown): void {
  try {
    const def = gameForPath(path);
    if (!def) return;
    const rest = restOf(def, path);
    switch (def.kind) {
      case 'crash':
        onCrash(def, method, rest, reqBody, body);
        break;
      case 'steps':
        onSteps(def, method, rest, body);
        break;
      case 'instant':
        onInstant(def, method, rest, body);
        break;
      case 'table':
      case 'lottery':
        onRounds(def, method, rest, body);
        break;
      default: {
        // Screens that play their own cues: just remember how big the latest result was.
        if (method !== 'POST') break;
        const r = inner(body);
        const stake = num(r?.stake ?? r?.amount);
        let mult = num(r?.multiplier);
        if (!mult && stake > 0) mult = num(r?.payout) / stake;
        noteResult(def.key, mult);
      }
    }
  } catch {
    // A sound must never break a request.
  }
}
