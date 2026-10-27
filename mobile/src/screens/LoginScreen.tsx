import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { showAlert } from '../components/AppAlert';
import GameShineOverlay from '../components/GameShineOverlay';
import { AuthStackParamList } from '../navigation/types';
import { colors } from '../theme';
import { useAuth } from '../state/AuthContext';

// The background is the exact reference screenshot the user supplied — every
// field/button below is an invisible, real, functional control positioned on
// top of it (as a % of the image's own 1024x1536 canvas), not a redraw.
const IMAGE_WIDTH = 1024;
const IMAGE_HEIGHT = 1536;
const pctX = (px: number) => px / IMAGE_WIDTH;
const pctY = (px: number) => px / IMAGE_HEIGHT;

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { quickLogin, verifyOtp, otpSent, loginWithPassword } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loginMode, setLoginMode] = useState<'otp' | 'password'>('otp');
  const [layoutWidth, setLayoutWidth] = useState(0);

  // Same rule as the server (backend/src/utils/phone.ts): a 10-digit Indian mobile starting 6-9, not 9999999999 and the like.
  const digits = phone.trim();
  const isValid = /^[6-9]\d{9}$/.test(digits) && new Set(digits).size > 2;

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  function handleImageWrapLayout(e: LayoutChangeEvent) {
    setLayoutWidth(e.nativeEvent.layout.width);
  }

  function selectLoginMode(mode: 'otp' | 'password') {
    setLoginMode(mode);
    if (mode === 'otp') setPassword('');
    else {
      setOtpCode('');
      setResendCooldown(0);
    }
  }

  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // A friend's invite code (agent program): asked here, as sign-up has no other step.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const invite = inviteCode.trim() || undefined;

  async function sendOtpInline() {
    if (resendCooldown > 0 || sendingOtp) return;
    setLoginMode('otp');
    if (!isValid) {
      showAlert('Enter your number', 'Please enter your own 10-digit mobile number. The login code is sent to it by SMS.');
      return;
    }
    setSendingOtp(true);
    const error = await quickLogin(digits, invite);
    setSendingOtp(false);
    if (error) {
      showAlert('Could not send code', error);
      return;
    }
    setOtpCode('');
    setResendCooldown(30);
  }

  async function handleSubmit() {
    if (verifying) return;
    if (loginMode === 'password') {
      if (!isValid) {
        showAlert('Enter your number', 'Please enter a valid 10-digit mobile number first.');
        return;
      }
      if (!password.trim()) {
        showAlert('Enter your password', 'Please enter your password, or switch to Verification Login.');
        return;
      }
      const ok = await loginWithPassword(phone.trim(), password.trim());
      if (!ok) {
        showAlert('Login failed', 'Incorrect password, or no password set for this number yet. Switch to Verification Login to sign in with OTP instead.');
      }
      return;
    }
    if (otpSent && otpCode.length === 6) {
      setVerifying(true);
      const error = await verifyOtp(otpCode, invite);
      setVerifying(false);
      if (error) {
        showAlert('Incorrect code', error);
      }
      return;
    }
    if (!otpSent) {
      if (!isValid) {
        showAlert('Enter your number', 'Please enter your own 10-digit mobile number. The login code is sent to it by SMS.');
        return;
      }
      setVerifying(true);
      const error = await quickLogin(digits, invite);
      setVerifying(false);
      if (error) {
        showAlert('Login failed', error);
      }
      return;
    }
    showAlert('Enter the code', 'Please enter the 6-digit code sent to your number.');
  }

  function comingSoon(label: string) {
    showAlert(label, 'Coming soon — use your mobile number + OTP to sign in for now.');
  }

  return (
    <View style={styles.fill}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView nestedScrollEnabled contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.imageWrap} onLayout={handleImageWrapLayout}>
            <Image source={require('../../assets/login-screen.webp')} style={styles.image} resizeMode="contain" />

            <GameShineOverlay width={layoutWidth} height={layoutWidth * (IMAGE_HEIGHT / IMAGE_WIDTH)} />

            {/* Phone Login tab (already the active state in the image) */}
            <Pressable style={[styles.overlay, box(95, 565, 415, 80)]} />
            {/* Email Login tab */}
            <Pressable style={[styles.overlay, box(525, 565, 410, 80)]} onPress={() => comingSoon('Email Login')} />

            {/* Mobile number field */}
            <View style={[styles.inputPatch, box(200, 695, 730, 68)]}>
              <TextInput
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 10))}
                placeholder="Enter Mobile Number"
                placeholderTextColor="#8f7b7e"
                keyboardType="number-pad"
                maxLength={10}
                style={styles.input}
              />
            </View>

            {/* Icon badge to the left of the second field — swaps lock/shield to match the mode */}
            <View style={[styles.iconBadge, box(95, 783, 100, 116)]}>
              <MaterialCommunityIcons
                name={loginMode === 'otp' ? 'shield-check' : 'lock'}
                size={34}
                color="#F0B93D"
              />
            </View>

            {/* Second field — OTP entry in Verification mode, password in Password mode */}
            <View style={[styles.inputPatch, styles.passwordPatch, box(200, 793, 715, 96)]}>
              {loginMode === 'otp' ? (
                <>
                  <TextInput
                    value={otpCode}
                    onChangeText={(t) => setOtpCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder="Enter OTP"
                    placeholderTextColor="#8f7b7e"
                    keyboardType="number-pad"
                    maxLength={6}
                    style={[styles.input, styles.passwordInput]}
                  />
                  <Pressable onPress={sendOtpInline} disabled={resendCooldown > 0 || sendingOtp} hitSlop={8}>
                    <Text style={styles.sendText}>
                      {sendingOtp ? '...' : resendCooldown > 0 ? `${resendCooldown}s` : otpSent ? 'Resend' : 'Send'}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter Password"
                    placeholderTextColor="#8f7b7e"
                    secureTextEntry={!showPassword}
                    style={[styles.input, styles.passwordInput]}
                  />
                  <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
                    <MaterialCommunityIcons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={22} color="#c9a15a" />
                  </Pressable>
                </>
              )}
            </View>

            {/* Forgot password link */}
            <Pressable
              style={[styles.overlay, box(560, 950, 370, 30)]}
              onPress={() => comingSoon('Forgot Password')}
            />

            {/* LOGIN button -> sends demo OTP and moves to verification */}
            <Pressable style={[styles.overlay, box(95, 1010, 840, 95)]} onPress={handleSubmit} />

            {/* OTP quick icon (Google/Facebook removed — not used) — switches to Verification mode and sends the code inline */}
            <Pressable style={[styles.overlay, styles.round, box(449, 1200, 120, 120)]} onPress={sendOtpInline} />

            {/* Verification (OTP) vs Password login mode toggle */}
            <View style={[styles.overlay, styles.modeToggleRow, box(95, 1405, 830, 50)]}>
              <Pressable style={styles.modeToggleOption} onPress={() => selectLoginMode('otp')}>
                <Text style={[styles.modeToggleText, loginMode === 'otp' && styles.modeToggleTextActive]}>
                  Verification Login
                </Text>
              </Pressable>
              <View style={styles.modeToggleDivider} />
              <Pressable style={styles.modeToggleOption} onPress={() => selectLoginMode('password')}>
                <Text style={[styles.modeToggleText, loginMode === 'password' && styles.modeToggleTextActive]}>
                  Password Login
                </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.inviteWrap}>
            {inviteOpen ? (
              <TextInput
                value={inviteCode}
                onChangeText={(t) => setInviteCode(t.replace(/[^0-9]/g, '').slice(0, 12))}
                keyboardType="number-pad"
                placeholder="Friend's invite code (optional)"
                placeholderTextColor="#8f7b7e"
                style={styles.inviteInput}
                autoFocus
              />
            ) : (
              <Pressable onPress={() => setInviteOpen(true)} hitSlop={8}>
                <Text style={styles.inviteLink}>Have an invite code? Tap to add it</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
        <Text style={styles.ageGateNote}>18+ only. NovaPlay is a real-money game — please play responsibly.</Text>
      </KeyboardAvoidingView>
    </View>
  );
}

function box(left: number, top: number, width: number, height: number) {
  return {
    left: `${pctX(left) * 100}%` as const,
    top: `${pctY(top) * 100}%` as const,
    width: `${pctX(width) * 100}%` as const,
    height: `${pctY(height) * 100}%` as const,
  };
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center' },
  inviteWrap: { paddingHorizontal: 28, paddingTop: 10, alignItems: 'center' },
  inviteLink: { color: '#f0b93d', fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  inviteInput: {
    alignSelf: 'stretch',
    color: '#f3e7c9',
    fontSize: 16,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,185,61,0.45)',
    backgroundColor: '#1c0d10',
    borderRadius: 12,
    paddingVertical: 10,
  },
  ageGateNote: {
    color: '#8f7b7e',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: IMAGE_WIDTH / IMAGE_HEIGHT,
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  overlay: { position: 'absolute' },
  round: { borderRadius: 999 },
  inputPatch: {
    position: 'absolute',
    backgroundColor: '#1c0d10',
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  input: { color: '#f3e7c9', fontSize: 19, paddingVertical: 0 },
  passwordPatch: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  passwordInput: { flex: 1, marginRight: 8 },
  modeToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  modeToggleOption: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  modeToggleDivider: { width: 1, height: '50%', backgroundColor: 'rgba(240,185,61,0.35)' },
  modeToggleText: { color: '#8f7b7e', fontSize: 15, fontWeight: '700' },
  modeToggleTextActive: { color: '#f0b93d' },
  iconBadge: {
    position: 'absolute',
    backgroundColor: '#4a1710',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#F0B93D', fontSize: 15, fontWeight: '800' },
});
