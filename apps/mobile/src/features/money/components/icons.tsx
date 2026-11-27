import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconProps = { color: string; size?: number };
type CategorySlug = 'food' | 'groceries' | 'transport' | 'shopping' | 'bills' | 'subscription' | 'fun' | 'other';

function Icon({ color, size = 22, children }: IconProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export const TodayIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="4" y="5" width="16" height="15" rx="3" />
    <Path d="M4 10h16M8 3v4M16 3v4" />
  </Icon>
);

/** Amounts shown; tapping hides them. */
export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <Circle cx="12" cy="12" r="3" />
  </Icon>
);

/** Amounts hidden; tapping shows them. */
export const EyeOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6" />
    <Path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </Icon>
);

export const InsightsIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 20V11M12 20V5M19 20v-6" />
  </Icon>
);

export const KhataIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM9 9h6M9 13h6" />
  </Icon>
);

export const YouIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="8" r="4" />
    <Path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 5v14M5 12h14" />
  </Icon>
);

export const RupeeIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M7 5h10M7 9.5h10M7 5c5 0 6 5-1 5l6 9" />
  </Icon>
);

export const SwapIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 8h14l-3-3M20 16H6l3 3" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="8" />
    <Path d="M12 8v4l3 2" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 4v4M16 4v4" />
  </Icon>
);

/** A wallet: accounts and the "Where does your money stand?" empty state. */
export const WalletIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 7a2 2 0 0 1 2-2h11v4M4 7v10a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H6a2 2 0 0 1-2-2zM16 14h1" />
  </Icon>
);

const CATEGORY_PATHS: Record<CategorySlug, string> = {
  food: 'M7 3v7a2 2 0 0 0 4 0V3M9 10v11M17 3c-2 2-3 5-3 8h3v10',
  groceries: 'M3 4h3l2 11h10l2-8H7M10 20h.01M17 20h.01',
  transport: 'M5 16V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8H5zM5 12h14M8 19v-3M16 19v-3',
  shopping: 'M6 8h12l1 12H5L6 8zM9 8a3 3 0 0 1 6 0',
  bills: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
  subscription: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  fun: 'M12 3l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8L6.7 19.6l1-6L3.3 9.4l6-.9L12 3z',
  other: 'M5 12h.01M12 12h.01M19 12h.01',
};

export function CategoryIcon({ category, color, size }: { category: string; color: string; size?: number }) {
  const d = CATEGORY_PATHS[category as CategorySlug] ?? CATEGORY_PATHS.other;
  return (
    <Icon color={color} size={size}>
      <Path d={d} />
    </Icon>
  );
}

/** Money in (Income tile). */
export const InIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 4v13M6 11l6 6 6-6M5 20h14" />
  </Icon>
);

/** Money out (Expenses tile). */
export const OutIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 17V4M6 10l6-6 6 6M5 20h14" />
  </Icon>
);

/** Savings tile. */
export const SavingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 11a7 6 0 0 1 13-3h2v4l-2 1v3h-3v2h-3v-2H8v2H5v-3a6 6 0 0 1-1-4zM15 10h.01" />
  </Icon>
);

/** Rent. */
export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 11l8-7 8 7v9H4v-9zM10 20v-5h4v5" />
  </Icon>
);

/** EMI or loan. */
export const LoanIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="3" y="6" width="18" height="13" rx="2" />
    <Path d="M3 10h18M7 15h4" />
  </Icon>
);

/** Reminder on. */
export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4" />
  </Icon>
);

export const ChevronIcon = (p: IconProps & { left?: boolean }) => (
  <Icon {...p}>
    <Path d={p.left ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </Icon>
);

/** The icon for a scheduled item's type (spec 4.8). */
export function ScheduleIcon({ kind, color, size }: { kind: string; color: string; size?: number }) {
  if (kind === 'rent') return <HomeIcon color={color} size={size} />;
  if (kind === 'emi') return <LoanIcon color={color} size={size} />;
  if (kind === 'income') return <InIcon color={color} size={size} />;
  return <CategoryIcon category={kind === 'subscription' ? 'subscription' : kind === 'bill' ? 'bills' : 'other'} color={color} size={size} />;
}

/** Ask CUE (spec section 3): a sparkle in the header, Quick Add and the note. */
export const SparkleIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
  </Icon>
);
