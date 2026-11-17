import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { GAMES_BY_KEY, GameCue, gameForRoute } from './games';
import { PACKS } from './packs';
import type { SoundEvent } from './types';

export type { GameCue } from './games';

/*
 * Game sound engine.
 *
 * - One global on/off switch (Settings → Sound Effects, and in every game's info card), saved on the phone.
 * - Each game has its own pack (see packs.ts). The game on screen keeps its pack loaded; leaving it frees the players.
 * - Games whose screens already know when to play a cue (tick / land / win) use createGamePlayers();
 *   every other game is driven from the API traffic by apiHook.ts through the "active game" below.
 * - Nothing here can throw into a game: a missed sound effect is harmless.
 */

const STORE_KEY = 'novaplay:sound:v1';
/** A win this many times the stake gets the big-win sound. */
export const BIG_WIN_MULTIPLIER = 10;

// ---------------------------------------------------------------- on / off
let enabled = true;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());

const loadedFromStore = AsyncStorage.getItem(STORE_KEY)
  .then((v) => {
    if (v === 'off' && enabled) {
      enabled = false;
      notify();
    }
  })
  .catch(() => {});

export function isSoundEnabled(): boolean {
  return enabled;
}

/** Resolves with the saved setting (once it has been read). */
export function loadSoundEnabled(): Promise<boolean> {
  return loadedFromStore.then(() => enabled);
}

export function setSoundEnabled(on: boolean): void {
  if (enabled === on) return;
  enabled = on;
  AsyncStorage.setItem(STORE_KEY, on ? 'on' : 'off').catch(() => {});
  if (!on) active?.stopAll();
  notify();
}

/** React hook: the current setting, re-rendering when it changes. */
export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    () => enabled,
    () => true
  );
}

// ---------------------------------------------------------------- players
let modeSet = false;
function ensureAudioMode() {
  if (modeSet) return;
  modeSet = true;
  try {
    // Effects follow the phone's silent switch and never stop the user's music.
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  } catch {
    // ignore
  }
}

/** Events that can fire again before the last one has finished get two players to alternate between. */
const DOUBLE: SoundEvent[] = ['tick', 'step', 'start', 'land'];

export interface PlayOptions {
  volume?: number;
  /** 1 = as recorded; higher is quicker and higher-pitched. */
  rate?: number;
}

function quiet(p: unknown) {
  if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
}

export class SoundSet {
  private players = new Map<SoundEvent, AudioPlayer[]>();
  private turn = new Map<SoundEvent, number>();
  private rated = new Set<AudioPlayer>();
  private dead = false;

  constructor(readonly game: string) {
    ensureAudioMode();
    const pack = PACKS[game];
    if (!pack) return;
    for (const ev of Object.keys(pack) as SoundEvent[]) {
      const src = pack[ev];
      if (src == null) continue;
      try {
        const copies = DOUBLE.includes(ev) ? 2 : 1;
        const list: AudioPlayer[] = [];
        for (let i = 0; i < copies; i++) {
          const p = createAudioPlayer(src, { updateInterval: 2000 });
          try {
            p.shouldCorrectPitch = false; // a higher rate should sound higher
          } catch {
            // ignore
          }
          list.push(p);
        }
        this.players.set(ev, list);
      } catch {
        // This sound stays silent.
      }
    }
  }

  has(ev: SoundEvent): boolean {
    return this.players.has(ev);
  }

  play(ev: SoundEvent, opts?: PlayOptions): void {
    if (this.dead || !enabled) return;
    const list = this.players.get(ev);
    if (!list) return;
    const i = this.turn.get(ev) ?? 0;
    this.turn.set(ev, (i + 1) % list.length);
    const p = list[i];
    try {
      p.volume = opts?.volume ?? 1;
    } catch {
      // ignore
    }
    if (opts?.rate !== undefined || this.rated.has(p)) {
      try {
        p.playbackRate = opts?.rate ?? 1;
        if (opts?.rate !== undefined && opts.rate !== 1) this.rated.add(p);
        else this.rated.delete(p);
      } catch {
        // ignore
      }
    }
    try {
      quiet(p.seekTo(0));
      p.play();
    } catch {
      // A missed sound effect is harmless.
    }
  }

  stop(ev: SoundEvent): void {
    for (const p of this.players.get(ev) ?? []) {
      try {
        p.pause();
        quiet(p.seekTo(0));
      } catch {
        // ignore
      }
    }
  }

  startLoop(volume = 0.55): void {
    if (this.dead || !enabled) return;
    const p = this.players.get('loop')?.[0];
    if (!p) return;
    try {
      if (p.playing) return;
      p.loop = true;
      p.volume = volume;
      quiet(p.seekTo(0));
      p.play();
    } catch {
      // ignore
    }
  }

  stopLoop(): void {
    this.stop('loop');
  }

  stopAll(): void {
    for (const ev of this.players.keys()) this.stop(ev);
  }

  release(): void {
    if (this.dead) return;
    this.dead = true;
    for (const list of this.players.values()) {
      for (const p of list) {
        try {
          p.pause();
          p.remove();
        } catch {
          // ignore
        }
      }
    }
    this.players.clear();
  }
}

// ---------------------------------------------------------------- the game on screen
let active: SoundSet | null = null;
let activeKey: string | null = null;
const activeListeners = new Set<(key: string | null) => void>();

/** The game now on screen (null for any other screen). Its pack is loaded; the previous one is freed. */
export function setActiveGame(key: string | null): void {
  if (key === activeKey) return;
  active?.release();
  active = null;
  activeKey = key;
  const def = key ? GAMES_BY_KEY[key] : null;
  // Games whose screens play their own cues load their own players (createGamePlayers).
  if (def && def.kind !== 'screen' && PACKS[def.key]) active = new SoundSet(def.key);
  activeListeners.forEach((fn) => fn(key));
}

export function setActiveRoute(route: string | undefined | null): void {
  setActiveGame(gameForRoute(route)?.key ?? null);
}

// A crash game's flight must not keep humming in the background.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') active?.stopAll();
});

export function onActiveGameChange(fn: (key: string | null) => void): void {
  activeListeners.add(fn);
}

export function getActiveGame(): string | null {
  return activeKey;
}

/** Plays a sound of `game` if that game is the one on screen. */
export function playFor(game: string, ev: SoundEvent, opts?: PlayOptions): void {
  if (active && activeKey === game) active.play(ev, opts);
}

export function stopFor(game: string, ev: SoundEvent): void {
  if (active && activeKey === game) active.stop(ev);
}

export function hasFor(game: string, ev: SoundEvent): boolean {
  return !!active && activeKey === game && active.has(ev);
}

export function loopFor(game: string, on: boolean): void {
  if (!active || activeKey !== game) return;
  if (on) active.startLoop();
  else active.stopLoop();
}

// ---------------------------------------------------------------- results (so a screen's "win" can become a "big win")
interface LastResult {
  mult: number;
  at: number;
}
const lastResult = new Map<string, LastResult>();
const lastBig = new Map<string, number>();

export function noteResult(game: string, mult: number): void {
  if (Number.isFinite(mult) && mult > 0) lastResult.set(game, { mult, at: Date.now() });
}

/** 'bigwin' when the game's latest result was a big one (and a big-win sound has not just played), else 'win'. */
export function winEventFor(game: string): SoundEvent {
  const r = lastResult.get(game);
  const now = Date.now();
  if (r && r.mult >= BIG_WIN_MULTIPLIER && now - r.at < 30_000 && now - (lastBig.get(game) ?? 0) > 4000) {
    lastBig.set(game, now);
    return 'bigwin';
  }
  return 'win';
}

// ---------------------------------------------------------------- screens that play their own cues
export interface CueHandle {
  seekTo: (seconds: number) => void;
  play: () => void;
  remove: () => void;
}
export type GamePlayers = Record<GameCue, CueHandle>;

const FALLBACKS: Record<GameCue, SoundEvent[]> = {
  tick: ['tick', 'step', 'start'],
  land: ['land', 'lose', 'tick'],
  win: ['win'],
  big: ['bigwin', 'win'],
  lose: ['lose', 'land'],
};

/**
 * Drop-in for the old per-screen players: `players.tick.seekTo(0); players.tick.play()` plays the game's own sound.
 * 'big' picks the big-win sound after a big result. Call remove() on any handle (or all) when the screen goes away.
 */
export function createGamePlayers(game: string): GamePlayers {
  const set = new SoundSet(game);
  const cues = GAMES_BY_KEY[game]?.cues ?? {};
  const resolve = (cue: GameCue): SoundEvent | null => {
    if (cue === 'big') {
      const ev = winEventFor(game);
      return set.has(ev) ? ev : set.has('win') ? 'win' : null;
    }
    const wanted = cues[cue];
    const order = wanted ? [wanted, ...FALLBACKS[cue]] : FALLBACKS[cue];
    return order.find((ev) => set.has(ev)) ?? null;
  };
  const handle = (cue: GameCue): CueHandle => ({
    seekTo: () => {},
    play: () => {
      const ev = resolve(cue);
      if (ev) set.play(ev);
    },
    remove: () => set.release(),
  });
  return { tick: handle('tick'), land: handle('land'), win: handle('win'), big: handle('big'), lose: handle('lose') };
}
