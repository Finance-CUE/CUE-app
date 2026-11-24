/**
 * Quick Add rules (spec "Quick Add", P0: Expense, Income, Transfer). Pure: no
 * React, so suggestions, defaults and validation are unit-tested.
 */
import { suggestCategory } from '../categories.ts';
import type { Account, LedgerTxn } from '../types.ts';

export type EntryKind = 'expense' | 'income' | 'transfer';
type Fmt = (paise: number) => string;

// Section 4.10 lists. Slugs match the server (sql/010).
export const EXPENSE_CATEGORIES = [
  { value: 'food_delivery', label: 'Food & delivery' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'transport', label: 'Transport' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'bills', label: 'Bills' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'health', label: 'Health' },
  { value: 'education', label: 'Education' },
  { value: 'travel', label: 'Travel' },
  { value: 'personal_care', label: 'Personal care' },
  { value: 'other', label: 'Other' },
] as const;
export const INCOME_CATEGORIES = [
  { value: 'salary', label: 'Salary' },
  { value: 'business', label: 'Business income' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'interest', label: 'Interest' },
  { value: 'dividends', label: 'Dividends' },
  { value: 'gifts', label: 'Gifts' },
  { value: 'refunds', label: 'Refunds' },
  { value: 'other', label: 'Other' },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['value'];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]['value'];

export const QUICK_AMOUNTS = [100_00, 250_00, 500_00];

export function categoryName(category: string | null): string {
  const all: readonly { value: string; label: string }[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  return all.find((c) => c.value === category)?.label ?? 'Other';
}

const has = (text: string, words: string[]) => {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return words.some((w) => t.includes(` ${w} `));
};

// The four categories the old list lacked, checked before the old merchant lists.
const NEW_EXPENSE: [ExpenseCategory, string[]][] = [
  ['health', ['pharmacy', 'medicine', 'medicines', 'chemist', 'doctor', 'hospital', 'clinic', 'apollo', '1mg', 'pharmeasy', 'netmeds', 'dentist', 'lab test', 'health']],
  ['education', ['course', 'udemy', 'coursera', 'books', 'book', 'stationery', 'tuition', 'school fees', 'college fees', 'exam fee', 'education']],
  ['travel', ['flight', 'hotel', 'makemytrip', 'goibibo', 'oyo', 'airbnb', 'cleartrip', 'trip', 'holiday', 'travel']],
  ['personal_care', ['salon', 'haircut', 'barber', 'spa', 'parlour', 'parlor', 'urban company', 'grooming']],
];
const FROM_OLD: Record<string, ExpenseCategory> = {
  food: 'food_delivery',
  groceries: 'groceries',
  transport: 'transport',
  shopping: 'shopping',
  bills: 'bills',
  subscription: 'subscriptions',
  fun: 'entertainment',
  other: 'other',
};

/** "Swiggy dinner" → Food & delivery. Null when nothing matches. */
export function suggestExpenseCategory(description: string): ExpenseCategory | null {
  for (const [slug, words] of NEW_EXPENSE) if (has(description, words)) return slug;
  const old = suggestCategory(description);
  return old ? FROM_OLD[old] : null;
}

const INCOME_WORDS: [IncomeCategory, string[]][] = [
  ['salary', ['salary', 'payroll', 'stipend', 'wages', 'pay']],
  ['freelance', ['freelance', 'client', 'invoice', 'project', 'gig']],
  ['interest', ['interest', 'fd', 'fixed deposit', 'savings interest']],
  ['dividends', ['dividend', 'dividends']],
  ['refunds', ['refund', 'cashback', 'reversal']],
  ['gifts', ['gift', 'shagun', 'birthday']],
  ['business', ['business', 'sales', 'shop', 'store']],
];

export function suggestIncomeCategory(source: string): IncomeCategory | null {
  for (const [slug, words] of INCOME_WORDS) if (has(source, words)) return slug;
  return null;
}

const norm = (s: string | null) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Live, newest first: the order the server returns, made explicit. */
function newestFirst(history: LedgerTxn[], type: EntryKind): LedgerTxn[] {
  return history
    .filter((t) => t.type === type && !t.deleted)
    .sort((a, b) => (a.occurred_on === b.occurred_on ? b.created_at.localeCompare(a.created_at) : b.occurred_on.localeCompare(a.occurred_on)));
}

/**
 * Smart defaults (suggestion 22): the category and account of the latest
 * entry of this type with the same description. "Uber" always from ICICI.
 */
export function smartDefaults(
  history: LedgerTxn[],
  type: EntryKind,
  description: string,
): { category: string | null; accountId: string | null } | null {
  const key = norm(description);
  if (!key) return null;
  const match = newestFirst(history, type).find((t) => norm(t.description) === key);
  return match ? { category: match.category, accountId: match.account_id } : null;
}

/** "Account chip, defaulting to the last account used for this type." */
export function defaultAccountId(accounts: Account[], history: LedgerTxn[], type: EntryKind): string | null {
  const open = accounts.filter((a) => !a.archived);
  const usable = (id: string | null) => (id && open.some((a) => a.id === id) ? id : null);
  const last = newestFirst(history, type).map((t) => usable(t.account_id)).find(Boolean);
  if (last) return last;
  // First time: income lands in a bank account; spending and transfers start from the top account.
  const bank = open.find((a) => a.kind === 'savings' || a.kind === 'current');
  return (type === 'income' ? bank?.id : undefined) ?? open[0]?.id ?? null;
}

/** For a transfer, a different account from the source: the next one in the list. */
export function defaultToAccountId(accounts: Account[], fromId: string | null): string | null {
  return accounts.filter((a) => !a.archived && a.id !== fromId)[0]?.id ?? null;
}

export type EntryForm = {
  kind: EntryKind;
  amountPaise: number | null;
  description: string;
  category: string | null;
  accountId: string | null;
  toAccountId: string | null;
  date: string | null;
};

export type FieldErrors = Partial<Record<'amount' | 'description' | 'category' | 'account' | 'toAccount' | 'date', string>>;

/** Validation shown under each field (never a pop-up). Empty means it can be saved. */
export function validate(f: EntryForm, today: string): FieldErrors {
  const e: FieldErrors = {};
  if (f.amountPaise === null || f.amountPaise <= 0) e.amount = 'Enter an amount above ₹0.';
  if (f.description.trim().length > 80) e.description = 'Keep it to 80 characters.';
  if (f.kind !== 'transfer' && !f.category) e.category = 'Choose a category.';
  if (!f.accountId) e.account = 'Choose an account.';
  if (f.kind === 'transfer') {
    if (!f.toAccountId) e.toAccount = 'Choose the account the money went to.';
    else if (f.toAccountId === f.accountId) e.toAccount = 'Choose two different accounts.';
  }
  if (f.date === null) e.date = 'Enter the date as DD/MM/YYYY.';
  else if (f.date > today) e.date = "This can't be in the future.";
  else if (f.date < '2000-01-01') e.date = 'Choose a date after 2000.';
  return e;
}

/** "Discard this entry?" only when something was typed. */
export function hasInput(amountText: string, description: string, note: string): boolean {
  return amountText.trim() !== '' || description.trim() !== '' || note.trim() !== '';
}

/**
 * Suggestion 21: low balance is a note, not a block. After an expense or
 * transfer out takes a bank or cash account below ₹0, say so quietly.
 * A credit card is meant to go into debt, so it never gets the note.
 */
export function lowBalanceNote(account: Account | undefined, paise: number, fmt: Fmt): string | null {
  if (!account || account.kind === 'credit_card' || account.balance_paise === null) return null;
  const after = account.balance_paise - paise;
  if (after >= 0) return null;
  return `This takes ${account.name} to −${fmt(-after)}. Update the balance?`;
}

/** "Expense saved", "Income saved", "Transfer saved". */
export function savedLabel(kind: EntryKind): string {
  return `${kind[0].toUpperCase()}${kind.slice(1)} saved`;
}
