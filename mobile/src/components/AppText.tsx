import React from 'react';
import { Text as RNText, TextInput as RNTextInput, TextInputProps, TextProps } from 'react-native';

/**
 * How much bigger than designed a text may get when the phone's own "font size" setting is turned up.
 * The screens are built from buttons and boxes of a fixed size, so text at 130 % or more is cut off in them.
 * The setting may still make text a little bigger, not more.
 */
export const MAX_FONT_SCALE = 1.1;

/** The app's Text: the same as react-native's, with the limit above (set `maxFontSizeMultiplier` to override it). */
export const Text = React.forwardRef<RNText, TextProps>(function Text(props, ref) {
  return <RNText ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});
export type Text = RNText;

/** The app's TextInput, with the same limit. */
export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  return <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});
export type TextInput = RNTextInput;
