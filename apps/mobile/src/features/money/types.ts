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

export type SpendInput = {
  description: string;
  amount_paise: number;
  category: Category;
  spent_on: string;
  billing_day?: number;
};
export type KhataInput = {
  direction: Direction;
  person: string;
  amount_paise: number;
  note?: string | null;
};
export type SubscriptionInput = {
  name: string;
  amount_paise: number;
  billing_day: number;
  starts_on: string;
};
export type CycleAnswer = { month: string; active: boolean };
export type StartingMoneyInput = { bank_paise: number; cash_paise: number };
