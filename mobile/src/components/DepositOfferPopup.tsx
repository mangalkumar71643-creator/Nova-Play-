import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { DepositOffer, fetchDepositOffer } from '../api/backend';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, gradients, radius, spacing, typography } from '../theme';
import { homePopupsDone } from './HomePopups';

const HIDE_KEY = 'novaplay:depositOffer:hiddenDay:v1';
const ORDINALS = ['First', 'Second', 'Third'];
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
// Once per launch, like the image popups.
let shownThisLaunch = false;

/**
 * "Extra deposit bonus": the admin's Deposit Offer (slabs for the 1st, 2nd,
 * 3rd… deposit), opened after the launch's image popups. It starts on the
 * deposit the player makes next; deposits already made show what was
 * deposited on their bars. "Deposit" opens the Deposit screen with that
 * amount filled in. "No more reminders today" keeps it closed until tomorrow.
 */
export default function DepositOfferPopup() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isAuthenticated } = useAuth();
  const { height } = useWindowDimensions();
  const [offer, setOffer] = useState<DepositOffer | null>(null);
  const [tab, setTab] = useState(0);
  const [hideToday, setHideToday] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || shownThisLaunch) return;
    shownThisLaunch = true;
    let cancelled = false;
    (async () => {
      // After the image popups (or 20 s at most), never on top of them.
      await Promise.race([homePopupsDone, new Promise((r) => setTimeout(r, 20_000))]);
      if ((await AsyncStorage.getItem(HIDE_KEY).catch(() => null)) === today()) return;
      try {
        const o = await fetchDepositOffer();
        const current = o.stages[o.nextDeposit - 1];
        if (cancelled || !o.enabled || !current || current.tiers.length === 0) return;
        setTab(o.nextDeposit - 1);
        setOffer(o);
      } catch {
        // No popup if the server can't be reached.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (!offer) return null;

  const close = () => {
    if (hideToday) AsyncStorage.setItem(HIDE_KEY, today()).catch(() => {});
    setOffer(null);
  };
  const deposit = (amount?: number) => {
    close();
    navigation.navigate('Deposit', amount ? { amount } : undefined);
  };

  const currentIndex = offer.nextDeposit - 1;
  const stage = offer.stages[tab];
  const done = stage.deposited != null;
  const isCurrent = tab === currentIndex;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <View style={{ width: '100%', maxWidth: 420, maxHeight: height * 0.82, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong }}>
          <LinearGradient colors={gradients.crimsonButton} style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.lg, alignItems: 'center' }}>
            <Text style={{ color: colors.goldLight, fontWeight: '900', fontSize: typography.xl }}>Extra deposit bonus</Text>
            <Text style={{ color: colors.textPrimary, fontSize: typography.sm, marginTop: 4 }}>Each account can only receive rewards once</Text>
          </LinearGradient>

          {offer.stages.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: spacing.sm, gap: spacing.xs }}>
              {offer.stages.map((s, i) => {
                const on = i === tab;
                return (
                  <Pressable
                    key={s.number}
                    onPress={() => setTab(i)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: on ? colors.gold : colors.border,
                      backgroundColor: on ? colors.surfaceAlt : 'transparent',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {s.deposited != null ? <MaterialCommunityIcons name="check-circle" size={14} color={colors.positive} /> : null}
                    <Text style={{ color: on ? colors.gold : colors.textSecondary, fontWeight: '800', fontSize: typography.xs }}>{ordinal(s.number)} deposit</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
            {done ? (
              <Text style={{ color: colors.positive, fontSize: typography.sm, fontWeight: '700', marginTop: spacing.sm }}>
                You deposited {inr(stage.deposited!)} here{stage.bonus > 0 ? ` and got ${inr(stage.bonus)} bonus` : ''}.
              </Text>
            ) : !isCurrent ? (
              <Text style={{ color: colors.textMuted, fontSize: typography.sm, marginTop: spacing.sm }}>
                Opens after your {ordinal(stage.number - 1).toLowerCase()} deposit.
              </Text>
            ) : null}
            {stage.tiers.map((t) => {
              const value = stage.deposited ?? 0;
              const fill = Math.min(1, value / t.min);
              // The one row the deposit earned: the highest it reached.
              const reachedMin = Math.max(0, ...stage.tiers.filter((x) => value >= x.min).map((x) => x.min));
              const reached = done && t.min === reachedMin;
              return (
                <View key={t.min} style={{ paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typography.lg, fontWeight: '700' }}>
                      {ordinal(stage.number)} deposit <Text style={{ color: colors.crimsonLight }}>{t.min.toLocaleString('en-IN')}</Text>
                    </Text>
                    <Text style={{ color: colors.gold, fontSize: typography.lg, fontWeight: '900' }}>+ {inr(t.bonus)}</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sm, marginTop: 4, lineHeight: 19 }}>
                    Deposit {inr(t.min)} or more as your {ordinal(stage.number).toLowerCase()} deposit and receive {inr(t.bonus)} bonus.
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
                    <View style={{ flex: 1, height: 18, borderRadius: 9, backgroundColor: colors.surfaceAlt, overflow: 'hidden', justifyContent: 'center' }}>
                      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fill * 100}%`, backgroundColor: colors.gold }} />
                      <Text style={{ textAlign: 'center', color: colors.textPrimary, fontSize: typography.xs, fontWeight: '700' }}>
                        {Math.min(value, t.min).toLocaleString('en-IN')}/{t.min.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    {reached ? (
                      <View style={{ minWidth: 96, paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ color: colors.positive, fontWeight: '800' }}>Received ✓</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => deposit(t.min)}
                        disabled={!isCurrent}
                        style={{
                          minWidth: 96,
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: radius.sm,
                          borderWidth: 1.5,
                          borderColor: isCurrent ? colors.gold : colors.border,
                          alignItems: 'center',
                          opacity: isCurrent ? 1 : 0.45,
                        }}
                      >
                        <Text style={{ color: isCurrent ? colors.gold : colors.textMuted, fontWeight: '800' }}>{done ? 'Done' : 'Deposit'}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Pressable
              onPress={() => setHideToday((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: hideToday }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <MaterialCommunityIcons name={hideToday ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={22} color={hideToday ? colors.gold : colors.textMuted} />
              <Text style={{ color: colors.textSecondary, fontSize: typography.sm }}>No more reminders today</Text>
            </Pressable>
            <Pressable onPress={() => deposit(offer.stages[currentIndex]?.tiers[0]?.min)}>
              <LinearGradient colors={gradients.goldButton} style={{ borderRadius: 999, paddingVertical: 10, paddingHorizontal: 22 }}>
                <Text style={{ color: '#2A1300', fontWeight: '900', fontSize: typography.md }}>Deposit now</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          style={{ marginTop: spacing.md, width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}
        >
          <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}
