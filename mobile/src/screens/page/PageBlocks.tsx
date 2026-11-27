import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../components/AppText';
import TapPressable from '../../components/TapPressable';
import { PromoTone } from '../../components/PromoButton';
import { colors, fonts, spacing, typography } from '../../theme';

/*
 * The blocks of the admin's own pages (Admin → Promotion Pages / Pages; customPageService.ts on the server) that are more than a
 * picture or a button: text, list, table, notice box, countdown, code with Copy, questions & answers, divider and space.
 * CustomPageScreen lays them out top to bottom; the panel's preview (admin.html, renderPagePreview) draws them the same way.
 */

export type TextColor = 'default' | 'gold' | 'white' | 'red' | 'green';
export type PageBackground = 'dark' | 'red' | 'blue' | 'purple' | 'green';

export type Block =
  | { type: 'image'; imageUrl: string; width: number; height: number; target: string | null }
  | { type: 'text'; text: string; style: 'heading' | 'body' | 'note'; align: 'left' | 'center'; color?: TextColor }
  | { type: 'button'; label: string; target: string; color?: PromoTone }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'table'; rows: string[][]; header: boolean }
  | { type: 'box'; title: string; text: string; color: PromoTone }
  | { type: 'countdown'; label: string; endsAt: string; endedText: string }
  | { type: 'code'; label: string; code: string }
  | { type: 'faq'; items: { q: string; a: string }[] }
  | { type: 'divider' }
  | { type: 'space'; size: 's' | 'm' | 'l' };

/** A page's background (dark is the app's own). */
export const BACKGROUNDS: Record<Exclude<PageBackground, 'dark'>, [string, string]> = {
  red: ['#4A0812', '#22040A'],
  blue: ['#0B1E4A', '#060E26'],
  purple: ['#2C0F55', '#130628'],
  green: ['#0B3A24', '#05180F'],
};

const TEXT_COLORS: Record<Exclude<TextColor, 'default'>, string> = {
  gold: '#FFD45E',
  white: '#FFFFFF',
  red: '#FF5A6A',
  green: '#4BE39A',
};

/** A notice box in each colour: its edge, its fill and its title. */
const BOX: Record<PromoTone, { edge: string; fill: string; title: string }> = {
  gold: { edge: '#F0B93D', fill: 'rgba(240,185,61,0.12)', title: '#FFD45E' },
  red: { edge: '#FF4D5E', fill: 'rgba(196,23,44,0.2)', title: '#FF7A88' },
  green: { edge: '#3ECF8E', fill: 'rgba(62,207,142,0.13)', title: '#5EE6A8' },
  blue: { edge: '#4DA3FF', fill: 'rgba(77,163,255,0.14)', title: '#8CC4FF' },
  purple: { edge: '#B36BFF', fill: 'rgba(179,107,255,0.15)', title: '#D2A8FF' },
};

const SIDE = spacing.lg;

export function TextBlock({ b }: { b: Extract<Block, { type: 'text' }> }) {
  const base =
    b.style === 'heading'
      ? { color: colors.gold, fontSize: typography.xl, fontFamily: fonts.black, paddingTop: spacing.lg, paddingBottom: spacing.xs }
      : b.style === 'note'
        ? { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 18, paddingVertical: spacing.xs }
        : { color: colors.textPrimary, fontSize: typography.md, lineHeight: 21, paddingVertical: spacing.sm };
  const color = b.color && b.color !== 'default' ? TEXT_COLORS[b.color] : undefined;
  return <Text style={[base, color ? { color } : null, { paddingHorizontal: SIDE, textAlign: b.align === 'center' ? 'center' : 'left' }]}>{b.text}</Text>;
}

export function ListBlock({ b }: { b: Extract<Block, { type: 'list' }> }) {
  return (
    <View style={{ paddingHorizontal: SIDE, paddingVertical: spacing.sm, gap: spacing.sm }}>
      {b.items.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          {b.ordered ? (
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 0 }}>
              <Text style={{ color: '#3A1A02', fontSize: 12, fontFamily: fonts.black }}>{i + 1}</Text>
            </View>
          ) : (
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold, marginTop: 7, marginHorizontal: 4 }} />
          )}
          <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typography.md, lineHeight: 21 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function TableBlock({ b }: { b: Extract<Block, { type: 'table' }> }) {
  const cols = b.rows[0]?.length ?? 1;
  const size = cols >= 5 ? 11.5 : cols >= 4 ? 12.5 : 13.5;
  return (
    <View style={{ marginHorizontal: SIDE, marginVertical: spacing.sm, borderRadius: 12, borderWidth: 1.2, borderColor: colors.borderStrong, overflow: 'hidden' }}>
      {b.rows.map((row, r) => {
        const head = b.header && r === 0;
        return (
          <View
            key={r}
            style={{
              flexDirection: 'row',
              backgroundColor: head ? 'rgba(240,185,61,0.2)' : r % 2 ? 'rgba(255,255,255,0.045)' : 'transparent',
              borderTopWidth: r === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            {row.map((cell, k) => (
              <View key={k} style={{ flex: 1, paddingVertical: 9, paddingHorizontal: 6, borderLeftWidth: k === 0 ? 0 : 1, borderLeftColor: colors.border, justifyContent: 'center' }}>
                <Text style={{ color: head ? colors.goldLight : colors.textPrimary, fontSize: size, fontFamily: head ? fonts.extra : fonts.semi, textAlign: 'center' }}>{cell}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function BoxBlock({ b }: { b: Extract<Block, { type: 'box' }> }) {
  const c = BOX[b.color] ?? BOX.gold;
  return (
    <View style={{ marginHorizontal: SIDE, marginVertical: spacing.sm, borderRadius: 14, borderWidth: 1.5, borderColor: c.edge, backgroundColor: c.fill, padding: spacing.md + 2 }}>
      {b.title ? <Text style={{ color: c.title, fontSize: typography.lg, fontFamily: fonts.black, marginBottom: spacing.xs }}>{b.title}</Text> : null}
      <Text style={{ color: colors.textPrimary, fontSize: typography.md - 0.5, lineHeight: 21 }}>{b.text}</Text>
    </View>
  );
}

function left(endsAt: string, now: number) {
  const end = Date.parse(endsAt);
  return Number.isFinite(end) ? Math.max(0, Math.floor((end - now) / 1000)) : 0;
}

export function CountdownBlock({ b }: { b: Extract<Block, { type: 'countdown' }> }) {
  const [now, setNow] = useState(() => Date.now());
  const secs = left(b.endsAt, now);
  useEffect(() => {
    if (secs <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [secs <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  if (secs <= 0) {
    return (
      <View style={{ marginHorizontal: SIDE, marginVertical: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border }}>
        <Text testID="countdown-ended" style={{ color: colors.textSecondary, fontSize: typography.md, fontFamily: fonts.bold, textAlign: 'center' }}>
          {b.endedText || 'This offer has ended.'}
        </Text>
      </View>
    );
  }
  const parts: [number, string][] = [
    [Math.floor(secs / 86400), 'DAYS'],
    [Math.floor((secs % 86400) / 3600), 'HRS'],
    [Math.floor((secs % 3600) / 60), 'MIN'],
    [secs % 60, 'SEC'],
  ];
  return (
    <View style={{ marginHorizontal: SIDE, marginVertical: spacing.sm, alignItems: 'center' }}>
      {b.label ? <Text style={{ color: colors.goldLight, fontSize: typography.md, fontFamily: fonts.extra, marginBottom: spacing.sm, textAlign: 'center' }}>{b.label}</Text> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }} testID="countdown">
        {parts.map(([n, unit]) => (
          <LinearGradient key={unit} colors={['#3B1720', '#1F0B0E']} style={{ width: 62, paddingVertical: 8, borderRadius: 12, borderWidth: 1.2, borderColor: colors.borderStrong, alignItems: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 24, fontFamily: fonts.black }}>{String(n).padStart(2, '0')}</Text>
            <Text style={{ color: colors.gold, fontSize: 10, fontFamily: fonts.extra, letterSpacing: 1 }}>{unit}</Text>
          </LinearGradient>
        ))}
      </View>
    </View>
  );
}

export function CodeBlock({ b, testID }: { b: Extract<Block, { type: 'code' }>; testID?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(b.code);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // the code stays on screen to type by hand
    }
  };
  return (
    <View style={{ marginHorizontal: SIDE, marginVertical: spacing.sm }}>
      {b.label ? <Text style={{ color: colors.textSecondary, fontSize: typography.sm, fontFamily: fonts.bold, marginBottom: 6 }}>{b.label}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.gold, backgroundColor: 'rgba(240,185,61,0.08)', paddingLeft: spacing.md, paddingRight: 6, paddingVertical: 6 }}>
        <Text selectable style={{ flex: 1, color: colors.goldLight, fontSize: 20, fontFamily: fonts.black, letterSpacing: 2 }} testID={testID ? `${testID}-text` : undefined}>
          {b.code}
        </Text>
        <TapPressable onPress={copy} accessibilityRole="button" accessibilityLabel={copied ? 'Copied' : 'Copy'} testID={testID}>
          <LinearGradient colors={copied ? ['#6EE7A8', '#1DB36B'] : ['#FFE9A8', '#F0B93D', '#B8862A']} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
            <MaterialCommunityIcons name={copied ? 'check' : 'content-copy'} size={15} color={copied ? '#05301A' : '#3A1A02'} />
            <Text style={{ color: copied ? '#05301A' : '#3A1A02', fontSize: 13, fontFamily: fonts.black }}>{copied ? 'COPIED' : 'COPY'}</Text>
          </LinearGradient>
        </TapPressable>
      </View>
    </View>
  );
}

export function FaqBlock({ b, testID }: { b: Extract<Block, { type: 'faq' }>; testID?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <View style={{ marginHorizontal: SIDE, marginVertical: spacing.sm, gap: spacing.sm }}>
      {b.items.map((x, i) => {
        const on = open === i;
        return (
          <View key={i} style={{ borderRadius: 12, borderWidth: 1, borderColor: on ? colors.borderStrong : colors.border, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
            <TapPressable onPress={() => setOpen(on ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: on }} testID={testID ? `${testID}-q${i}` : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm }}>
                <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typography.md, fontFamily: fonts.bold }}>{x.q}</Text>
                <MaterialCommunityIcons name={on ? 'chevron-up' : 'chevron-down'} size={22} color={colors.gold} />
              </View>
            </TapPressable>
            {on ? (
              <Text style={{ color: colors.textSecondary, fontSize: typography.md - 0.5, lineHeight: 21, paddingHorizontal: spacing.md, paddingBottom: spacing.md }} testID={testID ? `${testID}-a${i}` : undefined}>
                {x.a}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function DividerBlock() {
  return <LinearGradient colors={['rgba(240,185,61,0)', colors.gold, 'rgba(240,185,61,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1.5, marginVertical: spacing.lg, marginHorizontal: spacing.xxl }} />;
}

export function SpaceBlock({ b }: { b: Extract<Block, { type: 'space' }> }) {
  return <View style={{ height: b.size === 's' ? 8 : b.size === 'l' ? 40 : 20 }} />;
}
