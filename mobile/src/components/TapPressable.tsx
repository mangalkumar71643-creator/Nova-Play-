import { forwardRef } from 'react';
import { GestureResponderEvent, Pressable, PressableProps, View } from 'react-native';

import { hasOwnSound, playUi } from '../sound/ui';

export type TapPressableProps = PressableProps & {
  /** No touch sound for this one. */
  silent?: boolean;
};

/**
 * A Pressable that makes the touch sound when it is tapped: the buttons, tabs, tiles and rows of the app's menus. It is used
 * in place of the React Native Pressable in every screen and component that is not a game (the check script
 * scripts/sounds/check-api-hook.ts fails if one of them still imports Pressable from react-native).
 *
 * The sound is made after the press handler has run (so a button that turns the sound off is silent, and one that turns it on is
 * heard), and only when the press does something (`onPress` is set and the button is not disabled). A handler that makes an
 * interface sound of its own (withPopupSound, withTapSound) is left alone, and `silent` switches the sound off for one button.
 */
const TapPressable = forwardRef<View, TapPressableProps>(function TapPressable({ onPress, silent, ...rest }, ref) {
  const handlePress = onPress
    ? (event: GestureResponderEvent) => {
        onPress(event);
        if (!silent && !hasOwnSound(onPress)) playUi('tap');
      }
    : undefined;
  return <Pressable ref={ref} onPress={handlePress} {...rest} />;
});

export default TapPressable;
