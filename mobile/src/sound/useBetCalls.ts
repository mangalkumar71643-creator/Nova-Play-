import { useMemo, useRef } from 'react';
import { playBetCall } from './ui';

/**
 * The spoken calls of a table game: "Please bet now" when a round opens for betting and "Bet locked" when its betting closes
 * (see playBetCall in ui.ts for when they are heard at all: the sound switch, the app in front).
 *
 * Each call is made at most once for a round, however often the screen re-renders or polls in between. A game screen calls
 * `open(period)` where it shows its "start betting" banner and `close(period)` where it shows its "no more bets" banner, so the voice
 * and the banner always come together.
 */
export function useBetCalls() {
  const last = useRef<{ open?: string; close?: string }>({});
  return useMemo(
    () => ({
      open(period: string): void {
        if (last.current.open === period) return;
        last.current.open = period;
        playBetCall('now');
      },
      close(period: string): void {
        if (last.current.close === period) return;
        last.current.close = period;
        playBetCall('stop');
      },
    }),
    []
  );
}
