/**
 * Display rules for the Today top half (spec 4.1–4.5). Pure: no React, so
 * every label and sum here is unit-tested. Amounts are formatted by the
 * caller's formatter, so hidden amounts stay masked.
 */
import type { Account, AccountKind, NetWorth } from '../types.ts';

type Fmt = (paise: number) => string;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-11-11` → `Tue 11 Nov`, as in "Viewing Tue 11 Nov · Back to today". */
export function shortDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** A device-local time like `10:42 am`, for "Updated 10:42 am". */
export function shortTime(ms: number): string {
  const t = new Date(ms);
  const h = t.getHours();
  return `${h % 12 || 12}:${String(t.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "Hello, Asha." from the profile's full name; "Hello." without one. */
export function helloLine(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first ? `Hello, ${first}.` : 'Hello.';
}

/** Avatar initials: first and last name's first letters, or one letter. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'C';
  const letters = parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

/**
 * "↑ ₹5,200 this month", with words for screen readers. Arrow and words,
 * never colour (spec 4.2: a fall is not a failure). Null hides the line.
 */
export function changeLine(paise: number | null, fmt: Fmt): { text: string; spoken: string } | null {
  if (paise === null) return null;
  if (paise === 0) return { text: 'No change this month', spoken: 'no change this month' };
  const up = paise > 0;
  const amount = fmt(Math.abs(paise));
  return {
    text: `${up ? '↑' : '↓'} ${amount} this month`,
    spoken: `${up ? 'up' : 'down'} ${amount} this month`,
  };
}

/** Screen-reader sentence for the card: "Net worth, ₹83,104, up ₹5,200 this month". */
export function netWorthSentence(nw: NetWorth, fmt: Fmt): string {
  const change = changeLine(nw.change_this_month_paise, fmt);
  return `Net worth, ${fmt(nw.net_worth_paise)}${change ? `, ${change.spoken}` : ''}`;
}

export type BreakdownRow = { label: string; paise: number };

/** Section 4.3 tables. Loans are the "other" liabilities until loan accounts exist. */
export function breakdown(nw: NetWorth, accounts: Account[]) {
  const bank = sumOf(accounts, (a) => a.kind === 'savings' || a.kind === 'current');
  const cash = sumOf(accounts, (a) => a.kind === 'cash');
  return {
    assets: [
      { label: 'Bank accounts', paise: bank },
      { label: 'Cash', paise: cash },
      { label: 'Money lent', paise: nw.receivables_paise },
      { label: 'Other assets', paise: nw.other_assets_paise },
    ] satisfies BreakdownRow[],
    liabilities: [
      { label: 'Credit card outstanding', paise: nw.card_dues_paise },
      { label: 'Loans', paise: nw.other_liabilities_paise },
      { label: 'Money borrowed', paise: nw.borrowings_paise },
    ] satisfies BreakdownRow[],
    totalAssets: nw.total_assets_paise,
    totalLiabilities: nw.total_liabilities_paise,
  };
}

function sumOf(accounts: Account[], pick: (a: Account) => boolean): number {
  return accounts.filter(pick).reduce((s, a) => s + (a.balance_paise ?? 0), 0);
}

const KIND_LABEL: Record<AccountKind, string> = {
  savings: 'Savings account',
  current: 'Current account',
  cash: 'Cash',
  credit_card: 'Credit card',
  other: 'Other',
};

export const kindLabel = (kind: AccountKind): string => KIND_LABEL[kind];

/** Your accounts (4.5): money accounts first, then "Cards and loans". */
export function accountGroups(accounts: Account[]): { money: Account[]; cardsAndLoans: Account[] } {
  const owing = (a: Account) => a.kind === 'credit_card' || (a.kind === 'other' && (a.balance_paise ?? 0) < 0);
  return { money: accounts.filter((a) => !owing(a)), cardsAndLoans: accounts.filter(owing) };
}

/** A row's amount: a card reads "₹10,000 due"; unknown before its "Balance on" date. */
export function accountAmount(a: Account, fmt: Fmt): string {
  if (a.balance_paise === null) return '—';
  if (a.kind === 'credit_card' || a.balance_paise < 0) {
    return a.balance_paise === 0 ? `${fmt(0)} due` : `${fmt(Math.abs(a.balance_paise))} due`;
  }
  return fmt(a.balance_paise);
}

/** Show up to four accounts; more go behind "View all (6)". */
export const ACCOUNTS_SHOWN = 4;

/**
 * Update balance preview: "CUE shows ₹65,000, you entered ₹64,200, difference −₹800".
 * A card's balance is the amount due, so both sides are compared as due amounts.
 */
export function balanceDifference(account: Account, enteredPaise: number, fmt: Fmt) {
  const card = account.kind === 'credit_card';
  const shown = card ? -(account.balance_paise ?? 0) : (account.balance_paise ?? 0);
  const diff = enteredPaise - shown;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  return {
    diff,
    text: `CUE shows ${fmt(shown)}, you entered ${fmt(enteredPaise)}, difference ${sign}${fmt(Math.abs(diff))}`,
  };
}

export type AdjustReason = 'missed' | 'charge' | 'interest' | 'other';
export const ADJUST_REASONS: { value: AdjustReason; label: string }[] = [
  { value: 'missed', label: 'Missed transaction' },
  { value: 'charge', label: 'Bank charge' },
  { value: 'interest', label: 'Interest' },
  { value: 'other', label: 'Other' },
];
