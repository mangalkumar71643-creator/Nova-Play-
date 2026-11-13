import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';

/**
 * How far the on-screen keyboard reaches up into the box `ref` points at, in points (0 when it does not).
 * The app draws edge to edge, so on newer Android phones the window is not made smaller for the keyboard
 * and it would cover the bottom of the screen (a password box included): a screen adds this much padding at
 * its bottom, and the box above stays in view. Where the window is resized after all, the box is already
 * clear of the keyboard and the answer is 0. On the website the browser does this itself (see build-web.py).
 */
export function useKeyboardOverlap(ref: React.RefObject<View | null>): number {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      ref.current?.measureInWindow((_x, y, _w, h) => setOverlap(Math.max(0, Math.round(y + h - keyboardTop))));
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setOverlap(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref]);
  return overlap;
}

/** The box with the cursor in it, as an object that can be measured (null when no box is focused). */
export function focusedInput(): { measureLayout: (relativeTo: any, onSuccess: (x: number, y: number, w: number, h: number) => void, onFail?: () => void) => void } | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextInput } = require('react-native');
  return TextInput.State?.currentlyFocusedInput?.() ?? null;
}

/** A callback that, once, waits for the keyboard's padding to be laid out and then runs `fn`. */
export function useAfterKeyboardShown(fn: () => void) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      // After the padding the overlap adds has been laid out.
      setTimeout(() => latest.current(), 120);
    });
    return () => sub.remove();
  }, []);
}
