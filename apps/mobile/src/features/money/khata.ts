import type { KhataEntry } from '@/features/money/types';

export type PersonBalance = { key: string; person: string; net_paise: number; entries: KhataEntry[] };

// ponytail: people are keyed by trimmed lowercase name, so two people with the same name merge.
export function personBalances(entries: KhataEntry[]): PersonBalance[] {
  const map = new Map<string, PersonBalance>();
  for (const e of entries) {
    const key = e.person.trim().toLowerCase();
    const p = map.get(key) ?? { key, person: e.person.trim(), net_paise: 0, entries: [] };
    p.net_paise += e.direction === 'lent' ? e.amount_paise : -e.amount_paise;
    p.entries.push(e);
    map.set(key, p);
  }
  return [...map.values()].sort(
    (a, b) => Math.abs(b.net_paise) - Math.abs(a.net_paise) || a.person.localeCompare(b.person),
  );
}
