/**
 * This month (spec 4.4): the four tiles, their detail screens and the left-to-
 * spend line (4.2). Pure: no React, so every label is unit-tested. Amounts go
 * through the caller's formatter, so hidden amounts stay masked; percentages
 * stay visible because they reveal no amounts (spec, hidden amounts).
 */
import type { MonthPoint, MonthSummary } from '../types.ts';

type Fmt = (paise: number) => string;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]; // prettier-ignore
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "THIS MONTH · NOVEMBER" from the month's first day. */
export function monthEyebrow(month: string): string {
  return `THIS MONTH · ${MONTH_NAMES[Number(month.slice(5, 7)) - 1].toUpperCase()}`;
}

/** "Nov" from a YYYY-MM-DD in that month: bar labels. */
export function shortMonth(iso: string): string {
  return SHORT[Number(iso.slice(5, 7)) - 1];
}

/** "30 Nov": the month's last day, for "3 payments before 30 Nov". */
export function monthEndLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${last} ${SHORT[m - 1]}`;
}

export type Tile = {
  key: 'income' | 'expenses' | 'savings' | 'dues';
  label: string;
  amount: string;
  sub: string;
  /** What opening Quick Add from an empty tile should log; null opens the screen. */
  quickAdd: 'income' | 'expense' | null;
};

export function tiles(m: MonthSummary, fmt: Fmt): Tile[] {
  const income: Tile = {
    key: 'income',
    label: 'Income',
    amount: fmt(m.income_paise),
    sub:
      m.income_paise === 0
        ? 'Add income'
        : m.salary_paise > 0 && m.other_income_paise > 0
          ? `Salary ${fmt(m.salary_paise)} · Other ${fmt(m.other_income_paise)}`
          : m.salary_paise > 0
            ? 'Salary'
            : 'Other income',
    quickAdd: m.income_paise === 0 ? 'income' : null,
  };
  const expenses: Tile = {
    key: 'expenses',
    label: 'Expenses',
    amount: fmt(m.expenses_paise),
    sub: m.expenses_paise === 0 ? 'No spends yet' : `${fmt(m.daily_average_paise)} a day on average`,
    quickAdd: m.expenses_paise === 0 ? 'expense' : null,
  };
  const savings: Tile = {
    key: 'savings',
    label: 'Savings',
    amount: signed(m.savings_paise, fmt),
    sub: m.savings_rate === null ? 'Add income to see your savings rate' : `${m.savings_rate}% of income saved`,
    quickAdd: null,
  };
  const dues: Tile = {
    key: 'dues',
    label: 'Upcoming dues',
    amount: fmt(m.dues_paise),
    sub:
      m.dues_count === 0
        ? 'Nothing more due this month'
        : `${m.dues_count} ${m.dues_count === 1 ? 'payment' : 'payments'} before ${monthEndLabel(m.month)}`,
    quickAdd: null,
  };
  return [income, expenses, savings, dues];
}

/** "−₹2,000" for a negative amount: plain wording, no warning colour. */
export function signed(paise: number, fmt: Fmt): string {
  return paise < 0 ? `−${fmt(-paise)}` : fmt(paise);
}

/** "You spent ₹2,000 more than came in this month", or null when savings aren't negative. */
export function overspendLine(m: MonthSummary, fmt: Fmt): string | null {
  return m.savings_paise < 0 ? `You spent ${fmt(-m.savings_paise)} more than came in this month` : null;
}

/** "↑ ₹1,200 vs same days last month" (suggestion 12). No colour, arrow and words. */
export function vsLastMonth(now: number, then: number, fmt: Fmt): string {
  const diff = now - then;
  if (diff === 0) return 'Same as the same days last month';
  return `${diff > 0 ? '↑' : '↓'} ${fmt(Math.abs(diff))} vs same days last month`;
}

/** Bar heights 0..1 against the largest value; all zero stays zero. */
export function barScale(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? Math.max(0, v) / max : 0));
}

/** Savings rate as a label; "—" with no income. */
export function rateLabel(rate: number | null): string {
  return rate === null ? '—' : `${rate}%`;
}

/** The six-month trend sentence for screen readers. */
export function savingsTrendSentence(points: MonthPoint[], fmt: Fmt): string {
  return points
    .map((p) => `${shortMonth(p.month)}: saved ${signed(p.savings_paise, fmt)}, ${rateLabel(p.savings_rate)}`)
    .join('. ');
}

// Left to spend (4.2, section 8) ------------------------------------------------------

/** "₹1,240 free to spend today", or the honest version when dues take it all. */
export function leftToSpendLine(m: MonthSummary, fmt: Fmt): string | null {
  const l = m.left_to_spend;
  if (!l) return null;
  if (l.per_day_paise <= 0) return 'Dues before payday take all your free balance';
  return `${fmt(l.per_day_paise)} free to spend today`;
}
