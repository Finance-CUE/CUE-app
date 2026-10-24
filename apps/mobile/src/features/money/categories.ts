import type { Category } from '@/features/money/types';

export const CATEGORIES: readonly { slug: Category; label: string }[] = [
  { slug: 'food', label: 'Food & delivery' },
  { slug: 'groceries', label: 'Groceries' },
  { slug: 'transport', label: 'Transport' },
  { slug: 'shopping', label: 'Shopping' },
  { slug: 'bills', label: 'Bills' },
  { slug: 'fun', label: 'Fun' },
  { slug: 'other', label: 'Other' },
];

export function categoryLabel(slug: Category): string {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? 'Other';
}
