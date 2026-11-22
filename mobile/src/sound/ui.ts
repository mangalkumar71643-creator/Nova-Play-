import { AudioPlayer, createAudioPlayer } from 'expo-audio';
import { AppState } from 'react-native';

import { ensureAudioMode, isSoundEnabled } from './engine';

/*
 * The app's own interface sounds (not a game's): one short sound per thing the player does in the interface.
 * They follow the same on/off switch as the games' sounds (Settings → Sound Effects, the speaker buttons, GAME INFO).
 * The files are made by scripts/sounds/build.py from what the owner supplied (scripts/sounds/supplied/ui/).
 */
const UI_SOURCES = {
  /** A popup (rules, history, a win card ...) is closed with its cross. */
  popupClose: require('../../assets/sounds/ui/popup_close.mp3'),
  /** A chip goes from the player's chips onto a bet (a tap on a betting area, Rebet, Double ...). */
  chipBet: require('../../assets/sounds/ui/chip_bet.mp3'),
  /** The touch sound: a button, tab, tile or row of the interface is tapped. */
  tap: require('../../assets/sounds/ui/tap.mp3'),
  /** The voice call "Bet now" (1.6 s) when a round of a table game opens for betting. */
  betNow: require('../../assets/sounds/ui/bet_now.mp3'),
  /** The voice call "Bet locked" (1.9 s) when betting closes (the file is still called bet_stop). */
  betStop: require('../../assets/sounds/ui/bet_stop.mp3'),
} as const;

export type UiSound = keyof typeof UI_SOURCES;

/**
 * How many players a sound gets, taken in turns, so quick taps do not cut each other off. A sound that is tapped many times in
 * a second (the chips, the touch sound) needs more than one that is not (a popup being closed).
 */
const VOICES: Record<UiSound, number> = { popupClose: 2, chipBet: 4, tap: 3, betNow: 1, betStop: 1 };

const players = new Map<UiSound, { list: AudioPlayer[]; turn: number } | null>();

/** A sound's players. The first is made on the first use (or at start-up, see preloadUiSounds); the others by growVoices. */
function playersOf(name: UiSound) {
  let entry = players.get(name);
  if (entry === undefined) {
    try {
      ensureAudioMode();
      entry = { list: [createAudioPlayer(UI_SOURCES[name])], turn: 0 };
    } catch {
      entry = null; // this sound stays silent
    }
    players.set(name, entry);
  }
  return entry;
}

let growing = false;

/**
 * Makes the rest of the players, one every quarter of a second, once the app is up: every player is a native audio player, and
 * making them all at once would hold up the start of the app. They only matter when taps come faster than a sound plays.
 */
function growVoices(): void {
  if (growing) return;
  growing = true;
  const step = () => {
    for (const name of Object.keys(UI_SOURCES) as UiSound[]) {
      const entry = playersOf(name);
      if (!entry || entry.list.length >= VOICES[name]) continue;
      try {
        entry.list.push(createAudioPlayer(UI_SOURCES[name]));
      } catch {
        // No more players for this sound.
        VOICES[name] = entry.list.length;
      }
      setTimeout(step, 250);
      return;
    }
  };
  setTimeout(step, 600);
}

/**
 * Makes the first player of every sound now (called when the app starts), so the very first tap is not the one that has to load
 * the file: a player that has just been made is not ready for a moment, and a sound as short as these could be missed.
 */
export function preloadUiSounds(): void {
  for (const name of Object.keys(UI_SOURCES) as UiSound[]) playersOf(name);
  growVoices();
}

/**
 * The voice call of a table game: "Bet now" when its betting opens (a new round has begun), "Bet locked" when it closes. The game
 * screens make it through useBetCalls (useBetCalls.ts), once for each round, with their start / close-of-betting banners. It follows
 * the sound switch like every other sound, and is heard only while the app is in front (a timer that fires with the phone locked
 * or the app in the background must not speak).
 */
export function playBetCall(call: 'now' | 'stop'): void {
  if (AppState.currentState !== 'active') return;
  playUi(call === 'now' ? 'betNow' : 'betStop');
}

/** Plays an interface sound (nothing if the sound effects are switched off). It can never throw into the screen. */
export function playUi(name: UiSound): void {
  if (!isSoundEnabled()) return;
  const entry = playersOf(name);
  if (!entry) return;
  growVoices();
  const p = entry.list[entry.turn % entry.list.length];
  entry.turn = (entry.turn + 1) % entry.list.length;
  try {
    p.volume = 1;
    const seek = p.seekTo(0) as unknown;
    if (seek && typeof (seek as Promise<void>).catch === 'function') (seek as Promise<void>).catch(() => {});
    p.play();
  } catch {
    // A missed sound effect is harmless.
  }
}

// A handler that makes its own interface sound is marked, so the touch sound is not played on top of it (a popup's cross
// makes the popup sound, not the touch sound).
const OWN_SOUND = '__playsUiSound';

function marked<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  (fn as unknown as Record<string, boolean>)[OWN_SOUND] = true;
  return fn;
}

/** Whether a press handler makes an interface sound of its own (see withPopupSound and withTapSound). */
export function hasOwnSound(fn: unknown): boolean {
  return typeof fn === 'function' && (fn as unknown as Record<string, unknown>)[OWN_SOUND] === true;
}

/**
 * For a popup's cross: `onPress={withPopupSound(() => setPanel(null))}` plays the popup-closing sound, then does what the
 * button did before.
 */
export function withPopupSound<A extends unknown[]>(fn?: (...args: A) => unknown): (...args: A) => void {
  return marked((...args: A) => {
    playUi('popupClose');
    fn?.(...args);
  });
}

/**
 * The touch sound for a control that is not a TapPressable (see components/TapPressable.tsx): a switch
 * (`onValueChange={withTapSound(onChange)}`), or a button of a game's screen that is not part of the play (Back, Deposit, the
 * Rules and History buttons). It does what the control did first and then plays the sound, so a switch that turns the sound off
 * is silent, and one that turns it on is heard.
 */
export function withTapSound<A extends unknown[]>(fn?: (...args: A) => unknown): (...args: A) => void {
  return marked((...args: A) => {
    fn?.(...args);
    playUi('tap');
  });
}

/**
 * The chips going onto a bet: call it at the moment the bet is taken (the chip leaves the player's chips), once for one tap,
 * Rebet or Double. The bets' own sound from the API (the old "bet placed" sound of the table games) is not played any more,
 * so this one is the only sound a bet makes.
 */
export function playChipBet(): void {
  playUi('chipBet');
}
