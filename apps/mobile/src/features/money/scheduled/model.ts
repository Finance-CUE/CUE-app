/**
 * Coming up (spec 4.8): scheduled payments, their status pills, the month
 * calendar and the forms. Pure: no React, so every rule is unit-tested.
 */
import type { Account, Frequency, Occurrence, Schedule, ScheduleKind } from '../types.ts';

type Fmt = (paise: number) => string;

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Whole days from today to `iso` (negative when it has passed). Both YYYY-MM-DD. */
export function daysFrom(today: string, iso: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(iso) - ms(today)) / 86_400_000);
}

/** "18 Nov". */
export function dayMonth(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${SHORT[Number(iso.slice(5, 7)) - 1]}`;
}

export const KINDS: { value: Exclude<ScheduleKind, 'income'>; label: string }[] = [
  { value: 'subscription', label: 'Subscription' },
  { value: 'bill', label: 'Bill' },
  { value: 'rent', label: 'Rent' },
  { value: 'emi', label: 'EMI' },
  { value: 'other', label: 'Other' },
];

export const KIND_LABEL: Record<ScheduleKind, string> = {
  subscription: 'Subscriptions',
  bill: 'Bills',
  rent: 'Rent',
  emi: 'EMIs',
  other: 'Other payments',
  income: 'Income',
};

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'once', label: 'One time' },
];

export function frequencyLabel(f: Frequency): string {
  return FREQUENCIES.find((x) => x.value === f)?.label ?? 'Monthly';
}

/** The expense category a payment records when marked paid. */
export function defaultCategory(kind: ScheduleKind): string {
  if (kind === 'subscription') return 'subscriptions';
  if (kind === 'income') return 'salary';
  if (kind === 'other') return 'other';
  return 'bills';
}

export type Pill = { label: string; tone: 'line' | 'soft' | 'solid' | 'check' };

/**
 * Status pill (4.8): Upcoming "18 Nov" more than 3 days away; Due soon "In 2 days"
 * within 3; Due today "Today"; "Check" once the date has passed unanswered.
 */
export function statusPill(dueOn: string, today: string): Pill {
  const n = daysFrom(today, dueOn);
  if (n < 0) return { label: 'Check', tone: 'check' };
  if (n === 0) return { label: 'Today', tone: 'solid' };
  if (n <= 3) return { label: n === 1 ? 'Tomorrow' : `In ${n} days`, tone: 'soft' };
  return { label: dayMonth(dueOn), tone: 'line' };
}

/** "HDFC · Monthly · 🔔". */
export function metaLine(o: Pick<Occurrence, 'account_id' | 'frequency' | 'reminder'>, accounts: Map<string, Account>): string {
  const account = o.account_id ? accounts.get(o.account_id)?.name : null;
  return [account, frequencyLabel(o.frequency), o.reminder ? '🔔' : null].filter(Boolean).join(' · ');
}

const isPayment = (o: Occurrence) => o.kind !== 'income';

/**
 * Today's Coming up: unpaid payments from overdue ones ("Check") through the next
 * 30 days, soonest first, at most `limit`.
 */
export function comingUp(dues: Occurrence[], today: string, limit = 4): Occurrence[] {
  return dues
    .filter((o) => o.status === 'due' && isPayment(o) && daysFrom(today, o.due_on) <= 30)
    .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** What a future date on the strip shows: payments due that day (suggestion 6). */
export function dueOn(dues: Occurrence[], day: string): Occurrence[] {
  return dues.filter((o) => o.due_on === day && isPayment(o));
}

/** Upcoming dues grouped by type, in the order KINDS lists them. */
export function groupByKind(dues: Occurrence[]): { kind: ScheduleKind; label: string; items: Occurrence[] }[] {
  const order: ScheduleKind[] = ['subscription', 'bill', 'rent', 'emi', 'other'];
  return order
    .map((kind) => ({ kind, label: KIND_LABEL[kind], items: dues.filter((o) => o.kind === kind) }))
    .filter((g) => g.items.length > 0);
}

// Calendar ----------------------------------------------------------------------------

export type CalendarDay = { iso: string; day: number; inMonth: boolean; dues: Occurrence[] };

/** A Monday-first month grid, whole weeks, with each day's payments. */
export function calendarWeeks(month: string, dues: Occurrence[]): CalendarDay[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const weeks: CalendarDay[][] = [];
  const cursor = new Date(start);
  do {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = cursor.toISOString().slice(0, 10);
      week.push({
        iso,
        day: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === m - 1,
        dues: dues.filter((o) => o.due_on === iso && isPayment(o)),
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getUTCMonth() === m - 1);
  return weeks;
}

/** The month's total at the top of the calendar: every payment due, paid or not; skipped ones left out. */
export function monthTotal(dues: Occurrence[]): number {
  return dues.filter((o) => isPayment(o) && o.status !== 'skipped').reduce((s, o) => s + o.amount_paise, 0);
}

/** First and last day of the month of `iso`. */
export function monthBounds(iso: string): { start: string; end: string } {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/** The first of the month `delta` months from `month` (YYYY-MM-01). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

// Forms ---------------------------------------------------------------------------------

export type ScheduleForm = {
  name: string;
  amountPaise: number | null;
  nextOn: string | null;
  accountId: string | null;
};
export type ScheduleErrors = Partial<Record<'name' | 'amount' | 'date' | 'account', string>>;

/** Field errors, shown under each field (never a pop-up). */
export function validateSchedule(f: ScheduleForm): ScheduleErrors {
  const e: ScheduleErrors = {};
  if (!f.name.trim()) e.name = 'Give it a name.';
  if (!f.amountPaise || f.amountPaise <= 0) e.amount = 'Enter an amount above ₹0.';
  if (!f.nextOn) e.date = 'Enter a date as DD/MM/YYYY.';
  if (!f.accountId) e.account = 'Choose an account.';
  return e;
}

/** "Netflix, ₹199, due 18 Nov" for screen readers. */
export function spokenDue(o: Occurrence, fmt: Fmt, today: string): string {
  const pill = statusPill(o.due_on, today);
  const when = pill.tone === 'check' ? `was due ${dayMonth(o.due_on)}. Was it paid?` : `due ${dayMonth(o.due_on)}`;
  return `${o.name}, ${fmt(o.amount_paise)}, ${when}`;
}

/** The next due date an item list shows: "Next 1 Dec", or "Cancelled". */
export function nextLine(s: Schedule): string {
  return s.next_due_on ? `Next ${dayMonth(s.next_due_on)}` : 'Nothing more due';
}

/** Recurring income items, soonest expected first (the Income screen). */
export function recurringIncome(items: Schedule[]): Schedule[] {
  return items
    .filter((s) => s.kind === 'income' && s.active)
    .sort((a, b) => (a.next_due_on ?? '9999').localeCompare(b.next_due_on ?? '9999'));
}
