import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { API_BASE_URL } from '../api/client';
import { colors, gradients, radius, spacing, typography } from '../theme';

/** "1.0.3" < "1.1.0" — plain dotted-number compare, missing parts count as 0. */
function isOlderVersion(current: string, latest: string): boolean {
  const a = current.split('.').map((n) => parseInt(n, 10) || 0);
  const b = latest.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

/**
 * Once per app start: asks the backend for the latest released version
 * (set from the admin panel's Home Slider → App download link card) and,
 * if this install is older, shows an update reminder with a download
 * button. Never blocks the app when the server can't be reached.
 */
export default function AppUpdateCheck() {
  const [update, setUpdate] = useState<{ latestVersion: string; downloadUrl: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/popups/app-version`);
        if (!res.ok) return;
        const data = await res.json();
        const current = Constants.expoConfig?.version ?? '0.0.0';
        if (data?.latestVersion && isOlderVersion(current, String(data.latestVersion))) {
          setUpdate({ latestVersion: String(data.latestVersion), downloadUrl: data.downloadUrl ?? null });
        }
      } catch {
        // Offline / old server without this route — carry on without a nudge.
      }
    })();
  }, []);

  if (!update) return null;

  return (
    <Modal transparent animationType="fade" visible testID="app-update-modal">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="rocket-launch" size={40} color={colors.gold} />
          </View>
          <Text style={styles.title}>New version available</Text>
          <Text style={styles.text}>
            NovaPlay {update.latestVersion} is out. Update for the latest games, fixes and improvements.
          </Text>
          {update.downloadUrl ? (
            <Pressable
              onPress={() => Linking.openURL(update.downloadUrl!)}
              testID="app-update-download-button"
              style={styles.downloadOuter}
            >
              <LinearGradient colors={gradients.crimsonButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.downloadButton}>
                <MaterialCommunityIcons name="download" size={18} color={colors.textPrimary} />
                <Text style={styles.downloadText}>Download update</Text>
              </LinearGradient>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setUpdate(null)} testID="app-update-later-button" style={styles.laterButton}>
            <Text style={styles.laterText}>Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800', marginBottom: spacing.sm },
  text: { color: colors.textSecondary, fontSize: typography.sm, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  downloadOuter: { alignSelf: 'stretch', marginBottom: spacing.sm },
  downloadButton: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  downloadText: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.md },
  laterButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  laterText: { color: colors.textMuted, fontSize: typography.sm, fontWeight: '700' },
});
