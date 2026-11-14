import type { Category } from '@/features/money/types';

export const CATEGORIES: readonly { slug: Category; label: string }[] = [
  { slug: 'food', label: 'Food & delivery' },
  { slug: 'groceries', label: 'Groceries' },
  { slug: 'transport', label: 'Transport' },
  { slug: 'shopping', label: 'Shopping' },
  { slug: 'bills', label: 'Bills' },
  { slug: 'subscription', label: 'Subscription' },
  { slug: 'fun', label: 'Fun' },
  { slug: 'other', label: 'Other' },
];

export function categoryLabel(slug: Category): string {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? 'Other';
}

// Order matters: groceries first so "Swiggy Instamart" is not food.
const MERCHANTS: [Category, string[]][] = [
  ['groceries', ['instamart', 'blinkit', 'zepto', 'bigbasket']],
  ['food', ['zomato', 'swiggy', 'starbucks', 'blue tokai', 'third wave']],
  ['transport', ['uber', 'ola', 'rapido']],
  ['shopping', ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho']],
  ['fun', ['bookmyshow', 'pvr']],
];

export function suggestCategory(description: string): Category | null {
  const text = ` ${description.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const [slug, words] of MERCHANTS) {
    if (words.some((w) => text.includes(` ${w} `))) return slug;
  }
  return null;
}
