import React, { memo } from 'react';
import { Path } from 'react-native-svg';

/*
 * Seven-segment digits for an LCD, drawn as SVG paths (inside an <Svg>). Every cell shows all seven segments faintly (the unlit
 * "8" of a real LCD) and lights the ones its character needs, slanted like the digits of an old calculator.
 * A row is two paths however many cells it has: one for the unlit segments and one for the lit ones.
 */

export type LcdGeometry = {
  /** Width and height of one cell, and the thickness of a segment. */
  w: number;
  h: number;
  t: number;
  /** Space between the cells. */
  gap: number;
  /** How far the top of a cell leans to the right, as a share of its height. */
  skew: number;
};

const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  ' ': '',
};

const hex = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + ' Z';

/** The outline of one segment (a, b, c, d, e, f or g) of a cell whose top-left corner is (x0, y0). */
function segment(geo: LcdGeometry, seg: string, x0: number, y0: number): string {
  const { w, h, t, skew } = geo;
  const g = t * 0.1; // the hairline between neighbouring segments
  const lean = (x: number, y: number): [number, number] => [x0 + x + (h - y) * skew, y0 + y];
  const horizontal = (yc: number) =>
    hex([lean(g + t * 0.15, yc), lean(g + t * 0.7, yc - t / 2), lean(w - g - t * 0.7, yc - t / 2), lean(w - g - t * 0.15, yc), lean(w - g - t * 0.7, yc + t / 2), lean(g + t * 0.7, yc + t / 2)]);
  const vertical = (xc: number, ya: number, yb: number) =>
    hex([lean(xc, ya), lean(xc + t / 2, ya + t * 0.6), lean(xc + t / 2, yb - t * 0.6), lean(xc, yb), lean(xc - t / 2, yb - t * 0.6), lean(xc - t / 2, ya + t * 0.6)]);
  switch (seg) {
    case 'a':
      return horizontal(t / 2);
    case 'g':
      return horizontal(h / 2);
    case 'd':
      return horizontal(h - t / 2);
    case 'f':
      return vertical(t / 2, t * 0.5 + g, h / 2 - g);
    case 'b':
      return vertical(w - t / 2, t * 0.5 + g, h / 2 - g);
    case 'e':
      return vertical(t / 2, h / 2 + g, h - t * 0.5 - g);
    default:
      return vertical(w - t / 2, h / 2 + g, h - t * 0.5 - g); // c
  }
}

function dot(geo: LcdGeometry, x0: number, y0: number): string {
  const { h, t, skew } = geo;
  const d = t * 1.05;
  const p = (x: number, y: number): [number, number] => [x0 + x + (h - y) * skew, y0 + y];
  return hex([p(0, h - d), p(d, h - d), p(d, h), p(0, h)]);
}

type RowProps = {
  /** Left edge and top of the row. */
  x: number;
  y: number;
  geo: LcdGeometry;
  /** One character per cell: a digit, '-' or ' '. */
  chars: string;
  /** A decimal point after this cell (0-based), if any. It is always drawn faintly; lit when `dotLit`. */
  dotAfter?: number;
  dotLit?: boolean;
  lit?: string;
  ghost?: string;
  litOpacity?: number;
  ghostOpacity?: number;
  /** false: every segment is unlit (the display is switched off). */
  on?: boolean;
};

/** Width the row takes (cells, gaps and the decimal point). */
export function rowWidth(geo: LcdGeometry, cells: number, hasDot: boolean): number {
  return cells * (geo.w + geo.gap) + (hasDot ? geo.t * 1.05 + geo.gap : 0) + geo.h * geo.skew;
}

function LcdRowBase({ x, y, geo, chars, dotAfter, dotLit, lit = '#1c2a20', ghost = '#2f4d32', litOpacity = 0.9, ghostOpacity = 0.13, on = true }: RowProps) {
  let ghostD = '';
  let litD = '';
  let cx = x;
  for (let i = 0; i < chars.length; i++) {
    const on_ = on ? SEGMENTS[chars[i]] ?? '' : '';
    for (const seg of 'abcdefg') {
      const d = segment(geo, seg, cx, y);
      if (on_.includes(seg)) litD += d + ' ';
      else ghostD += d + ' ';
    }
    cx += geo.w + geo.gap;
    if (dotAfter === i) {
      const d = dot(geo, cx, y);
      if (dotLit && on) litD += d + ' ';
      else ghostD += d + ' ';
      cx += geo.t * 1.05 + geo.gap;
    }
  }
  return (
    <>
      <Path d={ghostD} fill={ghost} fillOpacity={ghostOpacity} />
      {litD ? <Path d={litD} fill={lit} fillOpacity={litOpacity} /> : null}
    </>
  );
}

export const LcdRow = memo(LcdRowBase);

/**
 * A number laid out for a row of `intCells` + `decCells` cells, right-aligned like an LCD (unused cells on the left stay dark).
 * A number too big for the row shows all nines.
 */
export function lcdNumber(value: number, intCells: number, decCells: number): string {
  const max = Math.pow(10, intCells) - Math.pow(10, -decCells);
  const v = Math.min(Math.max(0, value), max);
  const [int, dec = ''] = v.toFixed(decCells).split('.');
  return int.padStart(intCells, ' ') + dec.padEnd(decCells, '0');
}

/** An integer laid out for `cells` cells, right-aligned. */
export function lcdInt(value: number, cells: number): string {
  return String(Math.min(Math.max(0, Math.floor(value)), Math.pow(10, cells) - 1)).padStart(cells, ' ');
}
