import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchSupportContact } from '../api/backend';
import { showAlert } from '../components/AppAlert';
import { useAuth } from '../state/AuthContext';
import { colors, gradients, radius, spacing, typography } from '../theme';

type Mode = 'login' | 'register' | 'reset';

const LAST_PHONE_KEY = 'novaplay:lastPhone:v1';
const MIN_PASSWORD = 6;
const digitsOf = (s: string) => s.replace(/\D/g, '').slice(-10);
const validPhone = (d: string) => /^[6-9]\d{9}$/.test(d);

/**
 * Log in / register with a mobile number and a password, no SMS code. The
 * code is used only to reset a forgotten password (Forgot password); if it
 * doesn't arrive, customer service sets the password.
 */
export default function LoginScreen() {
  const { passwordLogin, passwordRegister, sendPasswordCode, resetPassword } = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(true);
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // The number used last time, so a returning player only types the password.
  useEffect(() => {
    AsyncStorage.getItem(LAST_PHONE_KEY)
      .then((p) => p && setPhone(p))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const switchTo = (m: Mode, message: string | null = null) => {
    setMode(m);
    setNote(message);
    setPassword('');
    setConfirm('');
    setCode('');
    setCodeSent(false);
    setCooldown(0);
  };

  function checkPhone(): string | null {
    const d = digitsOf(phone);
    if (!validPhone(d)) {
      showAlert('Mobile number', 'Enter a valid 10-digit mobile number.');
      return null;
    }
    return d;
  }
  function checkNewPassword(): boolean {
    if (password.length < MIN_PASSWORD) {
      showAlert('Password', `Use a password of at least ${MIN_PASSWORD} characters.`);
      return false;
    }
    if (password !== confirm) {
      showAlert('Password', 'The two passwords do not match.');
      return false;
    }
    return true;
  }

  async function onLogin() {
    const d = checkPhone();
    if (!d) return;
    if (!password) return showAlert('Password', 'Enter your password.');
    setBusy(true);
    const err = await passwordLogin(d, password);
    setBusy(false);
    if (!err) {
      if (remember) AsyncStorage.setItem(LAST_PHONE_KEY, d).catch(() => {});
      else AsyncStorage.removeItem(LAST_PHONE_KEY).catch(() => {});
      return;
    }
    if (err === 'PASSWORD_NOT_SET') {
      switchTo('register', 'This number has no password yet. Enter a new password below and tap Register to set it.');
      return;
    }
    showAlert('Could not log in', err);
  }

  async function onRegister() {
    const d = checkPhone();
    if (!d || !checkNewPassword()) return;
    if (!agree) return showAlert('Privacy Agreement', 'Please read and agree to the Privacy Agreement.');
    setBusy(true);
    const err = await passwordRegister(d, password, inviteCode.trim() || undefined);
    setBusy(false);
    if (!err) {
      AsyncStorage.setItem(LAST_PHONE_KEY, d).catch(() => {});
      return;
    }
    if (err === 'PASSWORD_NOT_SET') {
      contactSupport('This number has an old account with money in it. Customer service will set its password for you.');
      return;
    }
    if (/already has an account/i.test(err)) {
      switchTo('login', 'This number already has an account. Log in with its password.');
      return;
    }
    showAlert('Could not register', err);
  }

  async function onSendCode() {
    const d = checkPhone();
    if (!d) return;
    setBusy(true);
    const r = await sendPasswordCode(d);
    setBusy(false);
    if (r.error) return showAlert('Could not send the code', r.error);
    setCodeSent(true);
    setCooldown(30);
    if (r.devCode) setCode(r.devCode);
    else showAlert('Code sent', `A 6-digit code was sent by SMS to +91 ${d}.`, undefined, { kind: 'info' });
  }

  async function onReset() {
    const d = checkPhone();
    if (!d) return;
    if (!checkNewPassword()) return;
    if (!/^\d{6}$/.test(code)) return showAlert('Verification code', 'Enter the 6-digit code from the SMS.');
    setBusy(true);
    const err = await resetPassword(d, code, password);
    setBusy(false);
    if (!err) {
      AsyncStorage.setItem(LAST_PHONE_KEY, d).catch(() => {});
      return;
    }
    showAlert('Could not reset the password', err);
  }

  // Players who can't log in (forgot the password, or an old account with none) ask customer service.
  async function contactSupport(message: string) {
    let url: string | null = null;
    try {
      url = (await fetchSupportContact()).telegramUrl;
    } catch {
      // No link: the message alone is shown.
    }
    showAlert(
      'Contact customer service',
      message,
      url ? [{ text: 'Close', style: 'cancel' }, { text: 'Open Telegram', onPress: () => Linking.openURL(url!).catch(() => {}) }] : undefined,
      { kind: 'info' }
    );
  }

  const eye = (
    <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
      <MaterialCommunityIcons name={show ? 'eye-outline' : 'eye-off-outline'} size={22} color={colors.textMuted} />
    </Pressable>
  );

  const title = mode === 'login' ? 'Log in' : mode === 'register' ? 'Register' : 'Reset password';
  const sub =
    mode === 'login'
      ? 'Log in with your mobile number and password.\nForgot your password? Tap Forgot password.'
      : mode === 'register'
        ? 'Register with your mobile number.'
        : 'Reset your password with the code we SMS to your mobile number.\nNo code? Contact customer service.';

  return (
    <LinearGradient colors={gradients.background} style={styles.fill}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <Image source={require('../../assets/novaplay-badge.webp')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>

          {mode !== 'reset' ? (
            <View style={styles.tabs}>
              {(['login', 'register'] as const).map((m) => (
                <Pressable key={m} style={[styles.tab, mode === m && styles.tabOn]} onPress={() => switchTo(m)}>
                  <Text style={[styles.tabText, mode === m && styles.tabTextOn]}>{m === 'login' ? 'Log in' : 'Register'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {note ? <Text style={styles.note}>{note}</Text> : null}

          <Text style={styles.label}>Phone number</Text>
          <View style={styles.row}>
            <View style={styles.cc}>
              <Text style={styles.ccText}>+91</Text>
            </View>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^\d]/g, '').slice(0, 10))}
              placeholder="Please enter the phone number"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>

          <Text style={styles.label}>{mode === 'login' ? 'Password' : mode === 'register' ? 'Set password' : 'New password'}</Text>
          <View style={[styles.input, styles.withIcon]}>
            <TextInput
              style={styles.inner}
              value={password}
              onChangeText={setPassword}
              placeholder="Please enter password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!show}
              autoCapitalize="none"
              maxLength={72}
            />
            {eye}
          </View>

          {mode !== 'login' ? (
            <>
              <Text style={styles.label}>Confirm password</Text>
              <View style={[styles.input, styles.withIcon]}>
                <TextInput
                  style={styles.inner}
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Please enter password again"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  maxLength={72}
                />
                {eye}
              </View>
            </>
          ) : null}

          {mode === 'reset' ? (
            <>
              <Text style={styles.label}>Verification code</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter the verification code"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Pressable style={[styles.codeBtn, (cooldown > 0 || busy) && { opacity: 0.5 }]} onPress={onSendCode} disabled={cooldown > 0 || busy}>
                  <Text style={styles.codeBtnText}>{cooldown > 0 ? `${cooldown}s` : codeSent ? 'Resend' : 'Send'}</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => contactSupport('Did not receive the code? Customer service will set a new password for you after checking it is your account.')} hitSlop={8}>
                <Text style={styles.link}>Did not receive the code? Contact customer service</Text>
              </Pressable>
            </>
          ) : null}

          {mode === 'register' ? (
            <>
              <Text style={styles.label}>Invite code (optional)</Text>
              <TextInput
                style={styles.input}
                value={inviteCode}
                onChangeText={(t) => setInviteCode(t.replace(/\D/g, '').slice(0, 12))}
                placeholder="Your friend's invite code"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />
              <Pressable style={styles.checkRow} onPress={() => setAgree((v) => !v)}>
                <MaterialCommunityIcons name={agree ? 'check-circle' : 'checkbox-blank-circle-outline'} size={22} color={agree ? colors.gold : colors.textMuted} />
                <Text style={styles.checkText}>I am 18+ and agree to the Privacy Agreement</Text>
              </Pressable>
            </>
          ) : null}

          {mode === 'login' ? (
            <View style={styles.between}>
              <Pressable style={styles.checkRow} onPress={() => setRemember((v) => !v)}>
                <MaterialCommunityIcons name={remember ? 'check-circle' : 'checkbox-blank-circle-outline'} size={22} color={remember ? colors.gold : colors.textMuted} />
                <Text style={styles.checkText}>Remember number</Text>
              </Pressable>
              <Pressable onPress={() => switchTo('reset')} hitSlop={8}>
                <Text style={styles.link}>Forgot password</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable onPress={mode === 'login' ? onLogin : mode === 'register' ? onRegister : onReset} disabled={busy} style={{ marginTop: spacing.lg }}>
            <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.primary, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#2A1300" /> : <Text style={styles.primaryText}>{mode === 'login' ? 'Log in' : mode === 'register' ? 'Register' : 'Reset'}</Text>}
            </LinearGradient>
          </Pressable>

          <Pressable style={styles.secondary} onPress={() => switchTo(mode === 'login' ? 'register' : 'login')}>
            <Text style={styles.secondaryText}>{mode === 'login' ? 'New here? Register' : mode === 'register' ? 'I have an account  Log in' : 'Back to log in'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, flexGrow: 1 },
  logo: { width: 110, height: 110, alignSelf: 'center' },
  title: { color: colors.goldLight, fontSize: typography.xxl, fontWeight: '900', textAlign: 'center', marginTop: spacing.sm },
  sub: { color: colors.textSecondary, fontSize: typography.sm, textAlign: 'center', marginTop: 4 },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.lg, overflow: 'hidden' },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  tabOn: { backgroundColor: colors.crimson },
  tabText: { color: colors.textSecondary, fontWeight: '700', fontSize: typography.md },
  tabTextOn: { color: colors.textPrimary },
  note: { color: colors.gold, fontSize: typography.sm, marginTop: spacing.md, lineHeight: 19 },
  label: { color: colors.textPrimary, fontWeight: '700', fontSize: typography.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  cc: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 50, justifyContent: 'center' },
  ccText: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '700' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    height: 50,
    fontSize: typography.md,
  },
  withIcon: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inner: { flex: 1, color: colors.textPrimary, fontSize: typography.md, height: 48 },
  codeBtn: { height: 50, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.gold, justifyContent: 'center' },
  codeBtnText: { color: colors.gold, fontWeight: '800', fontSize: typography.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  checkText: { color: colors.textSecondary, fontSize: typography.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: colors.gold, fontWeight: '700', fontSize: typography.sm, marginTop: spacing.md },
  primary: { borderRadius: 999, paddingVertical: spacing.md, alignItems: 'center' },
  primaryText: { color: '#2A1300', fontWeight: '900', fontSize: typography.lg },
  secondary: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.gold, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
  secondaryText: { color: colors.gold, fontWeight: '800', fontSize: typography.md },
});
