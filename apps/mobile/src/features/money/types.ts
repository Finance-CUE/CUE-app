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

export type Subscription = {
  id: string;
  name: string;
  amount_paise: number;
  billing_day: number;
  starts_on: string;
  active: boolean;
  created_at: string;
  next_billing_on: string | null;
};

export type DueCycle = {
  subscription_id: string;
  name: string;
  amount_paise: number;
  /** First of the month being answered, YYYY-MM-DD. */
  month: string;
  billing_on: string;
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
  occurred_on: string;
  created_at: string;
  deleted: boolean;
};
export type AccountInput = {
  client_key: string;
  name: string;
  kind: AccountKind;
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
};
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
export type SubscriptionInput = {
  name: string;
  amount_paise: number;
  billing_day: number;
  starts_on: string;
};
export type PaymentMethod = 'cash' | 'upi';
export type CycleAnswer = { month: string; active: boolean };
export type StartingMoneyInput = { bank_paise: number; cash_paise: number };
