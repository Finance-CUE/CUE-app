export type Category =
  | 'food'
  | 'groceries'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'subscription'
  | 'fun'
  | 'other';
export type Direction = 'lent' | 'borrowed';

/** All amounts are integer paise; dates are YYYY-MM-DD, datetimes ISO strings. */
export type Spend = {
  id: string;
  description: string;
  amount_paise: number;
  category: Category;
  spent_on: string;
  created_at: string;
};

export type KhataEntry = {
  id: string;
  direction: Direction;
  person: string;
  amount_paise: number;
  note: string | null;
  created_at: string;
};

export type TrendPoint = { date: string; balance_paise: number | null; spent_paise: number };

export type StartingMoney = {
  bank_paise: number;
  cash_paise: number;
  set_at: string;
};

export type MoneySummary = {
  net_worth_paise: number | null;
  starting_money: StartingMoney | null;
  owed_to_you_paise: number;
  you_owe_paise: number;
  /** Logged after the balance was last set; already taken off net_worth_paise. */
  spent_since_update_paise: number;
  /** Money lent and marked settled since then; already added to net_worth_paise. */
  received_since_update_paise: number;
  /** Bank + cash now, or null before a balance is set. Equals net worth. */
  balance_paise: number | null;
};

export type Nudges = {
  pre_spend: boolean;
  patterns: boolean;
  weekly: boolean;
};

export type PlannedNudge = {
  id: string;
  kind: 'pattern' | 'pre_spend' | 'spike' | 'weekly' | 'subscription';
  title: string;
  body: string;
  /** ISO 8601 with the offset of the requested zone. */
  fire_at: string;
};

export type KhataInput = {
  direction: Direction;
  person: string;
  amount_paise: number;
  note?: string | null;
  /** The account chip: where the money left (lent) or arrived (borrowed). */
  account_id?: string;
  /** Makes a retry return the same entry instead of saving a second one. */
  client_key?: string;
};
/** GET /money/net-worth: section 8 figures as of `on`, plus open accounts. */
export type NetWorth = {
  on: string;
  available_paise: number;
  other_assets_paise: number;
  receivables_paise: number;
  card_dues_paise: number;
  borrowings_paise: number;
  other_liabilities_paise: number;
  total_assets_paise: number;
  total_liabilities_paise: number;
  net_worth_paise: number;
  /** Null hides the line: no full previous month yet. */
  change_this_month_paise: number | null;
  accounts: Account[];
};
export type TxnType =
  | 'opening'
  | 'income'
  | 'expense'
  | 'transfer'
  | 'refund'
  | 'adjustment'
  | 'lend'
  | 'borrow'
  | 'repayment_received'
  | 'repayment_made';
export type LedgerTxn = {
  id: string;
  client_key: string;
  type: TxnType;
  amount_paise: number;
  account_id: string | null;
  to_account_id: string | null;
  category: string | null;
  description: string | null;
  note: string | null;
  reason: string | null;
  /** The scheduled item it belongs to: a payment marked paid, or saved with Recurring on. */
  schedule_id?: string | null;
  occurred_on: string;
  created_at: string;
  deleted: boolean;
};
/** GET /money/accounts/{id}: the account screen. */
export type AccountDetail = {
  account: Account;
  money_in_this_month_paise: number;
  money_out_this_month_paise: number;
  /** Newest first; closing is null before the "Balance on" date. */
  months: { month: string; money_in_paise: number; money_out_paise: number; closing_paise: number | null }[];
};
export type AccountUpdate = { name: string; bank: string | null };
export type AccountInput = {
  client_key: string;
  name: string;
  kind: AccountKind;
  /** Bank slug from banks.ts; omitted for cash or "Other". */
  bank?: string;
  /** For a credit card, the amount due on balance_on. */
  opening_paise: number;
  balance_on: string;
};
/** POST /money/transactions: what Quick Add saves in P0. */
export type EntryInput = {
  client_key: string;
  type: 'expense' | 'income' | 'transfer';
  amount_paise: number;
  account_id: string;
  to_account_id?: string;
  category?: string;
  description?: string;
  note?: string;
  occurred_on: string;
  /** More options, Recurring: the entry repeats, next on `next_on`. */
  repeat?: Repeat;
};
export type Repeat = { frequency: RepeatFrequency; next_on: string; variable?: boolean };
/** PATCH /money/transactions/{id}: every field is sent; the type never changes. */
export type EntryUpdate = {
  amount_paise: number;
  account_id: string;
  to_account_id: string | null;
  category: string | null;
  description: string | null;
  note: string | null;
  occurred_on: string;
};
export type AdjustInput = {
  client_key: string;
  /** The balance the bank shows; for a card, the amount due. */
  actual_paise: number;
  reason: string;
  occurred_on: string;
};
export type AccountKind = 'savings' | 'current' | 'cash' | 'credit_card' | 'other';
export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  bank: string | null;
  icon: string | null;
  archived: boolean;
  /** Negative for a card with money due; null before its "Balance on" date. */
  balance_paise: number | null;
  created_at: string;
};
export type PaymentMethod = 'cash' | 'upi';

// P1: scheduled payments and recurring income (spec 4.8) ------------------------

export type ScheduleKind = 'subscription' | 'bill' | 'rent' | 'emi' | 'other' | 'income';
export type RepeatFrequency = 'monthly' | 'quarterly' | 'yearly';
export type Frequency = RepeatFrequency | 'once';

/** GET /money/scheduled: an active item and its next unanswered due date. */
export type Schedule = {
  id: string;
  kind: ScheduleKind;
  name: string;
  amount_paise: number;
  frequency: Frequency;
  billing_day: number;
  account_id: string | null;
  category: string | null;
  /** Mark paid asks for the amount (variable bills and income). */
  variable: boolean;
  reminder: boolean;
  active: boolean;
  next_due_on: string | null;
  created_at: string;
};

/** POST and PATCH /money/scheduled. `next_on` is the next due date. */
export type ScheduleInput = {
  kind: ScheduleKind;
  name: string;
  amount_paise: number;
  frequency: Frequency;
  next_on: string;
  account_id: string;
  category?: string | null;
  variable: boolean;
  reminder: boolean;
};

/** GET /money/dues: one due date. 'due' after its date means "Was it paid?". */
export type Occurrence = {
  schedule_id: string;
  kind: ScheduleKind;
  name: string;
  amount_paise: number;
  frequency: Frequency;
  account_id: string | null;
  category: string | null;
  variable: boolean;
  reminder: boolean;
  due_on: string;
  status: 'due' | 'paid' | 'skipped';
  transaction_id: string | null;
};

export type PayInput = {
  client_key: string;
  due_on: string;
  amount_paise: number;
  account_id: string;
  occurred_on: string;
};

// P1: money in and out (spec 4.4, 4.6, 4.3) -------------------------------------

/** GET /money/month: this month's four tiles, 1st to today. */
export type MonthSummary = {
  month: string;
  income_paise: number;
  salary_paise: number;
  other_income_paise: number;
  expenses_paise: number;
  daily_average_paise: number;
  /** 1st to the same day of last month. */
  expenses_same_days_last_month_paise: number;
  savings_paise: number;
  /** Null ("—") with no income. */
  savings_rate: number | null;
  dues_paise: number;
  dues_count: number;
  /** Largest first, refunds taken off. */
  categories: { category: string; paise: number }[];
  /** Null hides the line: no salary date yet. */
  left_to_spend: {
    per_day_paise: number;
    free_paise: number;
    dues_before_paise: number;
    next_salary_on: string;
  } | null;
};

export type MonthPoint = {
  month: string;
  income_paise: number;
  salary_paise: number;
  expenses_paise: number;
  savings_paise: number;
  savings_rate: number | null;
};

export type CashFlowPeriod = 'week' | 'month' | 'quarter';
export type CashFlowBucket = { start: string; end: string; income_paise: number; expenses_paise: number; count: number };
export type CashFlow = {
  period: CashFlowPeriod;
  buckets: CashFlowBucket[];
  received_paise: number;
  spent_paise: number;
  remaining_paise: number;
  /** False under 3 days of data. */
  enough_data: boolean;
};

export type NetWorthHistory = {
  points: { on: string; net_worth_paise: number }[];
  history_starts: string | null;
};

/** GET /money/position: the "Your position on" sheet. */
export type Position = {
  on: string;
  available_paise: number;
  other_assets_paise: number;
  receivables_paise: number;
  card_dues_paise: number;
  borrowings_paise: number;
  other_liabilities_paise: number;
  total_assets_paise: number;
  total_liabilities_paise: number;
  net_worth_paise: number;
};
