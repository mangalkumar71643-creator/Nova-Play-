import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AVATARS } from '../data/avatars';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, radius, spacing, typography } from '../theme';
import CoinPill from './CoinPill';

type Props = {
  title?: string;
  coins?: number;
  showBack?: boolean;
  showCoins?: boolean;
  showNotifications?: boolean;
  showProfile?: boolean;
  hasUnreadNotifications?: boolean;
};

export default function AppHeader({
  title,
  coins,
  showBack,
  showCoins = true,
  showNotifications = true,
  showProfile = true,
  hasUnreadNotifications,
}: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { avatarId } = useAuth();

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {showBack ? (
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconButton}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.brand}>
            <MaterialCommunityIcons name="crown" size={18} color={colors.gold} />
            <Text style={styles.brandText}>NovaPlay</Text>
          </View>
        )}
      </View>

      <View style={styles.center}>
        {title ? <Text style={styles.title}>{title}</Text> : coins !== undefined && showCoins ? <CoinPill coins={coins} /> : null}
      </View>

      <View style={styles.right}>
        {showNotifications ? (
          <Pressable onPress={() => navigation.navigate('Notifications')} hitSlop={10} style={styles.iconButton}>
            <MaterialCommunityIcons name="bell-outline" size={20} color={colors.textPrimary} />
            {hasUnreadNotifications ? <View style={styles.dot} /> : null}
          </Pressable>
        ) : null}
        {showProfile ? (
          <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={10} style={styles.avatar}>
            <Image source={AVATARS[avatarId - 1]} style={styles.avatarImage} resizeMode="cover" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  left: { flex: 1, alignItems: 'flex-start' },
  center: { flex: 1.4, alignItems: 'center' },
  right: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  brandText: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.md, marginLeft: spacing.xs },
  title: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.lg },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.crimsonLight,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    borderWidth: 2,
    borderColor: colors.goldLight,
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
});
