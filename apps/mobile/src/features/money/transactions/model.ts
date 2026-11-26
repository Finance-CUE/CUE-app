/**
 * Transaction rows, day groups, filters and confirm copy (spec 4.9). Pure,
 * so every label is unit-tested. Amounts go through the caller's formatter,
 * so hidden amounts stay masked.
 */
import { categoryName } from '../quickAdd/model.ts';
import type { Account, LedgerTxn, TxnType } from '../types.ts';

type Fmt = (paise: number) => string;
export type Tone = 'ink' | 'positive' | 'soft';

export type TxnRow = {
  title: string;
  subtitle: string;
  amount: string;
  tone: Tone;
  /** For screen readers: the whole row as a sentence. */
  spoken: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-11-12` → `12 Nov`. */
export function dayMonth(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** When it was logged, device time: `8:42 pm`. */
export function loggedTime(createdAt: string): string {
  const t = new Date(createdAt);
  const h = t.getHours();
  return `${h % 12 || 12}:${String(t.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const nameOf = (accounts: Map<string, Account>, id: string | null) => (id ? accounts.get(id)?.name : undefined);
const join = (...parts: (string | undefined | null)[]) => parts.filter(Boolean).join(' · ');

/** One row as the spec's "Row by type" table shows it. */
export function rowFor(t: LedgerTxn, accounts: Map<string, Account>, fmt: Fmt): TxnRow {
  const account = nameOf(accounts, t.account_id);
  const time = loggedTime(t.created_at);
  const amount = fmt(Math.abs(t.amount_paise));
  const person = t.description ?? 'Someone';
  let row: Omit<TxnRow, 'spoken'>;
  switch (t.type) {
    case 'expense':
      row = { title: t.description ?? categoryName(t.category), subtitle: join(categoryName(t.category), account, time), amount: `− ${amount}`, tone: 'ink' };
      break;
    case 'income':
      row = { title: t.description ?? categoryName(t.category), subtitle: join(categoryName(t.category), account), amount: `+ ${amount}`, tone: 'positive' };
      break;
    case 'refund':
      row = { title: t.description ?? 'Refund', subtitle: join('Refund', categoryName(t.category), account), amount: `+ ${amount}`, tone: 'positive' };
      break;
    case 'transfer':
      row = {
        title: `${account ?? 'Account'} → ${nameOf(accounts, t.to_account_id) ?? 'Account'}`,
        subtitle: join('Transfer', time),
        amount: `⇄ ${amount}`,
        tone: 'soft',
      };
      break;
    case 'lend':
      row = { title: `Lent to ${person}`, subtitle: join(account, time), amount: `↗ ${amount}`, tone: 'ink' };
      break;
    case 'borrow':
      row = { title: `Borrowed from ${person}`, subtitle: join(account, time), amount: `↙ ${amount}`, tone: 'ink' };
      break;
    case 'repayment_received':
      row = { title: `${person} paid you back`, subtitle: join(account, time), amount: `+ ${amount}`, tone: 'positive' };
      break;
    case 'repayment_made':
      row = { title: `You paid ${person} back`, subtitle: join(account, time), amount: `− ${amount}`, tone: 'ink' };
      break;
    case 'adjustment':
      row = {
        title: 'Balance adjustment',
        subtitle: join(account, t.reason),
        amount: `${t.amount_paise < 0 ? '− ' : '+ '}${amount}`,
        tone: 'soft',
      };
      break;
    case 'opening':
      row = { title: 'Opening balance', subtitle: join(account), amount, tone: 'soft' };
      break;
  }
  return { ...row, spoken: `${row.title}, ${row.amount.replace('−', 'minus').replace('+', 'plus')}, ${row.subtitle}` };
}

/** Newest first: by date, then by when it was logged. */
export function newestFirst(txns: LedgerTxn[]): LedgerTxn[] {
  return [...txns].sort((a, b) =>
    a.occurred_on === b.occurred_on ? b.created_at.localeCompare(a.created_at) : b.occurred_on.localeCompare(a.occurred_on),
  );
}

/** Today's card: that day's latest five, never the opening balances. */
export function latestForDay(txns: LedgerTxn[], day: string, limit = 5): LedgerTxn[] {
  return newestFirst(txns.filter((t) => t.occurred_on === day && t.type !== 'opening' && !t.deleted)).slice(0, limit);
}

export type DayGroup = { day: string; spentPaise: number; receivedPaise: number; items: LedgerTxn[] };

/** History day groups with day totals: spent (expenses less refunds) and received (income). */
export function dayGroups(txns: LedgerTxn[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const t of newestFirst(txns)) {
    const g = groups.get(t.occurred_on) ?? { day: t.occurred_on, spentPaise: 0, receivedPaise: 0, items: [] };
    if (t.type === 'expense') g.spentPaise += t.amount_paise;
    if (t.type === 'refund') g.spentPaise -= t.amount_paise;
    if (t.type === 'income') g.receivedPaise += t.amount_paise;
    g.items.push(t);
    groups.set(t.occurred_on, g);
  }
  return [...groups.values()];
}

export type TypeFilter = 'all' | 'expense' | 'income' | 'transfer' | 'khata' | 'recurring' | 'adjustment';
export const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'khata', label: 'Khata' },
  { value: 'recurring', label: 'Recurring' },
  { value: 'adjustment', label: 'Adjustments' },
];
const TYPES: Record<Exclude<TypeFilter, 'all' | 'recurring'>, TxnType[]> = {
  expense: ['expense', 'refund'],
  income: ['income'],
  transfer: ['transfer'],
  khata: ['lend', 'borrow', 'repayment_received', 'repayment_made'],
  adjustment: ['adjustment', 'opening'],
};

export type Filters = { type: TypeFilter; accountId: string | null; category: string | null; query: string };

/**
 * History filters and search: by merchant or description, amount, notes or
 * category. "450" finds ₹450 and ₹450.50; "swig" finds Swiggy.
 */
export function applyFilters(txns: LedgerTxn[], f: Filters): LedgerTxn[] {
  const q = f.query.trim().toLowerCase();
  const digits = q.replace(/[₹,\s]/g, '');
  const amountQuery = /^\d+(\.\d{0,2})?$/.test(digits) ? digits : null;
  return txns.filter((t) => {
    if (t.deleted) return false;
    // Recurring: entries that belong to a scheduled item (marked paid, or saved with Recurring on).
    if (f.type === 'recurring' ? !t.schedule_id : f.type !== 'all' && !TYPES[f.type].includes(t.type)) return false;
    if (f.accountId && t.account_id !== f.accountId && t.to_account_id !== f.accountId) return false;
    if (f.category && t.category !== f.category) return false;
    if (!q) return true;
    const rupees = (Math.abs(t.amount_paise) / 100).toFixed(2);
    if (amountQuery && (rupees.startsWith(`${amountQuery}.`) || rupees.startsWith(amountQuery))) return true;
    return [t.description, t.note, t.reason, t.category ? categoryName(t.category) : null].some((s) =>
      (s ?? '').toLowerCase().includes(q),
    );
  });
}

/** The Quick Add form edits and duplicates these in P0; Khata rows are changed in Khata. */
export const isEditable = (t: LedgerTxn) => ['expense', 'income', 'transfer'].includes(t.type);
export const canDuplicate = isEditable;
export const isDeletable = (t: LedgerTxn) => isEditable(t) || t.type === 'refund' || t.type === 'adjustment';

/** "Delete Swiggy, ₹450 on 12 Nov? Your HDFC balance and net worth will update." */
export function deleteQuestion(t: LedgerTxn, accounts: Map<string, Account>, fmt: Fmt): string {
  const what =
    t.description ??
    (t.type === 'adjustment' ? 'this adjustment' : t.type === 'transfer' ? 'this transfer' : categoryName(t.category));
  const names = [nameOf(accounts, t.account_id), nameOf(accounts, t.to_account_id)].filter(Boolean);
  const balance = names.length === 2 ? `${names[0]} and ${names[1]} balances` : names.length === 1 ? `${names[0]} balance` : 'balance';
  return `Delete ${what}, ${fmt(Math.abs(t.amount_paise))} on ${dayMonth(t.occurred_on)}? Your ${balance} and net worth will update.`;
}
