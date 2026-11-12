import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';

export type Orientation = 'portrait' | 'landscape';

let current: Orientation = 'portrait';
const listeners = new Set<(o: Orientation) => void>();

/** The orientation the open screen asked for (the sideways games ask for landscape). */
export function requestedOrientation(): Orientation {
  return current;
}

/** Called when a screen asks for a different orientation (web: shows the "rotate your phone" notice). */
export function onOrientationRequest(fn: (o: Orientation) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Turns the screen to `mode`. In the installed app that locks the phone's orientation. On the website there is
 * no such lock: the page around the game (the desktop phone frame, see mobile/scripts/web-shell.html) is told to
 * make the game's window wide or tall, and a phone's browser is asked to go full screen and lock (it may refuse;
 * App.tsx then shows a notice to rotate the phone by hand).
 */
export function lockOrientation(mode: Orientation): void {
  current = mode;
  listeners.forEach((fn) => fn(mode));
  if (Platform.OS !== 'web') {
    ScreenOrientation.lockAsync(mode === 'landscape' ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    return;
  }
  try {
    if (window.parent !== window) window.parent.postMessage({ novaplay: 'orientation', mode }, window.location.origin);
    else if (mode === 'landscape') {
      const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
      const lock = (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock;
      el.requestFullscreen?.().then(() => lock?.call(screen.orientation, 'landscape')).catch(() => {});
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      (screen.orientation as { unlock?: () => void }).unlock?.();
    }
  } catch {
    // A browser without these: the notice in App.tsx covers it.
  }
}
