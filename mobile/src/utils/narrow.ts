import { Dimensions } from 'react-native';

/**
 * True on a narrow phone (under 380 dp wide: the common 360 dp ones). A few headings and labels are set a little smaller
 * there so they fit on one line next to their neighbours instead of being cut.
 */
export const NARROW = Dimensions.get('window').width < 380;
