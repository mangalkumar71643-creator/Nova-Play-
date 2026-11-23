import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Share, StyleSheet, Vibration, View } from 'react-native';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';
import { ClubActionKind, ClubHandPlayer, ClubLogEntry, ClubTable } from '../../api/backend';
import { Text } from '../../components/AppText';
import TapPressable from '../../components/TapPressable';
import { ClubCard } from '../../components/club/ClubCards';
import { ActionButton, Avatar, ChipPile, FlyingChip, GOLD, Tag, money, shortMoney, toneFor } from '../../components/club/ClubUi';
import type { PlayOptions } from '../../sound/engine';
import type { SoundEvent } from '../../sound/types';
import { playChipBet } from '../../sound/ui';

const NOISE = require('../../../assets/teenpatticlub/felt-noise.webp');
const EMBLEM = require('../../../assets/teenpatticlub/emblem.webp');

/*
 * The table of Teen Patti Club. Everything the screen shows comes from the server's view of the table (ClubTable): who sits where,
 * what they have put in, whose turn it is and for how long, and only the cards this player may see. The server's clock is used for
 * every countdown. New events in the hand's log (a chaal, a pack, a side show ...) are turned into the sounds, the chips flying to
 * the pot and the short message under the pot; a log that was already there when the table opened is not replayed.
 */

export type Play = (ev: SoundEvent, opts?: PlayOptions) => void;

type Flight = { id: number; x0: number; y0: number; x1: number; y1: number; delay: number };
type Toast = { key: number; text: string; tone: 'info' | 'good' | 'bad' };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const short = (name: string, n = 14) => (name.length > n ? `${name.slice(0, n - 1)}…` : name);
const ringColorFor = (secs: number) => (secs > 8 ? '#37D67A' : secs > 4 ? '#FFB020' : '#FF4D4D');

/** A card (or a row of them) arriving from the middle of the table when a hand is dealt. */
const Dealt = memo(function Dealt({ dealKey, delay, dx, dy, children }: { dealKey: number; delay: number; dx: number; dy: number; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  const seen = useRef(dealKey);
  useEffect(() => {
    if (dealKey === 0 || dealKey === seen.current) return;
    seen.current = dealKey;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 380, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [dealKey, delay, v]);
  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
});

function FlightChip({ f, size, onDone }: { f: Flight; size: number; onDone: (id: number) => void }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 520, delay: f.delay, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(() => onDone(f.id));
  }, [f, onDone, v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: f.x0 - size / 2,
        top: f.y0 - size / 2,
        opacity: v.interpolate({ inputRange: [0, 0.05, 0.9, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, f.x1 - f.x0] }) },
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, f.y1 - f.y0] }) },
          { scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1.15, 0.8] }) },
        ],
      }}
    >
      <FlyingChip size={size} />
    </Animated.View>
  );
}

/** Gold coins thrown up from the result card when this player wins the pot. */
function WinBurst({ size }: { size: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  const dots = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2 + (i % 2) * 0.16;
        const d = size * (0.5 + 0.5 * (((i * 7) % 5) / 5));
        return { dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7 - size * 0.25, r: 5 + (i % 3) * 2.5, c: i % 3 === 0 ? '#FFFFFF' : i % 3 === 1 ? '#FFE08A' : '#F2C45A' };
      }),
    [size]
  );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 0, height: 0 }}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: d.r * 2,
            height: d.r * 2,
            borderRadius: d.r,
            left: -d.r,
            top: -d.r,
            backgroundColor: d.c,
            opacity: v.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 0.9, 0] }),
            transform: [
              { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, d.dx] }) },
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, d.dy + size * 0.55] }) },
              { scale: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.3, 1.2, 0.7] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

/** The table itself: a wooden rail with a gold line, green felt with a faint weave, and the club's emblem in the middle. */
const Felt = memo(function Felt({ w, h }: { w: number; h: number }) {
  const r = w * 0.46;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 6, right: 6, top: 2, bottom: 2 }}>
      <LinearGradient colors={['#5C3318', '#2D1709', '#4A2A12']} style={[StyleSheet.absoluteFill, { borderRadius: r + 6, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 }]} />
      <View style={{ position: 'absolute', left: 8, right: 8, top: 8, bottom: 8, borderRadius: r, borderWidth: 2, borderColor: '#E3B552', overflow: 'hidden' }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="felt" cx="50%" cy="40%" r="72%">
              <Stop offset="0" stopColor="#17895F" />
              <Stop offset="0.55" stopColor="#0C5D42" />
              <Stop offset="1" stopColor="#053524" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={w} height={h} fill="url(#felt)" />
        </Svg>
        <Image source={NOISE} resizeMode="stretch" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity: 0.5 }} fadeDuration={0} />
        <Image source={EMBLEM} resizeMode="contain" style={{ position: 'absolute', left: w * 0.5 - w * 0.27 - 14, top: h * 0.5 - w * 0.27, width: w * 0.54, height: w * 0.54, opacity: 0.1 }} fadeDuration={0} />
        <View style={{ position: 'absolute', left: 10, right: 10, top: 10, bottom: 10, borderRadius: r - 10, borderWidth: 1, borderColor: 'rgba(242,196,90,0.28)' }} />
      </View>
    </View>
  );
});

export default function ClubTableView({
  table,
  serverNow,
  busy,
  onAct,
  onStart,
  onLeave,
  play,
}: {
  table: ClubTable;
  serverNow: () => number;
  busy: boolean;
  onAct: (kind: ClubActionKind) => Promise<string | null>;
  onStart: () => void;
  onLeave: () => void;
  play: Play;
}) {
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [, setTick] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [dealKey, setDealKey] = useState(0);
  const [confirmPack, setConfirmPack] = useState(false);
  const progress = useRef(new Animated.Value(1)).current;
  const toastFade = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const packTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flightId = useRef(1);
  const lastSeq = useRef(-1);
  const lastHandNo = useRef<number | null>(null);
  const lastTurnKey = useRef('');
  const lastTickSecond = useRef(-1);
  const lastResultNo = useRef<number | null>(null);
  const firstLook = useRef(true);

  const hand = table.hand;
  const me = table.you;
  const n = table.seats;
  const myP: ClubHandPlayer | undefined = hand?.players.find((p) => p.seat === me && !p.left);
  const live = !!hand && !hand.over && table.phase === 'PLAYING';
  const actions = hand?.you?.actions ?? null;
  const myTurn = live && !!hand && hand.turnSeat === me && !hand.sideShow;
  const asked = live && !!hand?.sideShow && hand.sideShow.toSeat === me;
  const asking = live && !!hand?.sideShow && hand.sideShow.fromSeat === me;
  const turnSeconds = table.turnSeconds;

  // ---- layout
  const k = area.w > 0 ? clamp(Math.min(area.h / 560, area.w / 400), 0.7, 1.12) : 1;
  const A = Math.round(56 * k); // an opponent's portrait
  const myA = Math.round(50 * k);
  const cw = Math.round(clamp(area.h * 0.15, 62, 104)); // my cards
  const mw = Math.round(clamp(area.w * 0.085, 27, 38)); // an opponent's cards
  const rowH = Math.round(56 * k);
  const cardsTop = area.h - rowH - cw * 1.4 - 12 * k;
  const rowTop = cardsTop + cw * 1.4 + 8 * k;
  // The opponents' block (portrait, name, tags, cards, hand name) ends here; the middle of the table starts below it.
  const oppBottom = area.h * 0.025 + Math.round(56 * k) + 4 + 16 + 22 + clamp(area.w * 0.085, 27, 38) * 1.4 + 22;
  const potTop = Math.max(area.h * 0.325, oppBottom + 6);
  const compact = cardsTop - potTop < 250;
  const slot = useCallback((seat: number) => (me === null ? seat : (seat - me + n) % n), [me, n]);
  const slotX = useCallback((s: number) => (n === 2 ? 0.5 : s === 1 ? 0.2 : 0.8) * area.w, [n, area.w]);
  const oppTop = area.h * 0.025;
  /** The centre of a seat's portrait, where its chips start from and the pot's chips arrive. */
  const anchor = useCallback(
    (seat: number) => {
      const s = slot(seat);
      if (s === 0) return { x: 10 + myA / 2, y: rowTop + rowH / 2 };
      return { x: slotX(s), y: oppTop + A / 2 };
    },
    [slot, slotX, rowTop, rowH, oppTop, A, myA]
  );
  const potCenter = { x: area.w / 2, y: potTop + 40 * k };
  const deckPos = { x: area.w / 2, y: potTop + 30 * k };

  // ---- the clock
  const remainingMs = useCallback(
    (to: number) => Math.max(0, to - serverNow()),
    [serverNow]
  );
  useEffect(() => {
    const running = table.phase !== 'WAITING';
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [table.phase]);

  // The ring around whoever must move runs down in step with the server's deadline.
  const deadline = hand && !hand.over ? (hand.sideShow ? hand.sideShow.endsAt : hand.turnEndsAt) : 0;
  const total = (hand?.sideShow ? 10 : turnSeconds) * 1000;
  const turnKey = hand && !hand.over ? `${hand.no}:${hand.turnNo}:${hand.sideShow ? 's' : 't'}` : '';
  useEffect(() => {
    if (!turnKey || !deadline) return;
    const left = remainingMs(deadline);
    progress.stopAnimation();
    progress.setValue(clamp(left / total, 0, 1));
    Animated.timing(progress, { toValue: 0, duration: left, easing: Easing.linear, useNativeDriver: false }).start();
  }, [turnKey, deadline, total, progress, remainingMs]);

  const secsLeft = deadline ? Math.ceil(remainingMs(deadline) / 1000) : 0;
  const ring = ringColorFor(secsLeft);

  // ---- messages and chips
  const say = useCallback(
    (text: string, tone: Toast['tone'] = 'info') => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast({ key: Date.now(), text, tone });
      toastFade.setValue(0);
      Animated.timing(toastFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      toastTimer.current = setTimeout(() => Animated.timing(toastFade, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => setToast(null)), 2300);
    },
    [toastFade]
  );
  const fly = useCallback((from: { x: number; y: number }, to: { x: number; y: number }, count = 1) => {
    const made: Flight[] = Array.from({ length: count }, (_, i) => ({ id: flightId.current++, x0: from.x, y0: from.y, x1: to.x, y1: to.y, delay: i * 90 }));
    setFlights((f) => [...f, ...made]);
  }, []);
  const flightDone = useCallback((id: number) => setFlights((f) => f.filter((x) => x.id !== id)), []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (packTimer.current) clearTimeout(packTimer.current);
    },
    []
  );

  const handleEntry = useCallback(
    (e: ClubLogEntry, handNo: number, ownMoveSounded: boolean) => {
      const mine = e.seat === me;
      switch (e.kind) {
        case 'DEAL':
          setDealKey(handNo);
          play('start');
          break;
        case 'SEE':
          if (!mine) play('step', { volume: 0.5 });
          break;
        case 'CHAAL':
        case 'RAISE':
          if (!mine || !ownMoveSounded) playChipBet();
          if (area.w > 0) fly(anchor(e.seat), potCenter, e.kind === 'RAISE' ? 3 : 2);
          say(`${mine ? 'You' : e.name}: ${e.kind === 'RAISE' ? 'Raise' : 'Chaal'} ${money(e.amount ?? 0)}`);
          break;
        case 'PACK':
        case 'TIMEOUT':
        case 'LEFT':
          if (!mine || !ownMoveSounded) play('special');
          say(e.kind === 'PACK' ? `${mine ? 'You' : e.name} packed` : e.kind === 'TIMEOUT' ? `${mine ? 'You' : e.name} ran out of time and packed` : `${e.name} left the table`, 'bad');
          break;
        case 'SHOW':
          play('reveal');
          if (area.w > 0) fly(anchor(e.seat), potCenter, 2);
          say(`${mine ? 'You' : e.name} asked for a Show · ${money(e.amount ?? 0)}`);
          break;
        case 'SIDE_ASK':
          say(`${mine ? 'You' : e.name} asked ${e.toName} for a Side Show`);
          break;
        case 'SIDE_YES':
          say('Side show accepted');
          break;
        case 'SIDE_NO':
          say('Side show refused');
          break;
        case 'SIDE_LOSS':
          play('reveal', { volume: 0.7 });
          say(`${e.toName} won the side show · ${e.name} packs`, 'bad');
          break;
        default:
          break;
      }
    },
    [anchor, area.w, fly, me, play, potCenter.x, potCenter.y, say] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // New entries of the hand's log. What was already there when the table was opened is not replayed (except a deal that has just happened).
  const ownSounded = useRef(new Set<string>());
  useEffect(() => {
    if (!hand) {
      lastHandNo.current = null;
      lastSeq.current = -1;
      return;
    }
    const newHand = lastHandNo.current !== hand.no;
    const since = newHand ? 0 : lastSeq.current;
    const fresh = hand.log.filter((e) => e.seq > since);
    if (firstLook.current) {
      firstLook.current = false;
      const deal = fresh.find((e) => e.kind === 'DEAL' && serverNow() - e.at < 2500);
      lastHandNo.current = hand.no;
      lastSeq.current = hand.log.length ? hand.log[hand.log.length - 1].seq : 0;
      if (hand.over) lastResultNo.current = hand.no;
      if (deal) {
        setDealKey(hand.no);
        play('start');
      }
      return;
    }
    lastHandNo.current = hand.no;
    if (hand.log.length) lastSeq.current = hand.log[hand.log.length - 1].seq;
    for (const e of fresh) handleEntry(e, hand.no, ownSounded.current.delete(`${e.kind}:${hand.no}:${e.seat}`));
  }, [table.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // The last three seconds before the cards are dealt tick.
  const startTick = useRef(-1);
  const startSecs = table.phase === 'STARTING' && table.startsAt ? Math.max(0, Math.ceil(remainingMs(table.startsAt) / 1000)) : -1;
  useEffect(() => {
    if (startSecs >= 1 && startSecs <= 3 && startTick.current !== startSecs) {
      startTick.current = startSecs;
      play('tick');
    }
    if (startSecs === -1) startTick.current = -1;
  }, [startSecs, play]);

  // Whose turn: a chime and a buzz when it becomes mine; the last five seconds tick.
  useEffect(() => {
    if (!hand || hand.over) return;
    const key = `${hand.no}:${hand.turnNo}:${hand.sideShow ? 's' : 't'}`;
    if (key === lastTurnKey.current) return;
    lastTurnKey.current = key;
    lastTickSecond.current = -1;
    if (myTurn || asked) {
      play('land');
      Vibration.vibrate(45);
    }
  }, [hand?.no, hand?.turnNo, hand?.sideShow, myTurn, asked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if ((myTurn || asked) && secsLeft > 0 && secsLeft <= 5 && lastTickSecond.current !== secsLeft) {
      lastTickSecond.current = secsLeft;
      play('tick');
    }
  }, [secsLeft, myTurn, asked, play]);

  // The end of a hand: the pot goes to the winner, and a sound for how it went for this player.
  useEffect(() => {
    if (!hand?.over || !hand.result || lastResultNo.current === hand.no) return;
    lastResultNo.current = hand.no;
    const r = hand.result;
    if (area.w > 0) {
      const to = anchor(r.winnerSeats[0] ?? 0);
      fly(potCenter, to, 4);
    }
    if (!myP) return;
    const mine = r.payouts.find((x) => x.seat === me)?.amount ?? 0;
    if (mine > 0) {
      play(mine / table.boot >= 30 ? 'bigwin' : 'win');
      play('cashout');
      Vibration.vibrate([0, 60, 50, 60]);
    } else {
      play('lose');
    }
  }, [hand?.over, hand?.no]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- moves
  const send = useCallback(
    async (kind: ClubActionKind) => {
      if (!hand) return;
      if (kind === 'CHAAL' || kind === 'RAISE' || kind === 'SHOW') {
        playChipBet();
        ownSounded.current.add(`${kind}:${hand.no}:${me}`);
      } else if (kind === 'PACK') {
        play('special');
        ownSounded.current.add(`PACK:${hand.no}:${me}`);
      } else if (kind === 'SEE') {
        play('step');
      }
      const err = await onAct(kind);
      if (err) say(err, 'bad');
    },
    [hand, me, onAct, play, say]
  );
  const pressPack = () => {
    if (!confirmPack) {
      setConfirmPack(true);
      if (packTimer.current) clearTimeout(packTimer.current);
      packTimer.current = setTimeout(() => setConfirmPack(false), 2500);
      return;
    }
    setConfirmPack(false);
    send('PACK');
  };
  useEffect(() => {
    if (!myTurn) setConfirmPack(false);
  }, [myTurn]);

  const share = () => {
    if (!table.code) return;
    Share.share({ message: `Join my Teen Patti Club table on NovaPlay! Boot ₹${table.boot} · ${table.seats} players. Code: ${table.code}` }).catch(() => {});
  };

  // ---- seats
  const names = useMemo(() => {
    const m = new Map<number, string>();
    table.seatsInfo.forEach((s) => !s.empty && m.set(s.seat, s.name));
    hand?.players.forEach((p) => !p.left && m.set(p.seat, p.name));
    return m;
  }, [table.seatsInfo, hand?.players]); // eslint-disable-line react-hooks/exhaustive-deps

  const winners = hand?.over && hand.result ? hand.result.winnerSeats : [];
  const payoutOf = (seat: number) => hand?.result?.payouts.find((x) => x.seat === seat)?.amount ?? 0;
  const playersInHand = hand ? hand.players.filter((p) => !p.left) : [];
  const activeCount = playersInHand.filter((p) => !p.packed).length;
  const potAmount = hand?.pot ?? 0;
  const canPay = (cost: number | null | undefined) => cost == null || table.balance + 1e-9 >= cost;
  const broke = !!actions && myTurn && actions.chaal !== null && !canPay(actions.chaal);

  const opponentSeats = Array.from({ length: n }, (_, s) => s).filter((s) => s !== me);

  const renderOpp = (seat: number) => {
    const s = slot(seat);
    const info = table.seatsInfo.find((x) => x.seat === seat);
    const p = hand ? hand.players.find((x) => x.seat === seat && !x.left) : undefined;
    const bw = Math.max(A * 1.9, 104 * k);
    const left = clamp(slotX(s) - bw / 2, 2, area.w - bw - 2);
    const isTurn = live && !!hand && ((hand.turnSeat === seat && !hand.sideShow) || hand.sideShow?.toSeat === seat);
    const empty = !info || info.empty;
    const dim = !!p?.packed;
    const isWinner = winners.includes(seat);
    const dx = deckPos.x - (left + bw / 2);
    const dy = deckPos.y - (oppTop + A + 30);
    return (
      <View key={seat} style={{ position: 'absolute', left, top: oppTop, width: bw, alignItems: 'center' }}>
        {empty ? (
          <View style={{ alignItems: 'center', opacity: 0.8 }}>
            <View style={[styles.emptySeat, { width: A, height: A, borderRadius: A / 2 }]}>
              <MaterialCommunityIcons name="account-plus" size={A * 0.42} color="rgba(242,196,90,0.7)" />
            </View>
            <Text style={styles.waitName}>Open seat</Text>
          </View>
        ) : (
          <>
            <View style={{ width: A, height: A }}>
              <Avatar name={info.name} tone={toneFor(info.uid ?? seat)} size={A} progress={progress} ringColor={ring} active={isTurn} dim={dim || (!p && table.phase !== 'WAITING' && table.phase !== 'STARTING')} crown={isWinner} />
              {p?.dealer ? (
                <View style={[styles.dealer, { right: -4, bottom: 0 }]}>
                  <Text style={styles.dealerText}>D</Text>
                </View>
              ) : null}
              {isTurn ? (
                <View style={[styles.secs, { backgroundColor: ring }]}>
                  <Text style={styles.secsText}>{secsLeft}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.name, dim && { opacity: 0.5 }]} numberOfLines={1}>
              {short(info.name)}
            </Text>
            <View style={styles.tagRow}>
              {!p ? (
                <Tag text={table.phase === 'PLAYING' || table.phase === 'RESULT' ? 'NEXT HAND' : 'READY'} color="#9DB3A8" bg="rgba(0,0,0,0.4)" />
              ) : p.packed ? (
                <Tag text={p.timedOut ? 'TIMED OUT' : 'PACKED'} color="#FF8C8C" bg="rgba(80,0,0,0.5)" />
              ) : p.seen ? (
                <Tag text="SEEN" color="#8EC5FF" bg="rgba(0,30,70,0.55)" icon="eye" />
              ) : (
                <Tag text="BLIND" color="#C9D6CF" bg="rgba(0,0,0,0.45)" icon="eye-off" />
              )}
              {p && p.invested > 0 ? (
                <View style={styles.invested}>
                  <Text style={styles.investedText}>{shortMoney(p.invested)}</Text>
                </View>
              ) : null}
            </View>
            {p ? (
              <View style={{ marginTop: 3, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', opacity: dim ? 0.35 : 1 }}>
                  {[0, 1, 2].map((i) => (
                    <Dealt key={i} dealKey={dealKey} delay={(s * 3 + i) * 90} dx={dx} dy={dy}>
                      <View style={{ marginLeft: i ? -mw * 0.45 : 0, transform: [{ rotate: `${(i - 1) * 6}deg` }, { translateY: i === 1 ? 0 : 2 }] }}>
                        <ClubCard card={p.cards ? p.cards[i] : null} w={mw} delay={i * 130} />
                      </View>
                    </Dealt>
                  ))}
                </View>
                {p.handName && !p.packed ? (
                  <View style={styles.handName}>
                    <Text style={styles.handNameText}>{p.handName.toUpperCase()}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </View>
    );
  };

  const myInfo = table.seatsInfo.find((x) => x.seat === me);
  const myName = myInfo && !myInfo.empty ? myInfo.name : 'You';
  const iWon = !!hand?.over && !!hand.result && me !== null && winners.includes(me);
  const myNet = hand?.over && myP ? payoutOf(me ?? -1) - myP.invested : 0;
  const cardsW = cw * 2.24;
  const myCardsLeft = area.w / 2 - cardsW / 2;
  const canSee = !!myP && !myP.seen && !myP.packed && live;

  const countdown = table.startsAt ? Math.max(0, Math.ceil(remainingMs(table.startsAt) / 1000)) : 0;
  const joined = table.seatsInfo.filter((s) => !s.empty).length;
  const rake = hand?.result?.rake ?? 0;
  const result = hand?.result;
  const resultTitle = iWon ? 'YOU WIN!' : result && result.winnerSeats.length > 1 ? 'POT SHARED' : result ? `${short(names.get(result.winnerSeats[0] ?? -1) ?? 'Player', 12)} WINS` : '';
  const resultNote =
    result?.endedBy === 'PACK'
      ? 'Everyone else packed'
      : result?.endedBy === 'POT_LIMIT'
      ? 'Pot limit reached - hands shown'
      : result
      ? (() => {
          const w = playersInHand.find((p) => p.seat === result.winnerSeats[0]);
          const l = playersInHand.find((p) => !p.packed && !result.winnerSeats.includes(p.seat));
          return w?.handName && l?.handName ? `${w.handName} beats ${l.handName}` : 'Show';
        })()
      : '';

  const phaseCard =
    table.phase === 'WAITING' ? (
      <View style={styles.centerCard}>
        <Text style={styles.centerTitle}>WAITING FOR PLAYERS</Text>
        <Text style={styles.centerBig}>
          {joined} <Text style={styles.centerSmall}>/ {n}</Text>
        </Text>
        <Text style={styles.centerNote}>{table.isPrivate ? 'Share the code with your friends' : table.handNo > 0 ? 'The next hand starts when another player sits down' : `The hand starts when ${n} players are here`}</Text>
        {table.isPrivate && table.code ? (
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>TABLE CODE</Text>
            <Text style={styles.code} selectable>
              {table.code}
            </Text>
            <TapPressable onPress={share} style={styles.shareBtn} accessibilityRole="button" accessibilityLabel="Share the table code">
              <MaterialCommunityIcons name="share-variant" size={15} color="#2A1A00" />
              <Text style={styles.shareText}>SHARE</Text>
            </TapPressable>
          </View>
        ) : null}
        {table.canStart ? <ActionButton label={`START WITH ${joined}`} tone="green" height={46} flex={0} onPress={onStart} style={{ alignSelf: 'stretch', marginTop: 8 }} /> : null}
      </View>
    ) : table.phase === 'STARTING' ? (
      <View style={styles.centerCard}>
        <Text style={styles.centerTitle}>GET READY</Text>
        <Text style={styles.centerBig}>{countdown}</Text>
        <Text style={styles.centerNote}>
          {money(table.boot)} boot each · {rake > 0 ? '' : `house cut ${table.rakePercent}%`}
        </Text>
      </View>
    ) : hand?.over && result ? (
      <View style={[styles.centerCard, iWon && { borderColor: GOLD }, compact && { paddingVertical: 8 }]}>
        <Text style={[styles.centerTitle, iWon && { color: '#FFE9A0', fontSize: compact ? 14 : 17 }]}>{resultTitle}</Text>
        <Text style={[styles.centerBig, { color: iWon ? '#FFE9A0' : '#FFFFFF' }, compact && { fontSize: 30, lineHeight: 34 }]}>{money(winners.length ? payoutOf(winners[0]) : 0)}</Text>
        <Text style={styles.centerNote}>{resultNote}</Text>
        {myP ? (
          <Text style={[styles.net, { color: myNet >= 0 ? '#4BE08A' : '#FF8C8C' }]}>
            You {myNet >= 0 ? 'made' : 'lost'} {money(Math.abs(myNet))}
          </Text>
        ) : null}
        <Text style={styles.house}>
          Pot {money(result.pot)} · house cut {result.rakeBps / 100}% = {money(result.rake)}
        </Text>
        {countdown > 0 ? <Text style={styles.next}>Next hand in {countdown}s</Text> : null}
      </View>
    ) : (
      <View style={{ alignItems: 'center' }}>
        <ChipPile size={Math.round(64 * k)} />
        <Text style={styles.potLabel}>POT</Text>
        <Text style={[styles.potAmount, { fontSize: Math.round(30 * k) }]}>{money(potAmount)}</Text>
        {hand ? (
          <Text style={styles.stakeLine}>
            Blind {money(hand.stake)} · Seen {money(hand.stake * 2)}
          </Text>
        ) : null}
      </View>
    );

  // ---- the bar of moves
  const a = actions;
  const bar = () => {
    if (table.phase === 'WAITING' || table.phase === 'STARTING') {
      return (
        <View style={styles.barRow}>
          <Text style={styles.barNote}>{table.phase === 'STARTING' ? 'Cards are about to be dealt…' : 'Waiting for the table to fill…'}</Text>
          <ActionButton label="LEAVE" tone="dark" flex={0} height={44} style={{ width: 96 }} onPress={onLeave} icon="exit-run" />
        </View>
      );
    }
    if (hand?.over || !hand) {
      return (
        <View style={styles.barRow}>
          <Text style={styles.barNote}>{hand?.over ? 'Next hand is about to start' : 'Waiting for the next hand…'}</Text>
          <ActionButton label="LEAVE" tone="dark" flex={0} height={44} style={{ width: 96 }} onPress={onLeave} icon="exit-run" />
        </View>
      );
    }
    if (!myP) {
      return (
        <View style={styles.barRow}>
          <Text style={styles.barNote}>You will be dealt in the next hand</Text>
          <ActionButton label="LEAVE" tone="dark" flex={0} height={44} style={{ width: 96 }} onPress={onLeave} icon="exit-run" />
        </View>
      );
    }
    if (myP.packed) {
      return (
        <View style={styles.barRow}>
          <Text style={styles.barNote}>You packed. Watching the rest of the hand…</Text>
          <ActionButton label="LEAVE" tone="dark" flex={0} height={44} style={{ width: 96 }} onPress={onLeave} icon="exit-run" />
        </View>
      );
    }
    if (asked && a?.respond) {
      const from = names.get(hand.sideShow!.fromSeat) ?? 'A player';
      return (
        <View style={{ gap: 8 }}>
          <Text style={styles.sidePrompt}>
            <Text style={{ color: GOLD }}>{short(from, 14)}</Text> asks for a Side Show — compare cards ({secsLeft}s)
          </Text>
          <View style={styles.barRow}>
            <ActionButton label="REFUSE" tone="red" height={52} onPress={() => send('DENY')} disabled={busy} />
            <ActionButton label="ACCEPT" sub="the lower hand packs" tone="green" height={52} flex={1.6} onPress={() => send('ACCEPT')} disabled={busy} />
          </View>
        </View>
      );
    }
    const waitMsg = asking
      ? `Waiting for ${short(names.get(hand.sideShow!.toSeat) ?? 'the player', 12)} to answer your Side Show…`
      : hand.turnSeat !== null
      ? `Waiting for ${short(names.get(hand.turnSeat) ?? 'the player', 12)}…`
      : '';
    return (
      <View style={{ gap: 6 }}>
        {broke ? <Text style={[styles.sidePrompt, { color: '#FF9B9B' }]}>Not enough balance for a bet — you can Pack.</Text> : !myTurn ? <Text style={styles.sidePrompt}>{waitMsg}</Text> : <Text style={[styles.sidePrompt, { color: '#7CFFB0' }]}>YOUR TURN · {secsLeft}s</Text>}
        <View style={styles.barRow}>
          <ActionButton label={confirmPack ? 'SURE?' : 'PACK'} sub={confirmPack ? 'tap again' : undefined} tone="red" flex={0.9} height={54} onPress={pressPack} disabled={busy || !a?.pack} />
          <ActionButton label="CHAAL" sub={myTurn && a?.chaal != null ? money(a.chaal) : myP.seen ? '2× stake' : 'stake'} tone="gold" flex={1.35} height={54} onPress={() => send('CHAAL')} disabled={busy || !myTurn || a?.chaal == null || !canPay(a?.chaal)} />
          <ActionButton label="RAISE" sub={myTurn && a?.raise ? money(a.raise.cost) : a && myTurn ? 'at limit' : undefined} tone="green" flex={1.1} height={54} onPress={() => send('RAISE')} disabled={busy || !myTurn || !a?.raise || !canPay(a?.raise?.cost)} />
          {activeCount === 2 ? (
            <ActionButton label="SHOW" sub={myTurn && a?.show != null ? money(a.show) : undefined} tone="purple" flex={1} height={54} onPress={() => send('SHOW')} disabled={busy || !myTurn || a?.show == null || !canPay(a?.show)} />
          ) : (
            <ActionButton label="SIDE SHOW" sub={myTurn && a?.sideShow ? 'free' : myP.seen ? undefined : 'needs Seen'} tone="blue" flex={1} height={54} onPress={() => send('SIDE_SHOW')} disabled={busy || !myTurn || !a?.sideShow} />
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {area.w > 0 ? (
          <>
            <Felt w={area.w} h={area.h} />
            {opponentSeats.map(renderOpp)}

            {/* the middle of the table */}
            <View style={{ position: 'absolute', left: area.w * 0.1, right: area.w * 0.1, top: potTop, alignItems: 'center' }} pointerEvents="box-none">
              {phaseCard}
            </View>
            {toast ? (
              <Animated.View pointerEvents="none" style={[styles.toast, { top: cardsTop - 46 * k, opacity: toastFade, borderColor: toast.tone === 'bad' ? '#FF8C8C' : toast.tone === 'good' ? '#4BE08A' : 'rgba(242,196,90,0.6)' }]}>
                <Text style={styles.toastText} numberOfLines={2}>
                  {toast.text}
                </Text>
              </Animated.View>
            ) : null}

            {/* my cards */}
            {myP ? (
              <View style={{ position: 'absolute', left: myCardsLeft, top: cardsTop, width: cardsW, height: cw * 1.4 + 6 }}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={{ position: 'absolute', left: i * cw * 0.62, top: i === 1 ? 0 : 7 * k, transform: [{ rotate: `${(i - 1) * 6}deg` }], opacity: myP.packed ? 0.4 : 1 }}>
                    <Dealt dealKey={dealKey} delay={(slot(myP.seat) * 3 + i) * 90} dx={deckPos.x - (myCardsLeft + i * cw * 0.62 + cw / 2)} dy={deckPos.y - (cardsTop + cw * 0.7)}>
                      <ClubCard card={myP.cards ? myP.cards[i] : null} w={cw} delay={i * 140} />
                    </Dealt>
                  </View>
                ))}
                {canSee ? (
                  <TapPressable silent onPress={() => send('SEE')} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="See your cards">
                    <View style={styles.seeWrap}>
                      <LinearGradient colors={['#5FA8FF', '#1F58B8']} style={styles.seeBtn}>
                        <MaterialCommunityIcons name="eye" size={18} color="#FFFFFF" />
                        <Text style={styles.seeText}>SEE CARDS</Text>
                      </LinearGradient>
                      <Text style={styles.seeHint}>You are playing Blind</Text>
                    </View>
                  </TapPressable>
                ) : null}
              </View>
            ) : table.phase === 'PLAYING' || table.phase === 'RESULT' ? (
              <View style={{ position: 'absolute', left: area.w * 0.12, right: area.w * 0.12, top: cardsTop + cw * 0.4, alignItems: 'center' }}>
                <Text style={styles.sitout}>You were not dealt in this hand.{'\n'}You will play the next one.</Text>
              </View>
            ) : null}

            {/* my seat */}
            <View style={{ position: 'absolute', left: 10, right: 10, top: rowTop, height: rowH, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar name={myName} tone={toneFor(myInfo && !myInfo.empty ? myInfo.uid ?? me ?? 0 : 0)} size={myA} progress={progress} ringColor={ring} active={myTurn || asked} dim={!!myP?.packed} crown={iWon} you />
              <View style={{ flex: 1 }}>
                <Text style={styles.myName} numberOfLines={1}>
                  {short(myName, 16)}
                </Text>
                <View style={styles.tagRow}>
                  {myP ? (
                    myP.packed ? (
                      <Tag text="PACKED" color="#FF8C8C" bg="rgba(80,0,0,0.5)" />
                    ) : myP.seen ? (
                      <Tag text="SEEN" color="#8EC5FF" bg="rgba(0,30,70,0.55)" icon="eye" />
                    ) : (
                      <Tag text="BLIND" color="#C9D6CF" bg="rgba(0,0,0,0.45)" icon="eye-off" />
                    )
                  ) : null}
                  {myP?.dealer ? <Tag text="DEALER" color={GOLD} bg="rgba(60,40,0,0.5)" /> : null}
                  {myP && myP.invested > 0 ? (
                    <View style={styles.invested}>
                      <Text style={styles.investedText}>In: {shortMoney(myP.invested)}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {myP?.handName && !myP.packed ? (
                <View style={styles.myHand}>
                  <Text style={styles.myHandLabel}>YOUR HAND</Text>
                  <Text style={styles.myHandName}>{myP.handName.toUpperCase()}</Text>
                </View>
              ) : null}
            </View>

            {iWon && hand?.over ? (
              <View key={`burst-${hand.no}`} pointerEvents="none" style={{ position: 'absolute', left: area.w / 2, top: potTop + 70 * k, width: 0, height: 0 }}>
                <WinBurst size={area.w * 0.5} />
              </View>
            ) : null}
            {flights.map((f) => (
              <FlightChip key={f.id} f={f} size={Math.round(22 * k)} onDone={flightDone} />
            ))}
          </>
        ) : null}
      </View>
      <View style={styles.bar}>{bar()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptySeat: { borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(242,196,90,0.5)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  waitName: { color: '#9DB3A8', fontSize: 11, marginTop: 4, fontWeight: '700' },
  name: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800', marginTop: 4, textShadowColor: '#000', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' },
  invested: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: 'rgba(242,196,90,0.55)' },
  investedText: { color: GOLD, fontSize: 10, fontWeight: '900' },
  dealer: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: GOLD },
  dealerText: { color: '#1A1A1A', fontSize: 11, fontWeight: '900' },
  secs: { position: 'absolute', left: -2, bottom: -2, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  secsText: { color: '#07140E', fontSize: 11, fontWeight: '900' },
  handName: { marginTop: 3, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1.5, borderWidth: 1, borderColor: GOLD },
  handNameText: { color: GOLD, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.6 },
  winFloat: { color: '#FFE9A0', fontSize: 16, fontWeight: '900', marginTop: 2, textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  centerCard: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: 'rgba(3,22,15,0.82)', borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(242,196,90,0.6)', paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
  centerTitle: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 1.4 },
  centerBig: { color: '#FFFFFF', fontSize: 40, fontWeight: '900', lineHeight: 46 },
  centerSmall: { color: '#9DB3A8', fontSize: 22 },
  centerNote: { color: '#B9CFC4', fontSize: 12, textAlign: 'center' },
  codeBox: { alignItems: 'center', marginTop: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 18, borderWidth: 1, borderColor: GOLD, gap: 2 },
  codeLabel: { color: '#9DB3A8', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  code: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', letterSpacing: 6 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GOLD, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  shareText: { color: '#2A1A00', fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  net: { fontSize: 13, fontWeight: '900', marginTop: 2 },
  house: { color: '#8FA89C', fontSize: 11, marginTop: 2, textAlign: 'center' },
  next: { color: GOLD, fontSize: 12, fontWeight: '800', marginTop: 3 },
  potLabel: { color: '#BFE6D2', fontSize: 11, fontWeight: '900', letterSpacing: 2, marginTop: 2 },
  potAmount: { color: '#FFE9A0', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
  stakeLine: { color: '#CFE8DB', fontSize: 11.5, fontWeight: '700', marginTop: 2, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '88%', backgroundColor: 'rgba(5,24,17,0.92)', borderRadius: 14, borderWidth: 1.2, paddingHorizontal: 14, paddingVertical: 6 },
  toastText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800', textAlign: 'center' },
  seeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  seeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 9, borderWidth: 1.5, borderColor: '#C6E0FF', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  seeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  seeHint: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '800', marginTop: 4, textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  sitout: { color: '#CFE3D8', fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 19, textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  myName: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  myHand: { alignItems: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, borderWidth: 1, borderColor: GOLD, paddingHorizontal: 10, paddingVertical: 3 },
  myHandLabel: { color: '#9DB3A8', fontSize: 8.5, fontWeight: '900', letterSpacing: 1 },
  myHandName: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  bar: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, backgroundColor: 'rgba(3,16,11,0.92)', borderTopWidth: 1, borderTopColor: 'rgba(242,196,90,0.4)', minHeight: 84, justifyContent: 'center' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barNote: { flex: 1, color: '#B9CFC4', fontSize: 13, fontWeight: '700' },
  sidePrompt: { color: '#C7D8CF', fontSize: 12.5, fontWeight: '800', textAlign: 'center' },
});
