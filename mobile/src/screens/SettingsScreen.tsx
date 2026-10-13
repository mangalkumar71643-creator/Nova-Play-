import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import AmountInputModal from '../components/AmountInputModal';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import SectionHeader from '../components/SectionHeader';
import { IconName } from '../data/models';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';
import { useAuth } from '../state/AuthContext';
import { ApiClientError } from '../api/client';
import { fetchFairnessStatus, rotateFairnessSeed } from '../api/backend';

function truncateHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

const KYC_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not started',
  PENDING: 'Pending review',
  APPROVED: 'Verified',
  REJECTED: 'Rejected — resubmit',
};

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { phone, logout, backendUser, submitKyc, setDepositLimits, selfExclude } = useAuth();
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(true);
  const [vibration, setVibration] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [kycBusy, setKycBusy] = useState(false);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [limitBusy, setLimitBusy] = useState(false);
  const [seedHash, setSeedHash] = useState<string | null>(null);
  const [clientSeed, setClientSeed] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    fetchFairnessStatus()
      .then((status) => {
        setSeedHash(status.serverSeedHash);
        setClientSeed(status.clientSeed);
      })
      .catch(() => {});
  }, []);

  async function handleRotateSeed() {
    setRotating(true);
    try {
      const result = await rotateFairnessSeed();
      setSeedHash(result.newServerSeedHash);
      Alert.alert(
        'Seed rotated',
        `Your previous server seed is now revealed:\n\n${result.revealedServerSeed}\n\nYou can hash it yourself (SHA-256) and confirm it matches the hash shown before rotation.`
      );
    } catch (err) {
      Alert.alert('Failed', err instanceof ApiClientError ? err.message : 'Could not rotate seed.');
    } finally {
      setRotating(false);
    }
  }

  async function handleSubmitKyc() {
    setKycBusy(true);
    const error = await submitKyc();
    setKycBusy(false);
    if (error) Alert.alert('KYC failed', error);
    else Alert.alert('KYC submitted', 'Your identity verification has been submitted.');
  }

  async function handleSetLimit(amount: number) {
    setLimitBusy(true);
    const error = await setDepositLimits({ depositLimitDaily: amount });
    setLimitBusy(false);
    if (error) {
      Alert.alert('Failed', error);
    } else {
      setLimitModalOpen(false);
      Alert.alert('Limit set', `Daily deposit limit set to ${amount} Coins.`);
    }
  }

  function handleSelfExclude() {
    const confirm = async () => {
      const error = await selfExclude(30);
      if (error) Alert.alert('Failed', error);
      else Alert.alert('Self-exclusion active', 'Deposits and betting are now blocked for 30 days.');
    };
    if (Platform.OS === 'web') {
      if (window.confirm('This blocks betting and deposits for 30 days and cannot be undone early. Continue?')) confirm();
      return;
    }
    Alert.alert(
      'Confirm self-exclusion',
      'This blocks betting and deposits for 30 days and cannot be undone early. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Self-exclude', style: 'destructive', onPress: confirm },
      ]
    );
  }

  function handleLogout() {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) logout();
      return;
    }
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <ScreenContainer>
      <AppHeader showBack title="Settings" showCoins={false} showNotifications={false} showProfile={false} />

      <SectionHeader title="Preferences" />
      <View style={styles.card}>
        <ToggleRow icon="volume-high" label="Sound Effects" value={sound} onChange={setSound} />
        <ToggleRow icon="music-note-outline" label="Music" value={music} onChange={setMusic} />
        <ToggleRow icon="vibrate" label="Vibration" value={vibration} onChange={setVibration} />
        <ToggleRow icon="bell-ring-outline" label="Notifications" value={notificationsEnabled} onChange={setNotificationsEnabled} last />
      </View>

      <SectionHeader title="Display" />
      <View style={styles.card}>
        <InfoRow icon="translate" label="Language" value="English" />
        <InfoRow icon="theme-light-dark" label="Theme" value="Dark" last />
      </View>

      <SectionHeader title="Account" />
      <View style={styles.card}>
        {backendUser?.uid ? <InfoRow icon="identifier" label="User ID" value={String(backendUser.uid)} /> : null}
        {phone ? <InfoRow icon="cellphone" label="Mobile Number" value={`+91 ${phone}`} /> : null}
        <NavRow icon="account-circle-outline" label="Account" onPress={() => navigation.navigate('Profile')} />
        <NavRow icon="shield-lock-outline" label="Privacy" onPress={() => Alert.alert('Privacy', 'Privacy policy coming soon.')} />
        <NavRow
          icon="file-document-outline"
          label="Terms of Service"
          onPress={() => Alert.alert('Terms of Service', 'Terms of service coming soon.')}
        />
        <NavRow icon="help-circle-outline" label="Help" onPress={() => navigation.navigate('Help')} last />
      </View>

      <SectionHeader title="Identity & Responsible Gambling" />
      <View style={styles.card}>
        <InfoRow
          icon="shield-check-outline"
          label="KYC Status"
          value={backendUser ? KYC_LABELS[backendUser.kycStatus] ?? backendUser.kycStatus : '—'}
        />
        {backendUser?.kycStatus !== 'APPROVED' ? (
          <NavRow icon="card-account-details-outline" label={kycBusy ? 'Submitting…' : 'Verify Identity (KYC)'} onPress={handleSubmitKyc} />
        ) : null}
        <NavRow icon="cash-lock" label="Set Daily Deposit Limit" onPress={() => setLimitModalOpen(true)} />
        <NavRow icon="account-cancel-outline" label="Self-Exclude (30 days)" onPress={handleSelfExclude} last />
      </View>

      <SectionHeader title="Provably Fair" />
      <View style={styles.card}>
        {seedHash ? <InfoRow icon="lock-check-outline" label="Active seed hash" value={truncateHash(seedHash)} /> : null}
        {clientSeed ? <InfoRow icon="key-outline" label="Client seed" value={clientSeed} /> : null}
        <NavRow
          icon="refresh"
          label={rotating ? 'Rotating…' : 'Rotate & Verify Seed'}
          onPress={handleRotateSeed}
          last
        />
      </View>
      <Text style={styles.fairnessExplainer}>
        Every game round is computed from this seed pair via HMAC-SHA256 — rotating reveals the old
        seed so you can independently confirm past rounds weren't tampered with. This proves the
        process is fair; it is not the same as accredited RNG certification.
      </Text>

      <Pressable onPress={handleLogout} style={styles.logoutButton}>
        <MaterialCommunityIcons name="logout" size={18} color={colors.negative} />
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>

      <Text style={styles.footerNote}>
        NovaPlay is an 18+ real-money gaming app. Coins are backed 1:1 by real money — please gamble
        responsibly and only stake what you can afford to lose.
      </Text>
      <Text style={styles.version}>Version 1.0.0</Text>

      <AmountInputModal
        visible={limitModalOpen}
        title="Daily Deposit Limit"
        confirmLabel="Set Limit"
        helperText="You can lower this any time; raising it may be delayed by responsible-gambling rules."
        busy={limitBusy}
        onConfirm={handleSetLimit}
        onClose={() => setLimitModalOpen(false)}
      />
    </ScreenContainer>
  );
}

function ToggleRow({
  icon,
  label,
  value,
  onChange,
  last,
}: {
  icon: IconName;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <MaterialCommunityIcons name={icon} size={19} color={colors.gold} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceAlt, true: colors.goldDark }}
        thumbColor={value ? colors.gold : colors.textMuted}
        style={styles.switch}
      />
    </View>
  );
}

function InfoRow({ icon, label, value, last }: { icon: IconName; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <MaterialCommunityIcons name={icon} size={19} color={colors.gold} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function NavRow({ icon, label, onPress, last }: { icon: IconName; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, last && styles.rowLast]}>
      <MaterialCommunityIcons name={icon} size={19} color={colors.gold} />
      <Text style={styles.rowLabel}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '600', marginLeft: spacing.md, flex: 1 },
  rowValue: { color: colors.textMuted, fontSize: typography.sm },
  switch: { marginLeft: spacing.sm },
  chevron: { marginLeft: 'auto' },
  footerNote: {
    color: colors.textMuted,
    fontSize: typography.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xl,
    lineHeight: 16,
  },
  version: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.sm },
  fairnessExplainer: {
    color: colors.textMuted,
    fontSize: typography.xs,
    lineHeight: 16,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.negative,
  },
  logoutText: { color: colors.negative, fontWeight: '700', fontSize: typography.sm, marginLeft: spacing.sm },
});
