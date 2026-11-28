/**
 * The merchant a description names, read the same way as the server
 * (app/features/money/words.py merchant_of): the first word that isn't filler.
 * Pure, so it is unit-tested.
 */
import type { MerchantCategory } from '../types.ts';

const STOP = new Set(['paid', 'pay', 'to', 'for', 'at', 'the', 'a', 'an', 'on', 'in', 'from', 'my', 'order', 'via', 'using', 'by', 'upi']);

/** "Paid to Zepto" -> { key: "zepto", label: "Zepto" }. Null for nothing usable. */
export function merchantOf(description: string | null | undefined): { key: string; label: string } | null {
  const words = (description ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  const key = words.find((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w));
  if (!key) return null;
  return { key: key.slice(0, 40), label: key[0].toUpperCase() + key.slice(1) };
}

/** A remembered category for this description, if the user said "Always". */
export function learnedCategory(
  rules: MerchantCategory[],
  description: string,
  kind: 'expense' | 'income',
): string | null {
  const m = merchantOf(description);
  if (!m) return null;
  return rules.find((r) => r.merchant === m.key && r.kind === kind)?.category ?? null;
}
