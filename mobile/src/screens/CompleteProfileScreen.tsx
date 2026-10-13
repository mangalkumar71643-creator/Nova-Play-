import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import { useAuth } from '../state/AuthContext';
import { colors, radius, spacing, typography } from '../theme';

function calculateAge(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

// Shown once, right after OTP verification, for a phone number the backend
// has never seen before — it needs a name/DOB/country to create the real
// account and enforce the 18+ gambling age requirement server-side.
export default function CompleteProfileScreen() {
  const { completeProfile, pendingPhone, logout } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [country, setCountry] = useState('IN');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim() || !country.trim()) {
      Alert.alert('Missing details', 'Please fill in your name and country.');
      return;
    }
    const dob = new Date(Number(year), Number(month) - 1, Number(day));
    if (Number.isNaN(dob.getTime()) || String(year).length !== 4) {
      Alert.alert('Invalid date of birth', 'Please enter a valid date (DD / MM / YYYY).');
      return;
    }
    if (calculateAge(dob) < 18) {
      Alert.alert('Age restriction', 'You must be at least 18 years old to use NovaPlay for real-money play.');
      return;
    }

    setSubmitting(true);
    const error = await completeProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: dob.toISOString(),
      country: country.trim().toUpperCase(),
    });
    setSubmitting(false);
    if (error) Alert.alert('Could not create account', error);
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>One last step</Text>
        <Text style={styles.subtitle}>
          {pendingPhone ? `Setting up your account for +91 ${pendingPhone}` : 'Complete your profile'}
        </Text>
        <Text style={styles.notice}>You must be 18+ to create a real-money NovaPlay account.</Text>

        <TextInput style={styles.input} placeholder="First name" placeholderTextColor={colors.textMuted} value={firstName} onChangeText={setFirstName} />
        <TextInput style={styles.input} placeholder="Last name" placeholderTextColor={colors.textMuted} value={lastName} onChangeText={setLastName} />
        <TextInput
          style={styles.input}
          placeholder="Country code (e.g. IN)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          value={country}
          onChangeText={setCountry}
        />

        <Text style={styles.label}>Date of birth</Text>
        <View style={styles.dobRow}>
          <TextInput style={styles.dobInput} placeholder="DD" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={2} value={day} onChangeText={setDay} />
          <TextInput style={styles.dobInput} placeholder="MM" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={2} value={month} onChangeText={setMonth} />
          <TextInput style={[styles.dobInput, { flex: 1.4 }]} placeholder="YYYY" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={4} value={year} onChangeText={setYear} />
        </View>

        <PrimaryButton label={submitting ? 'Please wait…' : 'Create account'} onPress={handleSubmit} disabled={submitting} />

        <Text style={styles.backLink} onPress={logout}>
          Use a different number
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.textPrimary, fontSize: typography.xxl, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontSize: typography.sm, textAlign: 'center', marginTop: spacing.sm },
  notice: { color: colors.gold, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  label: { color: colors.textMuted, fontSize: typography.xs, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dobRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  dobInput: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    textAlign: 'center',
  },
  backLink: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.xl },
});
