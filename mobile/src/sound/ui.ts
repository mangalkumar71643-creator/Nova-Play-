import { AudioPlayer, createAudioPlayer } from 'expo-audio';

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
} as const;

export type UiSound = keyof typeof UI_SOURCES;

/**
 * How many players a sound gets, taken in turns, so quick taps do not cut each other off. A sound that is tapped many times in
 * a second (the chips) needs more than one that is not (a popup being closed). A sound's length times its taps per second is
 * about how many it needs.
 */
const VOICES: Record<UiSound, number> = { popupClose: 2, chipBet: 4 };

const players = new Map<UiSound, { list: AudioPlayer[]; turn: number } | null>();

/** The players of a sound, taken in turns (VOICES). Made on the first use (or at start-up, see preloadUiSounds), kept for good. */
function playersOf(name: UiSound) {
  let entry = players.get(name);
  if (entry === undefined) {
    try {
      ensureAudioMode();
      entry = { list: Array.from({ length: VOICES[name] }, () => createAudioPlayer(UI_SOURCES[name])), turn: 0 };
    } catch {
      entry = null; // this sound stays silent
    }
    players.set(name, entry);
  }
  return entry;
}

/**
 * Makes the players now (called when the app starts), so the very first tap is not the one that has to load the file: a player
 * that has just been made is not ready for a moment, and a sound as short as these could be missed.
 */
export function preloadUiSounds(): void {
  for (const name of Object.keys(UI_SOURCES) as UiSound[]) playersOf(name);
}

/** Plays an interface sound (nothing if the sound effects are switched off). It can never throw into the screen. */
export function playUi(name: UiSound): void {
  if (!isSoundEnabled()) return;
  const entry = playersOf(name);
  if (!entry) return;
  const p = entry.list[entry.turn];
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

/**
 * For a popup's cross: `onPress={withPopupSound(() => setPanel(null))}` plays the popup-closing sound, then does what the
 * button did before.
 */
export function withPopupSound<A extends unknown[]>(fn?: (...args: A) => unknown): (...args: A) => void {
  return (...args: A) => {
    playUi('popupClose');
    fn?.(...args);
  };
}

/**
 * The chips going onto a bet: call it at the moment the bet is taken (the chip leaves the player's chips), once for one tap,
 * Rebet or Double. The bets' own sound from the API (the old "bet placed" sound of the table games) is not played any more,
 * so this one is the only sound a bet makes.
 */
export function playChipBet(): void {
  playUi('chipBet');
}
