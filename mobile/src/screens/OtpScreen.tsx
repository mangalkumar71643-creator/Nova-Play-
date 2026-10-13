import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthStackParamList } from '../navigation/types';
import { colors, gradients, radius, spacing, typography } from '../theme';
import { useAuth } from '../state/AuthContext';

type Route = RouteProp<AuthStackParamList, 'Otp'>;
const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function OtpScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<Route>();
  const { verifyOtp, resendOtp, otpError } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function handleChange(index: number, value: string) {
    const clean = value.replace(/[^0-9]/g, '');
    setError(false);
    const next = [...digits];
    next[index] = clean.slice(-1);
    setDigits(next);
    if (clean && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(index: number, key: string) {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  async function handleVerify() {
    const code = digits.join('');
    if (code.length !== CODE_LENGTH) return;
    const error = await verifyOtp(code);
    if (error) {
      setError(true);
      return;
    }
    // Navigation resets automatically once RootNavigator sees isAuthenticated flip to true.
  }

  async function handleResend() {
    if (secondsLeft > 0) return;
    await resendOtp(route.params.phone);
    setSecondsLeft(RESEND_SECONDS);
    setDigits(Array(CODE_LENGTH).fill(''));
    setError(false);
    inputs.current[0]?.focus();
  }

  return (
    <LinearGradient colors={gradients.background} style={styles.fill}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="shield-key-outline" size={36} color={colors.gold} />
        </View>
        <Text style={styles.title}>Verify Your Number</Text>
        <Text style={styles.subtitle}>Enter the 6-digit code sent to</Text>
        <Text style={styles.phone}>+91 {route.params.phone}</Text>

        {otpError ? (
          <View style={styles.demoBanner}>
            <MaterialCommunityIcons name="information-outline" size={14} color={colors.gold} />
            <Text style={styles.demoBannerText}>{otpError}</Text>
          </View>
        ) : null}

        <View style={styles.otpRow}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChangeText={(v) => handleChange(i, v)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={1}
              style={[styles.otpBox, error && styles.otpBoxError]}
              autoFocus={i === 0}
            />
          ))}
        </View>
        {error ? <Text style={styles.errorText}>Incorrect code. Please try again.</Text> : null}

        <Pressable
          onPress={handleVerify}
          disabled={digits.join('').length !== CODE_LENGTH}
          style={({ pressed }) => [
            { opacity: digits.join('').length !== CODE_LENGTH ? 0.5 : pressed ? 0.85 : 1 },
            styles.verifyButtonWrap,
          ]}
        >
          <LinearGradient colors={gradients.crimsonButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.verifyButton}>
            <Text style={styles.verifyButtonText}>VERIFY & CONTINUE</Text>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={handleResend} disabled={secondsLeft > 0} style={styles.resendRow}>
          <Text style={styles.resendText}>
            {secondsLeft > 0 ? `Resend OTP in ${secondsLeft}s` : "Didn't receive it? "}
            {secondsLeft === 0 ? <Text style={styles.resendLink}>Resend</Text> : null}
          </Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { color: colors.textPrimary, fontSize: typography.xl, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: typography.sm, marginTop: spacing.sm },
  phone: { color: colors.gold, fontSize: typography.md, fontWeight: '700', marginTop: 2 },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  demoBannerText: { color: colors.gold, fontSize: typography.xs, fontWeight: '700', marginLeft: spacing.xs },
  otpRow: { flexDirection: 'row', marginTop: spacing.xxl },
  otpBox: {
    width: 56,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: typography.xl,
    fontWeight: '800',
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  otpBoxError: { borderColor: colors.negative },
  errorText: { color: colors.negative, fontSize: typography.xs, marginTop: spacing.md },
  verifyButtonWrap: { alignSelf: 'stretch', marginTop: spacing.xxl },
  verifyButton: { borderRadius: radius.pill, paddingVertical: spacing.md + 2, alignItems: 'center', justifyContent: 'center' },
  verifyButtonText: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.md, letterSpacing: 1 },
  resendRow: { marginTop: spacing.xl },
  resendText: { color: colors.textMuted, fontSize: typography.sm },
  resendLink: { color: colors.gold, fontWeight: '700' },
});
