/**
 * Goal Jars (spec 4.7): card and screen labels, the create-jar steps and the
 * account row line. Pure: no React, so every label is unit-tested. Amounts go
 * through the caller's formatter (hidden amounts stay masked); percentages stay
 * visible because they reveal no amounts.
 */
import type { Account, Jar, JarMethod, JarMove } from '../types.ts';

type Fmt = (paise: number) => string;

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT[Number(iso.slice(5, 7)) - 1]}`;

/** The icon picker: emoji, so no photo storage or permissions are needed. */
export const JAR_ICONS = ['✈️', '🏖️', '🏠', '💻', '📱', '🚗', '🏍️', '🎓', '💍', '👶', '🛡️', '🏥', '🎁', '🎮', '📷', '🌱'];

export const METHODS: { value: JarMethod; label: string }[] = [
  { value: 'manual', label: 'When I choose' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'payday', label: 'Every payday' },
];

/** "₹57,000 set aside across 3 jars" (suggestion 17). */
export function headerLine(totalPaise: number, count: number, fmt: Fmt): string | null {
  if (count === 0) return null;
  return `${fmt(totalPaise)} set aside across ${count} ${count === 1 ? 'jar' : 'jars'}`;
}

/** "₹12,000 / ₹30,000". */
export function savedOfTarget(j: Pick<Jar, 'saved_paise' | 'target_paise'>, fmt: Fmt): string {
  return `${fmt(j.saved_paise)} / ${fmt(j.target_paise)}`;
}

/** "by 15 Mar", or nothing without a target date. */
export function byDate(j: Pick<Jar, 'target_date'>): string | null {
  return j.target_date ? `by ${dm(j.target_date)}` : null;
}

export type Tag = { label: string; tone: 'attention' | 'muted' | 'positive' };

/** The one tag a card shows, most important first. */
export function jarTag(j: Jar): Tag | null {
  if (j.state === 'complete') return { label: 'Reached 🎉', tone: 'positive' };
  if (j.state === 'paused') return { label: 'Paused', tone: 'muted' };
  if (j.state === 'date_passed') return { label: 'Target date passed', tone: 'attention' };
  if (j.contribution_due && j.contribution_paise) return { label: 'Add money?', tone: 'attention' };
  if (j.behind) return { label: 'A little behind', tone: 'attention' };
  return null;
}

/** "₹4,500 a month gets you there by 15 Mar." */
export function suggestionLine(j: Jar, fmt: Fmt): string | null {
  if (j.suggested_monthly_paise === null || !j.target_date) return null;
  return `${fmt(j.suggested_monthly_paise)} a month gets you there by ${dm(j.target_date)}.`;
}

/** The approval prompt for a suggested contribution: "Add ₹2,000 to Goa Trip?". */
export function contributionPrompt(j: Jar, fmt: Fmt): string | null {
  if (!j.contribution_due || !j.contribution_paise) return null;
  return `Add ${fmt(j.contribution_paise)} to ${j.name}?`;
}

/** "Your jars hold more than HDFC has right now" (allocation guard, suggestion 17). */
export function shortLine(j: Jar, accounts: Map<string, Account>): string | null {
  if (j.account_short_paise <= 0) return null;
  const name = accounts.get(j.account_id)?.name ?? 'this account';
  return `Your jars hold more than ${name} has right now.`;
}

/** "₹10,000 in jars · ₹55,000 free" on an account row (suggestion 14). */
export function jarsMetaLine(a: Account, fmt: Fmt): string | null {
  if (!a.in_jars_paise) return null;
  const free = a.free_paise ?? null;
  return free === null ? `${fmt(a.in_jars_paise)} in jars` : `${fmt(a.in_jars_paise)} in jars · ${fmt(free)} free`;
}

/** A history row: "+₹2,000 · Automatic contribution", "−₹4,000 · Withdrawn". */
export function moveLine(m: JarMove, fmt: Fmt): { amount: string; label: string } {
  const amount = `${m.amount_paise > 0 ? '+' : '−'}${fmt(Math.abs(m.amount_paise))}`;
  const label = m.note ?? (m.auto ? 'Automatic contribution' : m.amount_paise > 0 ? 'Added' : 'Withdrawn');
  return { amount, label };
}

/** How the jar is funded, for the screen: "Monthly · ₹2,000 · next 16 Dec". */
export function methodLine(j: Jar, fmt: Fmt): string {
  if (j.method === 'manual' || !j.contribution_paise) return 'You add money when you choose';
  const label = METHODS.find((m) => m.value === j.method)?.label ?? 'Monthly';
  const next = j.next_contribution_on ? ` · next ${dm(j.next_contribution_on)}` : '';
  return `${label} · ${fmt(j.contribution_paise)}${next} · asks before adding`;
}

// Create jar (the brief's eight steps) ---------------------------------------------------

export const STEPS = ['Name', 'Target', 'Target date', 'Icon', 'First contribution', 'How you add', 'Account', 'Create'] as const;
export type Step = (typeof STEPS)[number];

export type JarForm = {
  name: string;
  targetPaise: number | null;
  /** '' means no target date. */
  targetDate: string | null | '';
  icon: string;
  initialPaise: number | null;
  method: JarMethod;
  contributionPaise: number | null;
  accountId: string | null;
};

/** What stops `step` from moving on, or null. Errors sit under the field. */
export function stepProblem(step: Step, f: JarForm, today: string, freeOf: (accountId: string) => number | null): string | null {
  switch (step) {
    case 'Name':
      return f.name.trim() ? null : 'Give your goal a name.';
    case 'Target':
      return f.targetPaise && f.targetPaise > 0 ? null : 'Enter a target above ₹0.';
    case 'Target date':
      if (f.targetDate === '') return null;
      if (f.targetDate === null) return 'Enter the date as DD/MM/YYYY, or skip it.';
      return f.targetDate > today ? null : 'Choose a date after today.';
    case 'Icon':
      return f.icon ? null : 'Pick an icon.';
    case 'First contribution':
      return f.initialPaise !== null && f.initialPaise >= 0 ? null : 'Enter an amount, or ₹0 to start empty.';
    case 'How you add':
      return f.method === 'manual' || (f.contributionPaise && f.contributionPaise > 0) ? null : 'Enter how much to add each time.';
    case 'Account': {
      if (!f.accountId) return 'Choose the account the money stays in.';
      const free = freeOf(f.accountId);
      if (f.initialPaise && (free === null || f.initialPaise > free)) return 'That first contribution is more than this account has free.';
      return null;
    }
    default:
      return null;
  }
}

/** Accounts a jar can use: bank accounts and cash (never a card). */
export function fundingAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => !a.archived && (a.kind === 'savings' || a.kind === 'current' || a.kind === 'cash'));
}
