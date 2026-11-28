/**
 * Shared money (spec P3): group balance lines, who pays whom, the split preview
 * and validation. Pure: no React, so every label and sum is unit-tested.
 */
import type { GroupDetail, GroupMember } from '../types.ts';

type Fmt = (paise: number) => string;

/** "You're owed ₹2,000", "You owe ₹500", "You're all square". */
export function myBalanceLine(paise: number, fmt: Fmt): string {
  if (paise > 0) return `You're owed ${fmt(paise)}`;
  if (paise < 0) return `You owe ${fmt(-paise)}`;
  return "You're all square";
}

/** A member's line on the group screen. */
export function memberLine(m: GroupMember, fmt: Fmt): string {
  if (m.is_me) return myBalanceLine(m.balance_paise, fmt);
  if (m.balance_paise > 0) return `${m.name} gets back ${fmt(m.balance_paise)}`;
  if (m.balance_paise < 0) return `${m.name} owes ${fmt(-m.balance_paise)}`;
  return `${m.name} is square`;
}

export function nameIn(detail: Pick<GroupDetail, 'members'>, id: string): string {
  const m = detail.members.find((x) => x.id === id);
  return m ? (m.is_me ? 'You' : m.name) : 'Someone';
}

/** "Megha pays you ₹1,000", "You pay Megha ₹500", "Aditi pays Megha ₹300". */
export function stepLine(detail: Pick<GroupDetail, 'members'>, step: { from_member: string; to_member: string; amount_paise: number }, fmt: Fmt): string {
  const from = nameIn(detail, step.from_member);
  const to = nameIn(detail, step.to_member);
  const verb = from === 'You' ? 'pay' : 'pays';
  return `${from} ${verb} ${to === 'You' ? 'you' : to} ${fmt(step.amount_paise)}`;
}

/** Equal shares as the server splits them: the leftover paise go to the first people. */
export function equalShares(amount: number, people: string[]): Record<string, number> {
  if (people.length === 0) return {};
  const base = Math.floor(amount / people.length);
  const extra = amount - base * people.length;
  return Object.fromEntries(people.map((p, i) => [p, base + (i < extra ? 1 : 0)]));
}

/** What exact shares still need to add up to the total (negative when over). */
export function exactLeft(amount: number, shares: Record<string, number>): number {
  return amount - Object.values(shares).reduce((s, v) => s + v, 0);
}

export type ExpenseForm = {
  description: string;
  amountPaise: number | null;
  paidBy: string | null;
  split: 'equal' | 'exact';
  participants: string[];
  shares: Record<string, number>;
  meId: string | null;
  accountId: string | null;
  date: string | null;
};

export type ExpenseErrors = Partial<Record<'description' | 'amount' | 'paidBy' | 'split' | 'account' | 'date', string>>;

/** Errors under each field (never a pop-up). */
export function validateExpense(f: ExpenseForm, today: string, fmt: Fmt): ExpenseErrors {
  const e: ExpenseErrors = {};
  if (!f.description.trim()) e.description = 'Say what it was for.';
  if (!f.amountPaise || f.amountPaise <= 0) e.amount = 'Enter an amount above ₹0.';
  if (!f.paidBy) e.paidBy = 'Choose who paid.';
  if (f.split === 'equal' && f.participants.length === 0) e.split = 'Choose the people sharing it.';
  if (f.split === 'exact' && f.amountPaise) {
    const left = exactLeft(f.amountPaise, f.shares);
    if (left > 0) e.split = `${fmt(left)} still to split.`;
    else if (left < 0) e.split = `The shares are ${fmt(-left)} over the total.`;
  }
  if (f.paidBy && f.paidBy === f.meId && !f.accountId) e.account = 'Choose the account you paid from.';
  if (!f.date) e.date = 'Enter the date as DD/MM/YYYY.';
  else if (f.date > today) e.date = "This can't be in the future.";
  return e;
}

/** "Megha paid · split equally between 3" for an expense row on the group screen. */
export function expenseMeta(detail: Pick<GroupDetail, 'members'>, paidBy: string, split: 'equal' | 'exact', people: number): string {
  const who = nameIn(detail, paidBy);
  return `${who === 'You' ? 'You' : who} paid · ${split === 'equal' ? `split equally between ${people}` : 'split by amounts'}`;
}
