import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Linking, Platform, Pressable, StyleSheet, TextStyle, View, useWindowDimensions } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchSupportContact } from '../api/backend';
import { showAlert } from '../components/AppAlert';
import KeyboardAwareScrollView from '../components/KeyboardAwareScrollView';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, spacing } from '../theme';

type Mode = 'login' | 'register' | 'reset';

const LAST_PHONE_KEY = 'novaplay:lastPhone:v1';
// Written by AuthContext after every successful login or sign-up on this phone (never cleared by Logout).
const UID_MAP_KEY = 'novaplay:auth:uids:v1';
const MIN_PASSWORD = 6;
const digitsOf = (s: string) => s.replace(/\D/g, '').slice(-10);

/**
 * Web only: the separate welcome website links straight into this form
 * (?register=1 opens Register, ?login=1 opens Log in) and can carry a friend's
 * invite code (?invite=123456). The parameters are read once and then removed
 * from the address, so a later reload doesn't force the form again.
 */
function takeWebEntry(): { mode: 'register' | 'login' | null; invite: string } {
  const none = { mode: null, invite: '' };
  if (Platform.OS !== 'web' || typeof window === 'undefined') return none;
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams;
    const mode = q.has('register') ? 'register' : q.has('login') ? 'login' : null;
    const invite = (q.get('invite') ?? '').replace(/\D/g, '').slice(0, 12);
    if (!mode && !invite) return none;
    ['register', 'login', 'invite'].forEach((k) => q.delete(k));
    window.history.replaceState(null, '', url.pathname + (q.toString() ? `?${q}` : '') + url.hash);
    return { mode, invite };
  } catch {
    return none;
  }
}
const validPhone = (d: string) => /^[6-9]\d{9}$/.test(d);

// ---------------------------------------------------------------- look (the Home screen's: dark red, gold edges, red glow)
const GOLD_EDGE = ['#FFE9A8', '#B8862A', '#5E3D0E', '#B8862A', '#FFE9A8'] as const;
const PANEL = ['#3E0C15', '#260709', '#170508'] as const;
const RED_BUTTON = ['#FF6A7A', '#D8213A', '#8A0E1E'] as const;
const PAGE = '#0F0304';
const HERO_ASPECT = 424 / 828; // login-hero.webp
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
/** The browser's own focus ring is replaced by the field's gold glow. */
const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0 } : null) as TextStyle | null;

/** 0 = nothing typed, 1 = too short, then 2 (okay) to 4 (strong). */
function strengthOf(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  if (pw.length < MIN_PASSWORD) return 1;
  let s = 2;
  if (pw.length >= 10) s++;
  if (/[a-zA-Z]/.test(pw) && /\d/.test(pw) && (/[A-Z]/.test(pw) || /[^A-Za-z0-9]/.test(pw))) s++;
  return Math.min(4, s) as 2 | 3 | 4;
}
const STRENGTH = [
  { label: '', color: 'transparent' },
  { label: 'Too short', color: '#FF6B6B' },
  { label: 'Okay', color: '#F0B93D' },
  { label: 'Good', color: '#9BE564' },
  { label: 'Strong', color: '#3ECF8E' },
];

function Field({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  prefix,
  right,
  ok,
  optional,
  secureTextEntry,
  keyboardType,
  maxLength,
  autoCapitalize,
  onSubmitEditing,
  testID,
}: {
  label: string;
  icon: IconName;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  prefix?: string;
  right?: React.ReactNode;
  ok?: boolean;
  optional?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: 'number-pad';
  maxLength?: number;
  autoCapitalize?: 'none';
  onSubmitEditing?: () => void;
  testID?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional ? <Text style={styles.optional}>Optional</Text> : null}
      </View>
      <View style={[styles.field, focused && styles.fieldOn]}>
        <View style={[styles.fieldIcon, focused && styles.fieldIconOn]}>
          <MaterialCommunityIcons name={icon} size={20} color={focused ? '#FFE9B0' : colors.gold} />
        </View>
        {prefix ? (
          <>
            <Text style={styles.prefix}>{prefix}</Text>
            <View style={styles.prefixLine} />
          </>
        ) : null}
        <TextInput
          style={[styles.fieldInput, noOutline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8E6F73"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          returnKeyType={onSubmitEditing ? 'go' : 'next'}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectionColor={colors.gold}
          accessibilityLabel={label}
          testID={testID}
        />
        {ok ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.positive} style={styles.fieldOk} /> : null}
        {right}
      </View>
    </View>
  );
}

function Check({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable style={styles.checkRow} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <View style={[styles.box, on && styles.boxOn]}>{on ? <MaterialCommunityIcons name="check" size={15} color="#2A1300" /> : null}</View>
      <Text style={styles.checkText}>{children}</Text>
    </Pressable>
  );
}

/** Log in / Register: a gold-edged pill slides to the side picked. */
function Segmented({ value, onChange }: { value: 'login' | 'register'; onChange: (m: 'login' | 'register') => void }) {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(value === 'login' ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: value === 'login' ? 0 : 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [value, x]);
  const half = Math.max(0, (w - 8) / 2);
  return (
    <View style={styles.seg} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Animated.View style={[styles.segPill, { width: half, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, half] }) }] }]}>
          <LinearGradient colors={RED_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.segPillFill} />
        </Animated.View>
      ) : null}
      {(['login', 'register'] as const).map((m) => (
        <Pressable key={m} style={styles.segBtn} onPress={() => onChange(m)} accessibilityRole="tab" accessibilityState={{ selected: value === m }} testID={`tab-${m}`}>
          <Text style={[styles.segText, value === m && styles.segTextOn]}>{m === 'login' ? 'Log in' : 'Register'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The main button: red, with a gold edge, a gloss and a light that sweeps across it now and then. */
function Cta({ label, busy, onPress, testID }: { label: string; busy: boolean; onPress: () => void; testID: string }) {
  const [w, setW] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(sweep, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);
  return (
    <Pressable onPress={onPress} disabled={busy} testID={testID} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.ctaWrap, { transform: [{ scale: pressed ? 0.98 : 1 }], opacity: busy ? 0.75 : 1 }]}>
      <LinearGradient colors={GOLD_EDGE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ctaEdge}>
        <LinearGradient colors={RED_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']} style={styles.ctaGloss} pointerEvents="none" />
          {w > 0 ? (
            <Animated.View pointerEvents="none" style={[styles.ctaShine, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-90, w + 40] }) }, { skewX: '-20deg' }] }]}>
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.38)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          ) : null}
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.ctaRow}>
              <Text style={styles.ctaText}>{label}</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
            </View>
          )}
        </LinearGradient>
      </LinearGradient>
    </Pressable>
  );
}

/**
 * Log in / register with a mobile number and a password, no SMS code.
 * Forgot password: a code is texted to the player's number and they enter
 * it here with a new password; if the SMS doesn't arrive, customer service
 * (the admin panel) can give them the code.
 */
export default function LoginScreen() {
  const { passwordLogin, passwordRegister, askResetCode, resetPassword } = useAuth();
  const insets = useSafeAreaInsets();
  // A new install opens on Register; a phone that has logged in or signed up before opens on Log in.
  const [mode, setMode] = useState<Mode>('register');
  const [ready, setReady] = useState(false);
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
  // The width the screen really has (inside the phone frame on a computer) and the two entrance animations.
  const { width: windowW } = useWindowDimensions();
  const [boxW, setBoxW] = useState(0);
  const W = boxW || windowW;
  const enter = useRef(new Animated.Value(0)).current;
  const swap = useRef(new Animated.Value(1)).current;

  // The number used last time, so a returning player only types the password.
  useEffect(() => {
    let cancelled = false;
    const entry = takeWebEntry();
    if (entry.invite) setInviteCode(entry.invite);
    AsyncStorage.multiGet([LAST_PHONE_KEY, UID_MAP_KEY])
      .then(([last, uids]) => {
        if (cancelled) return;
        const lastPhone = last?.[1] ?? null;
        let known = false;
        try {
          known = Object.keys(JSON.parse(uids?.[1] ?? '{}')).length > 0;
        } catch {
          known = false;
        }
        if (lastPhone) setPhone(lastPhone);
        // A link from the welcome website decides the form; otherwise a new install registers and a known phone logs in.
        setMode(entry.mode ?? (entry.invite ? 'register' : lastPhone || known ? 'login' : 'register'));
      })
      .catch(() => {})
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (ready) Animated.timing(enter, { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [ready, enter]);

  // The form eases in again whenever the mode changes.
  useEffect(() => {
    swap.setValue(0);
    Animated.timing(swap, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [mode, swap]);

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
    if (busy) return;
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
    if (busy) return;
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

  async function onAskCode() {
    const d = checkPhone();
    if (!d) return;
    setBusy(true);
    const r = await askResetCode(d);
    setBusy(false);
    if (r.error) return showAlert('Could not send the code', r.error);
    setCodeSent(true);
    setCooldown(30);
    showAlert(
      r.sms ? 'Code sent' : 'Contact customer service',
      r.sms
        ? `A 6-digit code was sent by SMS to +91 ${d}. Enter it here with your new password.`
        : `We could not text the code. Customer service will check it is you and give you the code (Telegram, WhatsApp or a call to +91 ${d}). Enter it here with your new password.`,
      undefined,
      { kind: 'info' }
    );
  }

  async function onReset() {
    if (busy) return;
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
    <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityLabel={show ? 'Hide password' : 'Show password'} style={styles.eye}>
      <MaterialCommunityIcons name={show ? 'eye-outline' : 'eye-off-outline'} size={22} color={colors.goldLight} />
    </Pressable>
  );

  const title = mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset password';
  const sub =
    mode === 'login'
      ? 'Log in with your mobile number and password.\nForgot your password? Tap Forgot password.'
      : mode === 'register'
        ? 'Register with your mobile number.'
        : 'We text a code to your number. Enter it here with a new password.\nNo SMS? Contact customer service.';
  const submit = mode === 'login' ? onLogin : mode === 'register' ? onRegister : onReset;
  const strength = STRENGTH[strengthOf(password)];
  const heroH = Math.round(W * HERO_ASPECT);

  // Until the saved state is read, only the background (no flash of the wrong screen).
  if (!ready) return <View style={[styles.fill, { backgroundColor: PAGE }]} />;

  return (
    <View style={[styles.fill, { backgroundColor: PAGE }]} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
      <Image source={require('../../assets/home-background.webp')} style={styles.pageImage} resizeMode="cover" />
      <LinearGradient colors={['rgba(15,3,4,0.2)', 'rgba(15,3,4,0.55)', 'rgba(15,3,4,0.88)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <KeyboardAwareScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* The logo art (its edges fade to transparent, so it melts into the page). */}
        <Animated.View style={{ width: W, height: heroH + insets.top, opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1] }) }] }}>
          <Image source={require('../../assets/login-hero.webp')} style={{ position: 'absolute', left: 0, bottom: 0, width: W, height: heroH }} resizeMode="cover" />
        </Animated.View>

        <View style={styles.body}>
          <Animated.View style={[styles.titleBlock, { opacity: swap }]}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>{sub}</Text>
          </Animated.View>

          <Animated.View style={[styles.cardShadow, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] }]}>
            <LinearGradient colors={GOLD_EDGE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardEdge}>
              <LinearGradient colors={PANEL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
                <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Defs>
                    <RadialGradient id="cardGlow" cx="88%" cy="0%" rx="75%" ry="40%">
                      <Stop offset="0" stopColor="#FF3B4F" stopOpacity="0.30" />
                      <Stop offset="1" stopColor="#FF3B4F" stopOpacity="0" />
                    </RadialGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#cardGlow)" />
                </Svg>
                <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']} style={styles.cardGloss} pointerEvents="none" />

                {mode !== 'reset' ? <Segmented value={mode} onChange={(m) => switchTo(m)} /> : null}

                <Animated.View style={{ opacity: swap, transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                  {note ? (
                    <View style={styles.noteBox}>
                      <MaterialCommunityIcons name="information-outline" size={18} color={colors.gold} />
                      <Text style={styles.note}>{note}</Text>
                    </View>
                  ) : null}

                  <Field
                    label="Phone number"
                    icon="cellphone"
                    prefix="+91"
                    value={phone}
                    onChangeText={(t) => setPhone(t.replace(/[^\d]/g, '').slice(0, 10))}
                    placeholder="Enter mobile number"
                    keyboardType="number-pad"
                    maxLength={10}
                    ok={validPhone(phone)}
                    testID="field-phone"
                  />

                  <Field
                    label={mode === 'login' ? 'Password' : mode === 'register' ? 'Set password' : 'New password'}
                    icon="lock-outline"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter password"
                    secureTextEntry={!show}
                    autoCapitalize="none"
                    maxLength={72}
                    right={eye}
                    onSubmitEditing={mode === 'login' ? onLogin : undefined}
                    testID="field-password"
                  />
                  {mode !== 'login' && password ? (
                    <View style={styles.strength}>
                      <View style={styles.bars}>
                        {[1, 2, 3, 4].map((n) => (
                          <View key={n} style={[styles.bar, strengthOf(password) >= n && { backgroundColor: strength.color }]} />
                        ))}
                      </View>
                      <Text style={[styles.strengthText, { color: strength.color }]}>{strength.label}</Text>
                    </View>
                  ) : null}

                  {mode !== 'login' ? (
                    <Field
                      label="Confirm password"
                      icon="lock-check-outline"
                      value={confirm}
                      onChangeText={setConfirm}
                      placeholder="Re-enter password"
                      secureTextEntry={!show}
                      autoCapitalize="none"
                      maxLength={72}
                      right={eye}
                      ok={confirm.length >= MIN_PASSWORD && confirm === password}
                      testID="field-confirm"
                    />
                  ) : null}

                  {mode === 'reset' ? (
                    <>
                      <Field
                        label="Verification code"
                        icon="message-text-lock-outline"
                        value={code}
                        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit code from the SMS"
                        keyboardType="number-pad"
                        maxLength={6}
                        right={
                          <Pressable style={[styles.codeBtn, (cooldown > 0 || busy) && { opacity: 0.5 }]} onPress={onAskCode} disabled={cooldown > 0 || busy} accessibilityRole="button">
                            <Text style={styles.codeBtnText}>{cooldown > 0 ? `${cooldown}s` : codeSent ? 'Resend' : 'Send'}</Text>
                          </Pressable>
                        }
                        onSubmitEditing={onReset}
                        testID="field-code"
                      />
                      <Pressable onPress={() => contactSupport('SMS did not arrive? Customer service will check it is you and give you the code.')} hitSlop={8}>
                        <Text style={styles.link}>SMS did not arrive? Contact customer service</Text>
                      </Pressable>
                    </>
                  ) : null}

                  {mode === 'register' ? (
                    <>
                      <Field
                        label="Invite code"
                        optional
                        icon="gift-outline"
                        value={inviteCode}
                        onChangeText={(t) => setInviteCode(t.replace(/\D/g, '').slice(0, 12))}
                        placeholder="Your friend's invite code"
                        keyboardType="number-pad"
                        onSubmitEditing={onRegister}
                        testID="field-invite"
                      />
                      <Check on={agree} onPress={() => setAgree((v) => !v)}>
                        I am 18+ and agree to the Privacy Agreement
                      </Check>
                    </>
                  ) : null}

                  {mode === 'login' ? (
                    <View style={styles.between}>
                      <Check on={remember} onPress={() => setRemember((v) => !v)}>
                        Remember number
                      </Check>
                      <Pressable onPress={() => switchTo('reset')} hitSlop={8} testID="forgot">
                        <Text style={[styles.link, { marginTop: spacing.md }]}>Forgot password?</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <View style={{ marginTop: spacing.xl }}>
                    <Cta label={mode === 'login' ? 'Log in' : mode === 'register' ? 'Register' : 'Reset password'} busy={busy} onPress={submit} testID="submit" />
                  </View>

                  <Pressable style={styles.switchRow} onPress={() => switchTo(mode === 'login' ? 'register' : 'login')} hitSlop={8} testID="switch-mode">
                    {mode !== 'reset' ? <Text style={styles.switchText}>{mode === 'login' ? 'New to NovaPlay?' : 'Already have an account?'}</Text> : null}
                    <Text style={styles.switchLink}>{mode === 'login' ? 'Register' : mode === 'register' ? 'Log in' : 'Back to log in'}</Text>
                  </Pressable>
                </Animated.View>
              </LinearGradient>
            </LinearGradient>
          </Animated.View>

          <View style={styles.trust}>
            {(
              [
                ['shield-lock-outline', 'Secure login'],
                ['account-check-outline', '18+ only'],
                ['headset', 'Support'],
              ] as [IconName, string][]
            ).map(([icon, text]) => (
              <View key={text} style={styles.trustItem}>
                <MaterialCommunityIcons name={icon} size={16} color={colors.gold} />
                <Text style={styles.trustText}>{text}</Text>
              </View>
            ))}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Explicit 100% size: on the web an Image would otherwise keep its own pixel size and spill past a narrow screen.
  pageImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  scroll: { flexGrow: 1 },
  body: { paddingHorizontal: spacing.lg, marginTop: -10 },
  titleBlock: { alignItems: 'center', marginBottom: spacing.lg },
  title: { fontFamily: fonts.italic, fontSize: 24, color: '#FFE9B0', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.65)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  sub: { fontFamily: fonts.semi, fontSize: 12, lineHeight: 18, color: '#DDB0B5', textAlign: 'center', marginTop: 6 },

  cardShadow: { borderRadius: 24, shadowColor: '#F0B93D', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 18, elevation: 10 },
  cardEdge: { borderRadius: 24, padding: 1.4 },
  card: { borderRadius: 23, padding: spacing.lg, overflow: 'hidden' },
  cardGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: 90 },

  seg: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.38)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(240,185,61,0.32)', padding: 4, marginBottom: spacing.sm },
  segPill: { position: 'absolute', top: 4, left: 4, bottom: 4, borderRadius: 12, borderWidth: 1.2, borderColor: 'rgba(255,222,140,0.75)', overflow: 'hidden' },
  segPillFill: { flex: 1 },
  segBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: fonts.bold, fontSize: 14, color: '#C9A9AD' },
  segTextOn: { color: '#FFFFFF' },

  noteBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: 'rgba(240,185,61,0.10)', borderColor: 'rgba(240,185,61,0.35)', borderWidth: 1, borderRadius: 12, padding: 10, marginTop: spacing.sm },
  note: { flex: 1, fontFamily: fonts.semi, color: '#FFDE8C', fontSize: 12, lineHeight: 18 },

  fieldWrap: { marginTop: spacing.lg },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  label: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.4, color: '#F4D9A0' },
  optional: { fontFamily: fonts.semi, fontSize: 10.5, color: '#9C7E82' },
  field: { flexDirection: 'row', alignItems: 'center', height: 52, backgroundColor: 'rgba(8,2,3,0.62)', borderWidth: 1.2, borderColor: 'rgba(240,185,61,0.30)', borderRadius: 15, overflow: 'hidden' },
  fieldOn: { borderColor: '#F0B93D', backgroundColor: 'rgba(24,6,9,0.78)', shadowColor: '#F0B93D', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 10 },
  fieldIcon: { width: 46, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(122,14,28,0.55)', borderRightWidth: 1, borderRightColor: 'rgba(240,185,61,0.28)' },
  fieldIconOn: { backgroundColor: 'rgba(168,24,44,0.7)' },
  prefix: { fontFamily: fonts.bold, fontSize: 14.5, color: '#FFFFFF', paddingLeft: 12 },
  prefixLine: { width: 1, height: 22, backgroundColor: 'rgba(240,185,61,0.35)', marginLeft: 10 },
  // minWidth 0: on the web an input keeps its own default width, which pushed the green tick (and on a narrow phone the eye) out of the box.
  fieldInput: { flex: 1, minWidth: 0, height: 50, paddingHorizontal: 12, fontFamily: fonts.semi, fontSize: 14.5, color: '#FFFFFF' },
  fieldOk: { marginRight: 10, flexShrink: 0 },
  eye: { paddingHorizontal: 12, height: 50, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  strength: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9 },
  bars: { flex: 1, flexDirection: 'row', gap: 5 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  strengthText: { fontFamily: fonts.bold, fontSize: 11, minWidth: 54, textAlign: 'right' },

  codeBtn: { flexShrink: 0, height: 36, paddingHorizontal: 14, marginRight: 8, borderRadius: 11, borderWidth: 1.4, borderColor: colors.gold, justifyContent: 'center', backgroundColor: 'rgba(240,185,61,0.10)' },
  codeBtnText: { fontFamily: fonts.extra, color: colors.goldLight, fontSize: 12 },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: 'rgba(240,185,61,0.6)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  boxOn: { backgroundColor: colors.gold, borderColor: '#FFE9A8' },
  checkText: { flexShrink: 1, fontFamily: fonts.semi, color: '#D7BDC0', fontSize: 12.5 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontFamily: fonts.bold, color: colors.goldLight, fontSize: 12.5, marginTop: spacing.md },

  ctaWrap: { borderRadius: 999, shadowColor: '#FF3B4F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
  ctaEdge: { borderRadius: 999, padding: 1.5 },
  cta: { borderRadius: 999, height: 54, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ctaGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: 26 },
  ctaShine: { position: 'absolute', top: -4, bottom: -4, width: 56 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaText: { fontFamily: fonts.black, fontSize: 16.5, letterSpacing: 1.1, color: '#FFFFFF', textShadowColor: 'rgba(80,0,10,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.lg, paddingVertical: 4 },
  switchText: { fontFamily: fonts.semi, fontSize: 13, color: '#CBB4B8' },
  switchLink: { fontFamily: fonts.extra, fontSize: 13.5, color: colors.goldLight },

  trust: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: spacing.xl },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trustText: { fontFamily: fonts.semi, fontSize: 11, color: '#B79A9E' },
});
