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

/**
 * Whole-word (or whole-phrase) keywords, matched case-insensitively.
 * Order matters: the first category with a match wins, so the more specific
 * lists come first ("Swiggy Instamart" is groceries, "Netflix" a subscription,
 * "Amazon Prime" a subscription but plain "Amazon" shopping).
 */
const MERCHANTS: [Category, string[]][] = [
  [
    'subscription',
    [
      'netflix', 'prime video', 'amazon prime', 'hotstar', 'jiohotstar', 'disney', 'sonyliv',
      'zee5', 'spotify', 'youtube premium', 'yt premium', 'apple music', 'icloud',
      'google one', 'chatgpt', 'gym membership', 'cult fit', 'cultfit', 'linkedin premium',
      'swiggy one', 'zomato gold', 'subscription',
    ],
  ],
  [
    'groceries',
    [
      'instamart', 'blinkit', 'zepto', 'bigbasket', 'big basket', 'jiomart', 'dmart',
      'd mart', 'more supermarket', 'reliance fresh', 'star bazaar', 'spencers', 'nature basket',
      'grocery', 'groceries', 'kirana', 'sabzi', 'vegetables', 'veggies', 'fruits', 'milk',
      'dairy', 'eggs', 'bread', 'atta', 'rice', 'dal', 'supermarket',
    ],
  ],
  [
    'food',
    [
      'zomato', 'swiggy', 'eatsure', 'dominos', 'domino s', 'pizza', 'pizza hut', 'mcdonalds',
      'mcdonald s', 'kfc', 'burger', 'burger king', 'subway', 'starbucks', 'blue tokai',
      'third wave', 'chaayos', 'ccd', 'cafe coffee day', 'haldiram', 'barbeque nation',
      'coffee', 'chai', 'tea', 'lunch', 'dinner', 'breakfast', 'snacks', 'snack', 'restaurant',
      'cafe', 'canteen', 'mess', 'tiffin', 'biryani', 'dosa', 'momos', 'juice', 'ice cream',
      'food', 'meal', 'dessert', 'bakery', 'sweets',
    ],
  ],
  [
    'transport',
    [
      'uber', 'ola', 'rapido', 'namma yatri', 'blusmart', 'auto', 'rickshaw', 'cab', 'taxi',
      'metro', 'bus', 'train', 'irctc', 'local train', 'petrol', 'diesel', 'fuel', 'cng',
      'parking', 'toll', 'fastag', 'flight', 'indigo', 'air india', 'redbus', 'bike service',
      'car service', 'travel',
    ],
  ],
  [
    'bills',
    [
      'rent', 'electricity', 'bescom', 'msedcl', 'tata power', 'adani electricity', 'water bill',
      'gas bill', 'cylinder', 'lpg', 'indane', 'wifi', 'wi fi', 'broadband', 'internet',
      'airtel', 'jio', 'vi', 'vodafone', 'bsnl', 'act fibernet', 'recharge', 'mobile bill',
      'phone bill', 'dth', 'tata play', 'maintenance', 'society', 'emi', 'loan', 'insurance',
      'lic', 'premium', 'credit card bill', 'school fees', 'fees', 'tuition', 'bill',
    ],
  ],
  [
    'shopping',
    [
      'amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'tata cliq', 'croma',
      'reliance digital', 'decathlon', 'zara', 'h m', 'uniqlo', 'lifestyle', 'westside',
      'pantaloons', 'ikea', 'clothes', 'shirt', 'jeans', 'shoes', 'dress', 'kurta', 'saree',
      'watch', 'headphones', 'earphones', 'phone case', 'charger', 'gift', 'cosmetics',
      'makeup', 'skincare', 'shopping',
    ],
  ],
  [
    'fun',
    [
      'bookmyshow', 'pvr', 'inox', 'cinepolis', 'movie', 'movies', 'cinema', 'concert',
      'party', 'drinks', 'beer', 'pub', 'bar', 'club', 'bowling', 'gaming', 'steam',
      'playstation', 'game', 'trip', 'outing', 'picnic', 'holiday',
    ],
  ],
];

export function suggestCategory(description: string): Category | null {
  const text = ` ${description.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const [slug, words] of MERCHANTS) {
    if (words.some((w) => text.includes(` ${w} `))) return slug;
  }
  return null;
}
