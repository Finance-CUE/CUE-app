/**
 * A note from CUE and Ask CUE (spec 4.10, section 3): the words for each note,
 * what "Understand this" shows, where "View insights" goes, and the amount
 * tokens in Ask CUE's answers. Pure: no React, so every sentence is unit-tested.
 * Wording observes ("is up"), never judges ("you overspent").
 */
import { categoryName } from '../quickAdd/model.ts';
import type { AskDraft, LedgerTxn, Note } from '../types.ts';

type Fmt = (paise: number) => string;

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT[Number(iso.slice(5, 7)) - 1]}`;

/** Ask CUE writes amounts as {{₹<paise>}}; this swaps in the app's formatter (masked when hidden). */
export function fillAmounts(text: string, fmt: Fmt): string {
  return text.replace(/\{\{₹(-?\d+)\}\}/g, (_, p: string) => {
    const n = Number(p);
    return n < 0 ? `−${fmt(-n)}` : fmt(n);
  });
}

export type NoteCopy = { title: string; line: string };

/** The observation (13.3px / 700) and its supporting line (12.8px). */
export function noteCopy(note: Note, fmt: Fmt): NoteCopy {
  const p = note.params;
  switch (note.kind) {
    case 'due_soon':
      return p.count === 1
        ? { title: `${p.name} (${fmt(p.amount_paise)}) is due on ${dm(p.due_on)}.`, line: 'It shows in Coming up. Nothing is spent until you mark it paid.' }
        : { title: `${fmt(p.total_paise)} in payments due in the next 3 days.`, line: `${p.count} payments, starting with ${p.name} on ${dm(p.due_on)}.` };
    case 'pending':
      return { title: `${fmt(p.amount_paise)} pending from ${p.person}.`, line: `It's been ${p.days} days since you lent it.` };
    case 'category_up':
      return {
        title: `Your ${categoryName(p.category).toLowerCase()} spending is up ${p.percent}% on the same days last month.`,
        line: `${fmt(p.now_paise)} so far this month against ${fmt(p.then_paise)} by this point last month.`,
      };
    case 'jar_milestone':
      return p.milestone >= 100
        ? { title: `${p.name} is complete.`, line: `${fmt(p.saved_paise)} set aside, the whole target.` }
        : { title: `${p.name} jar is ${p.milestone}% complete.`, line: `${fmt(p.saved_paise)} of ${fmt(p.target_paise)} set aside.` };
    case 'streak':
      return {
        title: `You've spent less than usual for ${p.weeks} weeks in a row.`,
        line: `Each week stayed under your usual ${fmt(p.average_paise)}.`,
      };
  }
}

/** "Understand this": the numbers behind the note, then the entries that drove it. */
export function understandLines(note: Note, fmt: Fmt): { numbers: string[]; entries: string[] } {
  const p = note.params;
  const d = note.details ?? {};
  switch (note.kind) {
    case 'due_soon':
      return { numbers: [`${fmt(p.total_paise)} due in the next 3 days`], entries: (d.items ?? []).map((i: any) => `${i.name} · ${dm(i.due_on)} · ${fmt(i.amount_paise)}`) };
    case 'pending':
      return { numbers: [`${p.person} owes you ${fmt(p.amount_paise)}`, `Open since ${dm(d.since)} (${p.days} days)`], entries: [] };
    case 'category_up':
      return {
        numbers: [
          `${categoryName(p.category)}: ${fmt(p.now_paise)} so far this month`,
          `${fmt(p.then_paise)} on the same days last month (${dm(d.then_start)} – ${dm(d.then_end)})`,
          `Up ${p.percent}%`,
        ],
        entries: (d.transactions ?? []).map((t: any) => `${t.description ?? categoryName(p.category)} · ${dm(t.occurred_on)} · ${fmt(t.amount_paise)}`),
      };
    case 'jar_milestone':
      return { numbers: [`${fmt(p.saved_paise)} of ${fmt(p.target_paise)}`, `${p.milestone}% reached`], entries: [] };
    case 'streak':
      return {
        numbers: [`Your usual week: ${fmt(p.average_paise)}`],
        entries: (d.weeks_paise ?? []).map((w: number, i: number) => `Week ${i + 1}: ${fmt(w)}`),
      };
  }
}

/** View insights: the screen that matches the note. */
export function insightsRoute(note: Note): string {
  switch (note.kind) {
    case 'due_soon':
      return '/dues';
    case 'pending':
      return '/khata?tab=personal';
    case 'category_up':
      return '/expenses';
    case 'jar_milestone':
      return `/jar/${note.params.jar_id}`;
    case 'streak':
      return '/expenses';
  }
}

/** What Ask CUE is asked from a note's button: a question about the note. */
export function askAbout(note: Note): string {
  switch (note.kind) {
    case 'due_soon':
      return "What's due this week?";
    case 'pending':
      return `How much does ${note.params.person} owe me?`;
    case 'category_up':
      return `Compare ${categoryName(note.params.category).toLowerCase()} with last month`;
    case 'jar_milestone':
      return `How is my ${note.params.name} jar?`;
    case 'streak':
      return 'How much did I spend this week?';
  }
}

/** Ask CUE's draft as an entry for Quick Add to open (never saved until Save). */
export function draftTxn(d: AskDraft): LedgerTxn {
  return {
    id: 'draft',
    client_key: '',
    type: d.type as LedgerTxn['type'],
    amount_paise: d.amount_paise,
    account_id: d.account_id ?? null,
    to_account_id: d.to_account_id ?? null,
    category: d.category ?? null,
    description: d.description ?? null,
    note: null,
    reason: null,
    occurred_on: d.occurred_on,
    created_at: '',
    deleted: false,
  };
}
