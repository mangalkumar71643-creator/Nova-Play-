import React from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

/**
 * VIP level emblems drawn in SVG (no image assets): metal plaques with a
 * card suit for V0–V4, jewelled hexagons for V5–V8 and winged crests for
 * V9–V12. Each level has its own metal, gem and glow colours.
 */
type Suit = 'diamond' | 'club' | 'heart' | 'spade';
type Tier = {
  shape: 'plaque' | 'hex' | 'crest';
  frame: [string, string, string];
  gem: [string, string, string];
  glow: string;
  ribbon: [string, string];
  suit?: Suit;
  wings?: [string, string];
  crown?: boolean;
};

const SILVER: [string, string, string] = ['#FFFFFF', '#A7B0BA', '#4E5763'];

export const VIP_TIERS: Record<number, Tier> = {
  0: { shape: 'plaque', frame: ['#D6D6D6', '#7A7A7A', '#3C3C3C'], gem: ['#EDEDED', '#9E9E9E', '#4A4A4A'], glow: '#B0B0B0', ribbon: ['#9A9A9A', '#4A4A4A'], suit: 'diamond' },
  1: { shape: 'plaque', frame: ['#FFE3B8', '#C98A4E', '#6B3A16'], gem: ['#FFF1D6', '#E3A160', '#8A4E1E'], glow: '#E3A160', ribbon: ['#E3A160', '#7A4620'], suit: 'diamond' },
  2: { shape: 'plaque', frame: SILVER, gem: ['#FFFFFF', '#C8D1DB', '#6F7B88'], glow: '#D5DDE6', ribbon: ['#C8D1DB', '#5E6873'], suit: 'club' },
  3: { shape: 'plaque', frame: ['#FFF4C2', '#E3B23C', '#8A5A0E'], gem: ['#FFF7D1', '#F2C14E', '#A86C12'], glow: '#F2C14E', ribbon: ['#F2C14E', '#8A5A0E'], suit: 'heart' },
  4: { shape: 'plaque', frame: ['#FFE9B0', '#D99A2B', '#7A4A08'], gem: ['#FFF0C2', '#E8A93A', '#8C560C'], glow: '#FFB84A', ribbon: ['#E8A93A', '#7A4A08'], suit: 'spade' },
  5: { shape: 'hex', frame: SILVER, gem: ['#C8FFE3', '#2FD07A', '#0A5A30'], glow: '#2FD07A', ribbon: ['#2FD07A', '#0A5A30'] },
  6: { shape: 'hex', frame: SILVER, gem: ['#D6E0FF', '#5A6CFF', '#1B1F86'], glow: '#5A6CFF', ribbon: ['#5A6CFF', '#1B1F86'] },
  7: { shape: 'hex', frame: ['#FFFFFF', '#B3A7BE', '#55485F'], gem: ['#FFD6F8', '#D64BE6', '#5A0E78'], glow: '#D64BE6', ribbon: ['#D64BE6', '#5A0E78'], wings: ['#F7B6F0', '#9B2CB0'] },
  8: { shape: 'hex', frame: SILVER, gem: ['#C8FFE3', '#22C26A', '#08502A'], glow: '#22C26A', ribbon: ['#22C26A', '#08502A'], wings: ['#9CF2C2', '#1C8F4F'] },
  9: { shape: 'crest', frame: ['#E8E8EE', '#7C7C86', '#2E2E35'], gem: ['#FFE2B8', '#FF8A1F', '#8A3600'], glow: '#FF8A1F', ribbon: ['#FF8A1F', '#8A3600'], wings: ['#FFB25E', '#B24A00'] },
  10: { shape: 'crest', frame: SILVER, gem: ['#C8FFE3', '#1FBF63', '#06492A'], glow: '#1FBF63', ribbon: ['#1FBF63', '#06492A'] },
  11: { shape: 'crest', frame: ['#FFFFFF', '#A9B7D9', '#3B4A73'], gem: ['#D6E6FF', '#3D7BFF', '#10307E'], glow: '#3D7BFF', ribbon: ['#3D7BFF', '#10307E'], wings: ['#BFD3FF', '#3657B8'], suit: 'club' },
  12: { shape: 'crest', frame: ['#FFF4C2', '#E3B23C', '#7A4A08'], gem: ['#FFE0F7', '#FF5FCF', '#8A0F6B'], glow: '#FF5FCF', ribbon: ['#FF5FCF', '#8A0F6B'], wings: ['#FF9BE3', '#B0237E'], crown: true, suit: 'spade' },
};

export function vipTier(level: number): Tier {
  return VIP_TIERS[level] ?? VIP_TIERS[12];
}

// Card suits drawn in a 100×100 box.
const SUITS: Record<Suit, string> = {
  diamond: 'M50 4 L90 50 L50 96 L10 50 Z',
  heart: 'M50 92 C20 66 4 52 4 32 C4 17 16 7 29 7 C39 7 46 13 50 21 C54 13 61 7 71 7 C84 7 96 17 96 32 C96 52 80 66 50 92 Z',
  spade:
    'M50 4 C66 26 96 40 96 61 C96 76 84 85 70 85 C62 85 56 81 53 76 C54 86 58 92 66 96 L34 96 C42 92 46 86 47 76 C44 81 38 85 30 85 C16 85 4 76 4 61 C4 40 34 26 50 4 Z',
  club: 'M50 6 A19 19 0 1 1 49.9 6 Z M27 40 A19 19 0 1 1 26.9 40 Z M73 40 A19 19 0 1 1 72.9 40 Z M44 56 L56 56 L62 96 L38 96 Z',
};

function hexPoints(r: number, cx = 100, cy = 100) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

const SHIELD_OUTER = 'M100 18 L170 44 L164 118 Q152 164 100 190 Q48 164 36 118 L30 44 Z';
const SHIELD_INNER = 'M100 32 L156 53 L151 116 Q141 152 100 174 Q59 152 49 116 L44 53 Z';
const CREST_GEM = '100,60 130,80 139,110 120,142 100,154 80,142 61,110 70,80';
const WING_LEFT = 'M44 62 C14 50 0 80 4 108 C18 98 26 98 34 102 C14 112 10 132 16 148 C30 132 38 126 48 124 Z';
const SHARD_LEFT = 'M46 82 L4 54 L26 98 Z M46 118 L4 146 L26 102 Z';

export function VipEmblem({ level, size }: { level: number; size: number }) {
  const t = vipTier(level);
  const id = `vip${level}`;
  const url = (name: string) => `url(#${id}${name})`;

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <RadialGradient id={`${id}glow`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={t.glow} stopOpacity="0.6" />
          <Stop offset="0.55" stopColor={t.glow} stopOpacity="0.18" />
          <Stop offset="1" stopColor={t.glow} stopOpacity="0" />
        </RadialGradient>
        <SvgLinearGradient id={`${id}frame`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={t.frame[0]} />
          <Stop offset="0.45" stopColor={t.frame[1]} />
          <Stop offset="1" stopColor={t.frame[2]} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${id}bevel`} x1="1" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={t.frame[0]} />
          <Stop offset="0.5" stopColor={t.frame[1]} />
          <Stop offset="1" stopColor={t.frame[2]} />
        </SvgLinearGradient>
        <RadialGradient id={`${id}gem`} cx="38%" cy="32%" r="75%">
          <Stop offset="0" stopColor={t.gem[0]} />
          <Stop offset="0.45" stopColor={t.gem[1]} />
          <Stop offset="1" stopColor={t.gem[2]} />
        </RadialGradient>
        <SvgLinearGradient id={`${id}shine`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </SvgLinearGradient>
        {t.wings ? (
          <SvgLinearGradient id={`${id}wing`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.wings[0]} />
            <Stop offset="1" stopColor={t.wings[1]} />
          </SvgLinearGradient>
        ) : null}
      </Defs>

      <Circle cx={100} cy={100} r={99} fill={url('glow')} />

      {t.shape === 'plaque' ? (
        <G>
          <Polygon points="100,8 192,100 100,192 8,100" fill={url('frame')} />
          <Polygon points="100,22 178,100 100,178 22,100" fill={url('bevel')} />
          <Polygon points="100,32 168,100 100,168 32,100" fill={url('gem')} />
          <Polygon points="100,40 160,100 100,160 40,100" fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.5} />
          <Path d="M100 32 L100 168 M32 100 L168 100" stroke="#FFFFFF" strokeOpacity={0.14} strokeWidth={1.5} />
          {t.suit ? (
            <G>
              <G transform="translate(68,69) scale(0.64)">
                <Path d={SUITS[t.suit]} fill="#000000" opacity={0.35} />
              </G>
              <G transform="translate(66,66) scale(0.68)">
                <Path d={SUITS[t.suit]} fill={url('bevel')} stroke={t.frame[0]} strokeWidth={5} />
              </G>
            </G>
          ) : null}
          <Polygon points="100,32 168,100 32,100" fill={url('shine')} opacity={0.45} />
        </G>
      ) : null}

      {t.shape === 'hex' ? (
        <G>
          {t.wings ? (
            <G>
              <Path d={SHARD_LEFT} fill={url('wing')} />
              <Path d={SHARD_LEFT} fill={url('wing')} transform="translate(200,0) scale(-1,1)" />
            </G>
          ) : null}
          <Polygon points={hexPoints(88)} fill={url('frame')} />
          <Polygon points={hexPoints(74)} fill={url('bevel')} />
          <Polygon points={hexPoints(66)} fill="#1A0A10" opacity={0.55} />
          <Polygon points={hexPoints(56)} fill={url('gem')} />
          {Array.from({ length: 6 }, (_, k) => {
            const a1 = ((-90 + 60 * k) * Math.PI) / 180;
            const a2 = ((-90 + 60 * (k + 1)) * Math.PI) / 180;
            const p = (a: number, r: number) => `${(100 + r * Math.cos(a)).toFixed(1)},${(100 + r * Math.sin(a)).toFixed(1)}`;
            return <Polygon key={k} points={`100,100 ${p(a1, 56)} ${p(a2, 56)}`} fill="#FFFFFF" opacity={k % 2 === 0 ? 0.16 : 0.03} />;
          })}
          <Polygon points={hexPoints(24)} fill="#FFFFFF" opacity={0.22} />
          <Polygon points="23.8,56 100,12 176.2,56 176.2,100 23.8,100" fill={url('shine')} opacity={0.3} />
        </G>
      ) : null}

      {t.shape === 'crest' ? (
        <G>
          {t.wings ? (
            <G>
              <Path d={WING_LEFT} fill={url('wing')} />
              <Path d={WING_LEFT} fill={url('wing')} transform="translate(200,0) scale(-1,1)" />
            </G>
          ) : null}
          {t.crown ? <Path d="M62 34 L74 8 L87 26 L100 2 L113 26 L126 8 L138 34 Z" fill={url('frame')} stroke={t.frame[2]} strokeWidth={2} /> : null}
          <Path d={SHIELD_OUTER} fill={url('frame')} />
          <Path d={SHIELD_INNER} fill={url('bevel')} />
          <Path d={SHIELD_INNER} fill="#140810" opacity={0.45} transform="translate(100,104) scale(0.88) translate(-100,-104)" />
          <Polygon points={CREST_GEM} fill={url('gem')} stroke={t.frame[0]} strokeWidth={2.5} />
          <Path d="M100 60 L100 154 M61 110 L139 110 M70 80 L120 142 M130 80 L80 142" stroke="#FFFFFF" strokeOpacity={0.16} strokeWidth={1.5} />
          <Polygon points="100,84 116,96 116,116 100,128 84,116 84,96" fill="#FFFFFF" opacity={0.2} />
          {t.suit ? (
            <G transform="translate(88,92) scale(0.24)">
              <Path d={SUITS[t.suit]} fill="#FFFFFF" opacity={0.85} />
            </G>
          ) : null}
          <Path d={SHIELD_OUTER} fill={url('shine')} opacity={0.3} />
        </G>
      ) : null}

      <Path d="M152 24 L156 37 L169 41 L156 45 L152 58 L148 45 L135 41 L148 37 Z" fill="#FFFFFF" opacity={0.9} />
      <Circle cx={152} cy={41} r={3} fill="#FFFFFF" />
    </Svg>
  );
}

/** The round stage a VIP emblem stands on. */
export function VipPedestal({ width }: { width: number }) {
  const h = Math.round(width * 0.42);
  const cx = width / 2;
  const rx = width * 0.47;
  const ry = h * 0.2;
  const top = h * 0.26;
  const depth = h * 0.42;
  return (
    <Svg width={width} height={h}>
      <Defs>
        <RadialGradient id="pedGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FF3B54" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FF3B54" stopOpacity="0" />
        </RadialGradient>
        <SvgLinearGradient id="pedTop" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6E1626" />
          <Stop offset="1" stopColor="#2A070D" />
        </SvgLinearGradient>
        <SvgLinearGradient id="pedSide" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#1A0408" />
          <Stop offset="0.5" stopColor="#4A0E19" />
          <Stop offset="1" stopColor="#1A0408" />
        </SvgLinearGradient>
      </Defs>
      <Ellipse cx={cx} cy={top} rx={rx * 0.95} ry={ry * 1.6} fill="url(#pedGlow)" />
      <Rect x={cx - rx} y={top} width={rx * 2} height={depth} fill="url(#pedSide)" />
      <Ellipse cx={cx} cy={top + depth} rx={rx} ry={ry} fill="#12030A" />
      <Ellipse cx={cx} cy={top} rx={rx} ry={ry} fill="url(#pedTop)" stroke="#FF8A99" strokeOpacity={0.45} strokeWidth={1.5} />
      <Ellipse cx={cx} cy={top} rx={rx * 0.72} ry={ry * 0.6} fill="none" stroke="#FFD27A" strokeOpacity={0.25} strokeWidth={1} />
    </Svg>
  );
}

/**
 * The curved level track across the top: five stops around the level in
 * focus, gold up to the player's own level.
 */
export function VipArc({ width, focused, playerLevel, maxLevel }: { width: number; focused: number; playerLevel: number; maxLevel: number }) {
  const h = 74;
  const p0 = { x: -10, y: 56 };
  const p1 = { x: width / 2, y: -8 };
  const p2 = { x: width + 10, y: 56 };
  const at = (t: number) => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x,
    y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y,
  });
  const ts = [0.1, 0.3, 0.5, 0.7, 0.9];
  // Gold runs from the left edge to the player's level (or across, if past view).
  const offset = playerLevel - focused;
  const tGold = offset < -2 ? 0 : offset > 2 ? 1 : ts[offset + 2];
  const q1 = { x: p0.x + tGold * (p1.x - p0.x), y: p0.y + tGold * (p1.y - p0.y) };
  const end = at(tGold);

  return (
    <Svg width={width} height={h}>
      <Path d={`M${p0.x} ${p0.y} Q${p1.x} ${p1.y} ${p2.x} ${p2.y}`} stroke="#12030A" strokeWidth={4} fill="none" />
      <Path d={`M${p0.x} ${p0.y} Q${p1.x} ${p1.y} ${p2.x} ${p2.y}`} stroke="#FF8A99" strokeOpacity={0.18} strokeWidth={1} fill="none" />
      {tGold > 0 ? <Path d={`M${p0.x} ${p0.y} Q${q1.x} ${q1.y} ${end.x} ${end.y}`} stroke="#F0B93D" strokeWidth={3} fill="none" /> : null}
      {ts.map((t, i) => {
        const lvl = focused - 2 + i;
        if (lvl < 0 || lvl > maxLevel) return null;
        const p = at(t);
        const isFocus = lvl === focused;
        const reached = lvl <= playerLevel;
        return (
          <G key={lvl}>
            {isFocus ? <Circle cx={p.x} cy={p.y} r={13} fill="#F0B93D" opacity={0.18} /> : null}
            {isFocus ? <Circle cx={p.x} cy={p.y} r={8} fill="#2A070D" stroke="#F0B93D" strokeWidth={2.5} /> : null}
            <Circle cx={p.x} cy={p.y} r={isFocus ? 4 : 5} fill={reached ? '#F0B93D' : '#2A070D'} stroke={reached ? '#FFDE8C' : '#5A1A26'} strokeWidth={1} />
            <SvgText
              x={p.x}
              y={p.y + (isFocus ? 26 : 22)}
              fontSize={isFocus ? 15 : 13}
              fontWeight="700"
              fill={isFocus ? '#FF8A99' : '#9E5A66'}
              textAnchor="middle"
            >
              {`V${lvl}`}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
