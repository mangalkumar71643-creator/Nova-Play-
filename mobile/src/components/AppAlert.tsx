import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, gradients, radius, shadow, spacing, typography } from '../theme';

/**
 * The app's own popup, in place of the plain system dialog (Alert.alert):
 * same arguments — title, message, buttons — plus an optional look. Shown by
 * <AppAlertHost /> at the app root; popups asked for while one is open wait
 * their turn.
 */
export type AppAlertButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
export type AppAlertKind = 'success' | 'error' | 'warning' | 'info';
export type AppAlertOptions = {
  kind?: AppAlertKind;
  /** Big gold line above the message, e.g. "₹100". */
  highlight?: string;
};

type Item = { id: number; title: string; message?: string; buttons: AppAlertButton[]; kind: AppAlertKind; highlight?: string };

let nextId = 1;
let queue: Item[] = [];
let listener: ((items: Item[]) => void) | null = null;

const SUCCESS = /\b(done|submitted|set|active|rotated|revealed|success|saved|credited)\b/i;
const ERROR = /\b(failed|could not|invalid|incorrect|cancelled|not available|stopped|missing|restriction)\b/i;
const WARNING = /\b(confirm|log out|verify|enter|pick|not finished)\b/i;

function kindOf(title: string): AppAlertKind {
  if (ERROR.test(title)) return 'error';
  if (SUCCESS.test(title)) return 'success';
  if (WARNING.test(title)) return 'warning';
  return 'info';
}

export function showAlert(title: string, message?: string, buttons?: AppAlertButton[], options?: AppAlertOptions) {
  queue = [
    ...queue,
    {
      id: nextId++,
      title,
      message,
      buttons: buttons?.length ? buttons : [{ text: 'OK' }],
      kind: options?.kind ?? kindOf(title),
      highlight: options?.highlight,
    },
  ];
  listener?.(queue);
}

function dismiss(id: number) {
  queue = queue.filter((i) => i.id !== id);
  listener?.(queue);
}

const LOOKS: Record<AppAlertKind, { icon: keyof typeof MaterialCommunityIcons.glyphMap; ring: readonly [string, string]; color: string }> = {
  success: { icon: 'check-bold', ring: ['#5BE3A4', '#1E9E66'], color: '#0B3A25' },
  error: { icon: 'close-thick', ring: [colors.crimsonLight, colors.crimsonDark], color: '#FFFFFF' },
  warning: { icon: 'exclamation-thick', ring: [colors.goldLight, colors.goldDark], color: colors.background },
  info: { icon: 'information-variant', ring: [colors.goldLight, colors.goldDark], color: colors.background },
};

export function AppAlertHost() {
  const [items, setItems] = useState<Item[]>(queue);
  useEffect(() => {
    listener = setItems;
    setItems(queue);
    return () => {
      if (listener === setItems) listener = null;
    };
  }, []);
  const item = items[0];
  return item ? <AlertCard key={item.id} item={item} /> : null;
}

function AlertCard({ item }: { item: Item }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const width = Math.min(340, screenWidth - spacing.lg * 3);
  const enter = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const look = LOOKS[item.kind];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enter, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [enter, pop]);

  const close = (button?: AppAlertButton) => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(enter, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      dismiss(item.id);
      button?.onPress?.();
    });
  };
  // Back button: the Cancel button if there is one, else the only button.
  const onBack = () => close(item.buttons.find((b) => b.style === 'cancel') ?? (item.buttons.length === 1 ? item.buttons[0] : undefined));

  const stacked = item.buttons.length > 2;
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  const iconScale = pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.2, 1.15, 1] });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onBack}>
      <Animated.View style={[styles.backdrop, { opacity: enter }]}>
        <Animated.View style={{ width, opacity: enter, transform: [{ scale }] }}>
          <LinearGradient colors={['#4A1A22', colors.surface, '#1A0709']} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={styles.card}>
            <LinearGradient
              colors={['transparent', colors.goldLight, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.topShine}
            />
            <Animated.View style={[styles.iconWrap, { transform: [{ scale: iconScale }] }]}>
              <View style={[styles.iconHalo, { backgroundColor: look.ring[0] }]} />
              <LinearGradient colors={look.ring} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.icon}>
                <MaterialCommunityIcons name={look.icon} size={30} color={look.color} />
              </LinearGradient>
            </Animated.View>

            <Text style={styles.title}>{item.title}</Text>
            {item.highlight ? <Text style={styles.highlight}>{item.highlight}</Text> : null}
            {item.message ? (
              <ScrollView style={{ maxHeight: screenHeight * 0.4 }} contentContainerStyle={styles.messageWrap}>
                <Text style={styles.message} selectable>
                  {item.message}
                </Text>
              </ScrollView>
            ) : null}

            <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
              {item.buttons.map((b, i) => (
                <AlertButton key={`${b.text}-${i}`} button={b} stacked={stacked} onPress={() => close(b)} />
              ))}
            </View>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function AlertButton({ button, stacked, onPress }: { button: AppAlertButton; stacked: boolean; onPress: () => void }) {
  const cancel = button.style === 'cancel';
  const destructive = button.style === 'destructive';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [stacked ? styles.buttonStacked : styles.buttonFlex, { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      {cancel ? (
        <View style={[styles.button, styles.cancelButton]}>
          <Text style={[styles.buttonText, { color: colors.textSecondary }]}>{button.text}</Text>
        </View>
      ) : (
        <LinearGradient
          colors={destructive ? gradients.crimsonButton : gradients.goldButton}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.button}
        >
          <Text style={[styles.buttonText, { color: destructive ? colors.textPrimary : colors.background }]}>{button.text}</Text>
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingTop: spacing.xxxl + spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    overflow: 'visible',
    ...shadow.card,
  },
  topShine: {
    position: 'absolute',
    top: 0,
    left: spacing.xl,
    right: spacing.xl,
    height: 1.5,
  },
  iconWrap: {
    position: 'absolute',
    top: -34,
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHalo: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    opacity: 0.22,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
    ...shadow.glow,
  },
  title: {
    color: colors.goldLight,
    fontSize: typography.xl,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  highlight: {
    color: colors.textPrimary,
    fontSize: typography.display,
    fontWeight: '900',
    marginTop: spacing.sm,
    textShadowColor: 'rgba(240, 185, 61, 0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  messageWrap: {
    paddingTop: spacing.md,
  },
  message: {
    color: colors.textSecondary,
    fontSize: typography.md,
    lineHeight: 22,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    alignSelf: 'stretch',
  },
  buttonsStacked: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  buttonFlex: {
    flex: 1,
  },
  buttonStacked: {
    alignSelf: 'stretch',
  },
  button: {
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  buttonText: {
    fontSize: typography.md,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
