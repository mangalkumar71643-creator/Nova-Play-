import React from 'react';
import { StyleSheet, View } from 'react-native';

/** The height of one chip (a result chip's own `height`), so the strip shows exactly one line of them. */
export const CHIP_HEIGHT = 24;

type Props = {
  children: React.ReactNode;
  /** Space between two chips. */
  gap?: number;
  /** Space at the left and right edge of the screen. */
  edge?: number;
};

/**
 * The strip of recent-result chips above a game. It shows the chips that fit WHOLE: the ones that would reach past the
 * screen's edge wrap onto a second line that is clipped away, so no chip is ever drawn half-cut at the edge.
 * Give every chip `height: CHIP_HEIGHT`.
 */
export default function ChipStrip({ children, gap = 6, edge = 10 }: Props) {
  return <View style={[styles.strip, { columnGap: gap, paddingHorizontal: edge }]}>{children}</View>;
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    alignItems: 'flex-start',
    rowGap: 40,
    height: CHIP_HEIGHT + 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
});
