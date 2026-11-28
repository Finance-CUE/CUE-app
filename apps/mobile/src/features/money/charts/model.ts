/**
 * Chart rules: cash flow (spec 4.6) and the net worth line (4.3). Pure: no
 * React, so scales, labels and the touch maths are unit-tested.
 */
import type { CashFlowBucket, CashFlowPeriod, NetWorthHistory } from '../types.ts';

type Fmt = (paise: number) => string;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT[Number(iso.slice(5, 7)) - 1]}`;

export const PERIODS: { value: CashFlowPeriod; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: '3 Months' },
];

/** The label under each pair of bars: "Mon", "1–7", "Nov". */
export function bucketLabel(b: CashFlowBucket, period: CashFlowPeriod): string {
  if (period === 'week') return WEEKDAYS[parse(b.start).getUTCDay()];
  if (period === 'quarter') return SHORT[Number(b.start.slice(5, 7)) - 1];
  const a = Number(b.start.slice(8, 10));
  const z = Number(b.end.slice(8, 10));
  return a === z ? String(a) : `${a}–${z}`;
}

/** The strip under the chart: "Wed 12 Nov · Spent ₹1,310 · 3 transactions". */
export function stripText(b: CashFlowBucket, period: CashFlowPeriod, fmt: Fmt): string {
  const when =
    period === 'week'
      ? `${WEEKDAYS[parse(b.start).getUTCDay()]} ${dm(b.start)}`
      : period === 'quarter'
        ? `${SHORT[Number(b.start.slice(5, 7)) - 1]} ${b.start.slice(0, 4)}`
        : b.start === b.end
          ? dm(b.start)
          : `${dm(b.start)} – ${dm(b.end)}`;
  const parts = [when, `Spent ${fmt(b.expenses_paise)}`];
  if (b.income_paise > 0) parts.push(`Received ${fmt(b.income_paise)}`);
  parts.push(`${b.count} ${b.count === 1 ? 'transaction' : 'transactions'}`);
  return parts.join(' · ');
}

/** The running "remaining" (income − expenses) after each bucket: the savings line. */
export function runningRemaining(buckets: CashFlowBucket[]): number[] {
  let total = 0;
  return buckets.map((b) => (total += b.income_paise - b.expenses_paise));
}

/** Which bucket holds `day`, or -1. */
export function bucketIndexOf(buckets: CashFlowBucket[], day: string): number {
  return buckets.findIndex((b) => b.start <= day && day <= b.end);
}

export type BarLayout = { x: number; incomeH: number; expenseH: number; slot: number };

/** Paired bars scaled to the tallest value; the savings line uses the same scale around a mid baseline. */
export function barLayout(buckets: CashFlowBucket[], width: number, height: number): BarLayout[] {
  const max = Math.max(1, ...buckets.flatMap((b) => [b.income_paise, b.expenses_paise]));
  const slot = buckets.length ? width / buckets.length : width;
  return buckets.map((b, i) => ({
    x: i * slot,
    slot,
    incomeH: b.income_paise > 0 ? Math.max(3, (b.income_paise / max) * height) : 0,
    expenseH: b.expenses_paise > 0 ? Math.max(3, (b.expenses_paise / max) * height) : 0,
  }));
}

/** Y positions for the running-remaining line, inside 0..height, flat mid-height when it never moves. */
export function lineYs(values: number[], height: number, pad = 4): number[] {
  if (values.length === 0) return [];
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min;
  return values.map((v) => (range === 0 ? height / 2 : pad + (1 - (v - min) / range) * (height - 2 * pad)));
}

// Net worth line (4.3) -------------------------------------------------------------------

export const RANGES: { label: string; days: number }[] = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

/** "History starts 14 Sep" when the range asks for more days than there are (suggestion 11). */
export function historyNote(h: NetWorthHistory, days: number, today: string): string | null {
  if (!h.history_starts) return null;
  const wanted = parse(today).getTime() - (days - 1) * 86_400_000;
  return parse(h.history_starts).getTime() > wanted ? `History starts ${dm(h.history_starts)}` : null;
}

/** The point nearest to `x` on a line `width` wide with `count` evenly spaced points. */
export function nearestIndex(x: number, width: number, count: number): number {
  if (count <= 1) return 0;
  const i = Math.round((Math.min(Math.max(x, 0), width) / width) * (count - 1));
  return Math.min(Math.max(i, 0), count - 1);
}

/** SVG path for the line and its area fill. */
export function linePath(values: number[], width: number, height: number, pad = 6): { line: string; area: string } {
  if (values.length === 0) return { line: '', area: '' };
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  const xs = values.map((_, i) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * width));
  const ys = values.map((v) => (range === 0 ? height / 2 : pad + (1 - (v - min) / range) * (height - 2 * pad)));
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area = `${line} L${xs[xs.length - 1].toFixed(1)},${height} L${xs[0].toFixed(1)},${height} Z`;
  return { line, area };
}

/** "Wed 12 Nov" for the tooltip and the position sheet. */
export function tooltipDay(iso: string): string {
  return `${WEEKDAYS[parse(iso).getUTCDay()]} ${dm(iso)}`;
}
