import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { AVATARS } from '../data/avatars';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, gradients, radius, shadow, spacing, typography } from '../theme';

const OTP_SEND_COOLDOWN_SECONDS = 30;

function comingSoon(label: string) {
  if (Platform.OS === 'web') {
    window.alert(`${label} — coming soon.`);
    return;
  }
  Alert.alert(label, 'Coming soon.');
}

function alertMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function maskPhone(phone: string | null) {
  if (!phone || phone.length < 7) return phone ?? '—';
  return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
}

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { phone, avatarId, setAvatarId, logout, hasLoginPassword, setLoginPassword, requestOtp, verifyIdentityOtp, otpSent, backendUser } = useAuth();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [securityVisible, setSecurityVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  // Derived from the account's own unique 5-digit uid (not the phone
  // number) so two players can never end up sharing the same display name.
  const playerName = backendUser?.uid ? `Player${backendUser.uid}` : 'Player';

  const [otpCode, setOtpCode] = useState('');
  const [sendCooldown, setSendCooldown] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (sendCooldown <= 0) return;
    const timer = setTimeout(() => setSendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [sendCooldown]);

  async function handleSendOtp() {
    if (sendCooldown > 0 || sendingOtp || !phone) return;
    setSendingOtp(true);
    const error = await requestOtp(phone);
    setSendingOtp(false);
    if (error) {
      alertMessage('Could not send code', error);
      return;
    }
    setSendCooldown(OTP_SEND_COOLDOWN_SECONDS);
  }

  function resetPasswordForm() {
    setOtpCode('');
    setSendCooldown(0);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  }

  async function handleCompletePassword() {
    if (!otpSent || otpCode.length !== 6) {
      alertMessage('Verification required', 'Please send and enter the correct verification code first.');
      return;
    }
    const verifyError = await verifyIdentityOtp(otpCode);
    if (verifyError) {
      alertMessage('Verification failed', verifyError);
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 32) {
      alertMessage('Invalid password', 'Password must be between 8 and 32 characters.');
      return;
    }
    if (confirmPassword !== newPassword) {
      alertMessage("Passwords don't match", 'Please re-enter the same password.');
      return;
    }
    await setLoginPassword(newPassword);
    resetPasswordForm();
    setPasswordModalVisible(false);
    alertMessage('Password updated', 'Your login password has been saved. You can now log in with your phone number and this password.');
  }

  return (
    <ScreenContainer backgroundImage={require('../../assets/profile-background.jpg')}>
      <View style={styles.titleRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.screenTitle}>Profile</Text>
        <View style={styles.backButton} />
      </View>

      <LinearGradient colors={gradients.balanceCard} style={styles.profilePanel}>
        <Pressable onPress={() => setPickerVisible(true)}>
          <View style={styles.avatarRing}>
            <Image source={AVATARS[avatarId - 1]} style={styles.avatar} />
            <View style={styles.editBadge}>
              <MaterialCommunityIcons name="pencil" size={14} color={colors.background} />
            </View>
          </View>
        </Pressable>
        <View style={styles.playerInfo}>
          <Text style={styles.playerName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {playerName}
          </Text>
          <Text style={styles.playerUid} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            UID: {backendUser?.uid ?? '—'}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.menu}>
        <MenuRow icon="bell-outline" label="Notifications" onPress={() => navigation.navigate('Notifications')} />
        <MenuRow icon="history" label="Balance records" onPress={() => navigation.navigate('BalanceRecords')} />
        <MenuRow icon="shield-account-outline" label="Account & Security" onPress={() => setSecurityVisible(true)} />
        <MenuRow icon="headset" label="Live Support" onPress={() => navigation.navigate('Help')} />
        <MenuRow icon="gift-outline" label="Gifts" onPress={() => navigation.navigate('MainTabs', { screen: 'Rewards' })} />
        <MenuRow icon="cog-outline" label="Settings" onPress={() => navigation.navigate('Settings')} />
        <MenuRow icon="logout" label="Logout" onPress={() => setLogoutVisible(true)} />
      </View>

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Choose Avatar</Text>
            <View style={styles.avatarGrid}>
              {AVATARS.map((source, index) => {
                const selected = avatarId === index + 1;
                return (
                  <Pressable
                    key={index}
                    onPress={() => {
                      setAvatarId(index + 1);
                      setPickerVisible(false);
                    }}
                    style={[styles.avatarOption, selected && styles.avatarOptionSelected]}
                  >
                    <Image source={source} style={styles.avatarOptionImage} />
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={logoutVisible} transparent animationType="fade" onRequestClose={() => setLogoutVisible(false)}>
        <View style={styles.modalBackdrop}>
          <LinearGradient colors={gradients.balanceCard} style={styles.warningCard}>
            <View style={styles.warningIconWrap}>
              <MaterialCommunityIcons name="alert" size={30} color={colors.background} />
            </View>
            <Text style={styles.warningTitle}>Warning</Text>
            <View style={styles.warningDivider} />
            <Text style={styles.warningMessage}>Are you sure you want to log out?</Text>
            <View style={styles.warningButtonRow}>
              <Pressable
                style={styles.warningButtonWrap}
                onPress={() => {
                  setLogoutVisible(false);
                  logout();
                }}
              >
                <LinearGradient colors={gradients.crimsonButton} style={styles.warningButton}>
                  <Text style={styles.warningButtonLabel}>Confirm</Text>
                </LinearGradient>
              </Pressable>
              <Pressable style={styles.warningButtonWrap} onPress={() => setLogoutVisible(false)}>
                <LinearGradient colors={gradients.crimsonButton} style={styles.warningButton}>
                  <Text style={styles.warningButtonLabel}>Cancel</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      <Modal visible={securityVisible} transparent animationType="fade" onRequestClose={() => setSecurityVisible(false)}>
        <View style={styles.caretModalOverlay}>
          <View style={styles.caretModalWrap}>
            <View style={styles.caretModalCaret} />
            <View style={styles.caretModalCard}>
              <View style={styles.caretModalHeader}>
                <Text style={styles.caretModalTitle}>Account & Security</Text>
                <Pressable onPress={() => setSecurityVisible(false)} hitSlop={10}>
                  <MaterialCommunityIcons name="close" size={22} color={colors.gold} />
                </Pressable>
              </View>

              <View style={styles.securityRow}>
                <MaterialCommunityIcons name="cellphone" size={20} color={colors.gold} />
                <Text style={styles.securityRowLabel}>Bind phone no.</Text>
                <Text style={styles.securityRowValue}>{maskPhone(phone)}</Text>
              </View>

              <Pressable
                style={styles.securityRow}
                onPress={() => {
                  setSecurityVisible(false);
                  setPasswordModalVisible(true);
                }}
              >
                <MaterialCommunityIcons name="lock-outline" size={20} color={colors.gold} />
                <Text style={styles.securityRowLabel}>Login password</Text>
                {hasLoginPassword ? <Text style={styles.securityRowValue}>Set</Text> : null}
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.crimsonLight} />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          resetPasswordForm();
          setPasswordModalVisible(false);
        }}
      >
        <View style={styles.caretModalOverlay}>
          <View style={styles.caretModalWrap}>
            <View style={styles.caretModalCaret} />
            <View style={styles.caretModalCard}>
              <View style={styles.caretModalHeader}>
                <Text style={styles.caretModalTitle}>Set Login Password</Text>
                <Pressable
                  onPress={() => {
                    resetPasswordForm();
                    setPasswordModalVisible(false);
                  }}
                  hitSlop={10}
                >
                  <MaterialCommunityIcons name="close" size={22} color={colors.gold} />
                </Pressable>
              </View>

              <View style={styles.passwordPhoneRow}>
                <MaterialCommunityIcons name="cellphone" size={20} color={colors.gold} />
                <Text style={styles.passwordPhoneCode}>+91</Text>
                <View style={styles.passwordPhoneDivider} />
                <Text style={styles.passwordPhoneValue}>{maskPhone(phone)}</Text>
              </View>

              <View style={styles.passwordFieldRow}>
                <MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.gold} />
                <TextInput
                  value={otpCode}
                  onChangeText={(t) => setOtpCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="Enter the received verification code."
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.passwordFieldInput}
                />
                <Pressable onPress={handleSendOtp} disabled={sendCooldown > 0 || sendingOtp} style={styles.sendButtonWrap}>
                  <LinearGradient colors={gradients.crimsonButton} style={[styles.sendButton, (sendCooldown > 0 || sendingOtp) && styles.sendButtonDisabled]}>
                    <Text style={styles.sendButtonText}>{sendingOtp ? '...' : sendCooldown > 0 ? `${sendCooldown}s` : otpSent ? 'Resend' : 'Send'}</Text>
                  </LinearGradient>
                </Pressable>
              </View>

              {otpSent ? (
                <View style={styles.demoBanner}>
                  <MaterialCommunityIcons name="information-outline" size={14} color={colors.gold} />
                  <Text style={styles.demoBannerText}>Code sent to +91 {maskPhone(phone)}</Text>
                </View>
              ) : null}

              <View style={styles.passwordFieldRow}>
                <MaterialCommunityIcons name="shield-key-outline" size={20} color={colors.gold} />
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter between 8 and 32 characters."
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showNewPassword}
                  maxLength={32}
                  style={styles.passwordFieldInput}
                />
                <Pressable onPress={() => setShowNewPassword((v) => !v)} hitSlop={10}>
                  <MaterialCommunityIcons name={showNewPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              <View style={styles.passwordFieldRow}>
                <MaterialCommunityIcons name="lock-outline" size={20} color={colors.gold} />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Please re-enter the updated password."
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showConfirmPassword}
                  maxLength={32}
                  style={styles.passwordFieldInput}
                />
                <Pressable onPress={() => setShowConfirmPassword((v) => !v)} hitSlop={10}>
                  <MaterialCommunityIcons name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              <Pressable onPress={handleCompletePassword} style={styles.completeButtonWrap}>
                <LinearGradient colors={gradients.crimsonButton} style={styles.completeButton}>
                  <Text style={styles.completeButtonText}>Complete</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <LinearGradient colors={gradients.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.menuRow}>
        <LinearGradient colors={gradients.goldButton} style={styles.iconBadge}>
          <MaterialCommunityIcons name={icon} size={24} color={colors.background} />
        </LinearGradient>
        <Text style={styles.menuLabel}>{label}</Text>
        <MaterialCommunityIcons name="chevron-right" size={26} color={colors.gold} style={{ marginLeft: 'auto' }} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: typography.xxl,
    fontWeight: '800',
    textAlign: 'center',
  },
  profilePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    gap: spacing.xl,
    ...shadow.glow,
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 90, height: 90, borderRadius: 45 },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerInfo: { flex: 1, minWidth: 0 },
  playerName: { color: colors.textPrimary, fontSize: typography.xl, fontWeight: '800' },
  playerUid: { color: colors.goldLight, fontSize: typography.md, marginTop: spacing.xs, fontWeight: '700' },
  menu: {
    marginHorizontal: spacing.lg,
    gap: spacing.md,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    ...shadow.card,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '700', marginLeft: spacing.lg },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    ...shadow.glow,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  avatarOption: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOptionSelected: { borderColor: colors.gold },
  avatarOptionImage: { width: '100%', height: '100%', borderRadius: radius.md },
  warningCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.gold,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.glow,
  },
  warningIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: colors.goldLight,
  },
  warningTitle: {
    color: colors.gold,
    fontSize: typography.xxl,
    fontWeight: '800',
  },
  warningDivider: {
    width: '80%',
    height: 1,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  warningMessage: {
    color: colors.textPrimary,
    fontSize: typography.md,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  warningButtonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  warningButtonWrap: { flex: 1 },
  warningButton: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.gold,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  warningButtonLabel: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '800' },

  caretModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    paddingTop: '28%',
  },
  caretModalWrap: { width: '88%' },
  caretModalCaret: {
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.borderStrong,
  },
  caretModalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
  },
  caretModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  caretModalTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  securityRowLabel: { flex: 1, color: colors.textPrimary, fontSize: typography.md, fontWeight: '700' },
  securityRowValue: { color: colors.textSecondary, fontSize: typography.md },
  passwordPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
  },
  passwordPhoneCode: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '700' },
  passwordPhoneDivider: { width: 1, height: 20, backgroundColor: colors.border },
  passwordPhoneValue: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '700' },
  passwordFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  passwordFieldInput: { flex: 1, color: colors.textPrimary, fontSize: typography.sm, paddingVertical: spacing.md },
  sendButtonWrap: {},
  sendButton: { borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sendButtonDisabled: { opacity: 0.6 },
  sendButtonText: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '800' },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  demoBannerText: { color: colors.gold, fontSize: typography.xs, fontWeight: '700', marginLeft: spacing.xs },
  completeButtonWrap: {},
  completeButton: { borderRadius: radius.pill, paddingVertical: spacing.lg, alignItems: 'center' },
  completeButtonText: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800' },
});
