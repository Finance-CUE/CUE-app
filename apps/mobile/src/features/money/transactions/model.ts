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

/** A group expense's one row: the user's share and what they paid (collapseGroupRows). */
export type GroupRowTxn = LedgerTxn & { group_share_paise?: number; group_paid_paise?: number };

/**
 * A group expense writes up to two ledger rows (your share, and what others owe
 * you or you owe them). Lists show one row per expense, carrying the share and
 * what the user paid; `amount_paise` stays the share, so day totals count it as
 * spending exactly once.
 */
export function collapseGroupRows(txns: LedgerTxn[]): GroupRowTxn[] {
  const byExpense = new Map<string, LedgerTxn[]>();
  const out: GroupRowTxn[] = [];
  for (const t of txns) {
    if (!t.group_expense_id) {
      out.push(t);
      continue;
    }
    const list = byExpense.get(t.group_expense_id);
    if (list) list.push(t);
    else {
      byExpense.set(t.group_expense_id, [t]);
      out.push(t); // a placeholder, replaced below in the same position
    }
  }
  return out.map((t) => {
    if (!t.group_expense_id) return t;
    const rows = byExpense.get(t.group_expense_id) ?? [t];
    const share = rows.find((r) => r.type === 'expense');
    const paid = rows.filter((r) => r.account_id).reduce((s, r) => s + r.amount_paise, 0);
    const rep = share ?? rows[0];
    return { ...rep, group_share_paise: share?.amount_paise ?? 0, group_paid_paise: paid };
  });
}

/** One row as the spec's "Row by type" table shows it. */
export function rowFor(t: GroupRowTxn, accounts: Map<string, Account>, fmt: Fmt, groups?: Map<string, string>): TxnRow {
  const account = nameOf(accounts, t.account_id);
  const time = loggedTime(t.created_at);
  const amount = fmt(Math.abs(t.amount_paise));
  const person = t.description ?? 'Someone';
  const group = t.group_id ? (groups?.get(t.group_id) ?? 'Group') : null;
  let row: Omit<TxnRow, 'spoken'>;
  if (t.group_expense_id) {
    // "Dinner · Goa Trip · Your share ₹1,000", "−₹3,000 paid".
    const share = t.group_share_paise ?? 0;
    const paid = t.group_paid_paise ?? 0;
    row = {
      title: t.description ?? 'Group expense',
      subtitle: join(group, share > 0 ? `Your share ${fmt(share)}` : 'Not your share', paid === 0 ? 'someone else paid' : account),
      amount: paid > 0 ? `− ${fmt(paid)} paid` : `− ${fmt(share)}`,
      tone: 'ink',
    };
    return { ...row, spoken: `${row.title}, ${row.amount.replace('−', 'minus')}, ${row.subtitle}` };
  }
  if (t.group_settlement_id) {
    // "Megha paid you · Goa Trip", "+₹1,000 settled".
    const into = t.type === 'repayment_received';
    row = { title: person, subtitle: join(group, account), amount: `${into ? '+' : '−'} ${amount} settled`, tone: into ? 'positive' : 'ink' };
    return { ...row, spoken: `${row.title}, ${row.amount.replace('−', 'minus').replace('+', 'plus')}, ${row.subtitle}` };
  }
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
export function latestForDay(txns: LedgerTxn[], day: string, limit = 5): GroupRowTxn[] {
  return collapseGroupRows(newestFirst(txns.filter((t) => t.occurred_on === day && t.type !== 'opening' && !t.deleted))).slice(0, limit);
}

export type DayGroup = { day: string; spentPaise: number; receivedPaise: number; items: GroupRowTxn[] };

/** History day groups with day totals: spent (expenses less refunds) and received (income). */
export function dayGroups(txns: LedgerTxn[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const t of collapseGroupRows(newestFirst(txns))) {
    const g = groups.get(t.occurred_on) ?? { day: t.occurred_on, spentPaise: 0, receivedPaise: 0, items: [] };
    if (t.type === 'expense') g.spentPaise += t.amount_paise;
    if (t.type === 'refund') g.spentPaise -= t.amount_paise;
    if (t.type === 'income') g.receivedPaise += t.amount_paise;
    g.items.push(t);
    groups.set(t.occurred_on, g);
  }
  return [...groups.values()];
}

export type TypeFilter = 'all' | 'expense' | 'income' | 'transfer' | 'khata' | 'group' | 'recurring' | 'adjustment';
export const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'khata', label: 'Khata' },
  { value: 'group', label: 'Group expenses' },
  { value: 'recurring', label: 'Recurring' },
  { value: 'adjustment', label: 'Adjustments' },
];
const TYPES: Record<Exclude<TypeFilter, 'all' | 'recurring' | 'group'>, TxnType[]> = {
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
    if (f.type === 'recurring' && !t.schedule_id) return false;
    // Group expenses and settlements; Khata is personal only.
    if (f.type === 'group' && !t.group_id) return false;
    if (f.type === 'khata' && t.group_id) return false;
    if (f.type !== 'all' && f.type !== 'recurring' && f.type !== 'group' && !TYPES[f.type].includes(t.type)) return false;
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
export const isEditable = (t: LedgerTxn) => !t.group_id && ['expense', 'income', 'transfer'].includes(t.type);
export const canDuplicate = isEditable;
export const isDeletable = (t: LedgerTxn) => !t.group_id && (isEditable(t) || t.type === 'refund' || t.type === 'adjustment');

/** "Delete Swiggy, ₹450 on 12 Nov? Your HDFC balance and net worth will update." */
export function deleteQuestion(t: LedgerTxn, accounts: Map<string, Account>, fmt: Fmt): string {
  const what =
    t.description ??
    (t.type === 'adjustment' ? 'this adjustment' : t.type === 'transfer' ? 'this transfer' : categoryName(t.category));
  const names = [nameOf(accounts, t.account_id), nameOf(accounts, t.to_account_id)].filter(Boolean);
  const balance = names.length === 2 ? `${names[0]} and ${names[1]} balances` : names.length === 1 ? `${names[0]} balance` : 'balance';
  return `Delete ${what}, ${fmt(Math.abs(t.amount_paise))} on ${dayMonth(t.occurred_on)}? Your ${balance} and net worth will update.`;
}
