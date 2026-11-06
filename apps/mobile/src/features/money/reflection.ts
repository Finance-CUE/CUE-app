import type { Category, Spend } from '@/features/money/types';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** This week (Monday on) vs last week, plus this week's biggest category. */
export function weeklyReflection(
  spends: Spend[],
  today: Date,
): { thisWeekPaise: number; lastWeekPaise: number; topCategory: Category | null; count: number } {
  const back = (today.getDay() + 6) % 7;
  const mon = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back));
  const prev = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back - 7));
  let thisWeekPaise = 0;
  let lastWeekPaise = 0;
  let count = 0;
  const byCat = new Map<Category, number>();
  for (const s of spends) {
    if (s.spent_on >= mon) {
      thisWeekPaise += s.amount_paise;
      count += 1;
      byCat.set(s.category, (byCat.get(s.category) ?? 0) + s.amount_paise);
    } else if (s.spent_on >= prev) {
      lastWeekPaise += s.amount_paise;
    }
  }
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  return { thisWeekPaise, lastWeekPaise, topCategory: top ? top[0] : null, count };
}
