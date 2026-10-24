export type Category =
  | 'food'
  | 'groceries'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'fun'
  | 'other';
export type Direction = 'lent' | 'borrowed';
export type Cadence = 'monthly' | 'yearly';

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
  cadence: Cadence;
  next_due_on: string;
  created_at: string;
};

export type Asset = {
  id: string;
  name: string;
  value_paise: number;
  created_at: string;
};

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

export type SpendInput = {
  description: string;
  amount_paise: number;
  category: Category;
  spent_on: string;
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
  cadence: Cadence;
  next_due_on: string;
};
export type AssetInput = { name: string; value_paise: number };
export type StartingMoneyInput = { bank_paise: number; cash_paise: number };
