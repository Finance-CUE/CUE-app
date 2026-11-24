/**
 * Indian banks for the Add account dropdown (spec 4.5), plus "Other". The
 * slug is stored on the account (server: ^[a-z0-9_-]{1,40}$). No logos yet:
 * rows show the short name's initial until licensed logo files are added.
 */
import type { AccountKind } from './types.ts';

export type Bank = { slug: string; name: string; short: string; aka?: string[] };

export const BANKS: Bank[] = [
  { slug: 'sbi', name: 'State Bank of India', short: 'SBI' },
  { slug: 'hdfc', name: 'HDFC Bank', short: 'HDFC' },
  { slug: 'icici', name: 'ICICI Bank', short: 'ICICI' },
  { slug: 'axis', name: 'Axis Bank', short: 'Axis' },
  { slug: 'kotak', name: 'Kotak Mahindra Bank', short: 'Kotak', aka: ['kotak811', '811'] },
  { slug: 'pnb', name: 'Punjab National Bank', short: 'PNB' },
  { slug: 'bob', name: 'Bank of Baroda', short: 'BoB', aka: ['baroda'] },
  { slug: 'canara', name: 'Canara Bank', short: 'Canara' },
  { slug: 'union', name: 'Union Bank of India', short: 'Union Bank' },
  { slug: 'boi', name: 'Bank of India', short: 'BoI' },
  { slug: 'indian', name: 'Indian Bank', short: 'Indian Bank' },
  { slug: 'central', name: 'Central Bank of India', short: 'Central Bank' },
  { slug: 'idbi', name: 'IDBI Bank', short: 'IDBI' },
  { slug: 'indusind', name: 'IndusInd Bank', short: 'IndusInd' },
  { slug: 'yes', name: 'Yes Bank', short: 'Yes Bank' },
  { slug: 'idfc', name: 'IDFC FIRST Bank', short: 'IDFC FIRST' },
  { slug: 'federal', name: 'Federal Bank', short: 'Federal' },
  { slug: 'au', name: 'AU Small Finance Bank', short: 'AU Bank' },
  { slug: 'rbl', name: 'RBL Bank', short: 'RBL' },
  { slug: 'bandhan', name: 'Bandhan Bank', short: 'Bandhan' },
  { slug: 'sib', name: 'South Indian Bank', short: 'South Indian Bank' },
  { slug: 'kvb', name: 'Karur Vysya Bank', short: 'KVB' },
  { slug: 'cub', name: 'City Union Bank', short: 'City Union' },
  { slug: 'dbs', name: 'DBS Bank', short: 'DBS', aka: ['digibank'] },
  { slug: 'hsbc', name: 'HSBC', short: 'HSBC' },
  { slug: 'sc', name: 'Standard Chartered', short: 'Standard Chartered', aka: ['stanchart'] },
  { slug: 'paytm', name: 'Paytm Payments Bank', short: 'Paytm' },
  { slug: 'airtel', name: 'Airtel Payments Bank', short: 'Airtel' },
  { slug: 'ippb', name: 'India Post Payments Bank', short: 'India Post', aka: ['post office'] },
  { slug: 'other', name: 'Other', short: 'Other' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Matches on name, short name or a common alias; "Other" is always offered last. */
export function searchBanks(query: string, limit = 6): Bank[] {
  const q = norm(query);
  const real = BANKS.filter((b) => b.slug !== 'other');
  const other = BANKS[BANKS.length - 1];
  if (!q) return [...real.slice(0, limit - 1), other];
  const score = (b: Bank) => {
    const names = [b.short, b.name, ...(b.aka ?? [])].map(norm);
    if (names.some((n) => n === q)) return 0;
    if (names.some((n) => n.startsWith(q))) return 1;
    if (names.some((n) => n.split(' ').some((w) => w.startsWith(q)))) return 2;
    return names.some((n) => n.includes(q)) ? 3 : null;
  };
  const hits = real
    .map((b) => ({ b, s: score(b) }))
    .filter((x): x is { b: Bank; s: number } => x.s !== null)
    .sort((x, y) => x.s - y.s)
    .map((x) => x.b);
  return [...hits.slice(0, limit - 1), other];
}

export const bankBySlug = (slug: string | null): Bank | undefined => BANKS.find((b) => b.slug === slug);

const KIND_WORD: Record<AccountKind, string> = {
  savings: 'Savings',
  current: 'Current',
  cash: 'Cash',
  credit_card: 'Card',
  other: 'Account',
};

/** "HDFC Savings", "ICICI Card": the nickname offered once a bank is picked. */
export function suggestNickname(bank: Bank | undefined, kind: AccountKind): string {
  if (kind === 'cash') return 'Cash';
  if (!bank || bank.slug === 'other') return '';
  return `${bank.short} ${KIND_WORD[kind]}`;
}
