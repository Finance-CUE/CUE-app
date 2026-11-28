import type { UseQueryResult } from '@tanstack/react-query';
import { Text, TouchableOpacity, View } from 'react-native';

import { FONT, ROLES } from '@/features/money/palette';
import { CalendarIcon } from '../components/icons';
import { DueRow } from '../scheduled/DueRow';
import { comingUp, dayMonth, dueOn } from '../scheduled/model';
import type { Account, Occurrence } from '../types';
import { CardError, EmptyState, Eyebrow, Skeleton, TodayCard } from './parts';

/**
 * Block 8, "COMING UP" (spec 4.8): the next four unpaid commitments in the next
 * 30 days, soonest first, with overdue ones ("Check") on top. With a future date
 * selected on the strip it shows only what is due that day (suggestion 6).
 */
export function ComingUpCard({
  query,
  today,
  selected,
  accounts,
  onOpen,
  onPay,
  onSkip,
  onCalendar,
  onAdd,
  onViewAll,
}: {
  query: UseQueryResult<Occurrence[]>;
  today: string;
  selected: string;
  accounts: Map<string, Account>;
  onOpen: (o: Occurrence) => void;
  onPay: (o: Occurrence) => void;
  onSkip: (o: Occurrence) => void;
  onCalendar: () => void;
  onAdd: () => void;
  onViewAll: () => void;
}) {
  const future = selected > today;
  const right = (
    <TouchableOpacity accessibilityRole="button" onPress={onCalendar} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 }}>
      <CalendarIcon color={ROLES.accent} size={16} />
      <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: ROLES.accent }}>View calendar</Text>
    </TouchableOpacity>
  );
  const title = <Eyebrow>{future ? `DUE ${dayMonth(selected).toUpperCase()}` : 'COMING UP'}</Eyebrow>;

  if (!query.data) {
    return (
      <TodayCard title={title} right={right}>
        {query.isError ? (
          <CardError message="Couldn't load what's coming up." onRetry={() => void query.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '100%', height: 40 }, { width: '100%', height: 40 }]} />
        )}
      </TodayCard>
    );
  }

  const all = query.data;
  const rows = future ? dueOn(all, selected) : comingUp(all, today);
  const more = future ? 0 : comingUp(all, today, 99).length - rows.length;
  return (
    <TodayCard title={title} right={right}>
      {rows.length === 0 ? (
        future ? (
          <EmptyState text={`Nothing due on ${dayMonth(selected)}.`} action="Add a subscription or bill" onAction={onAdd} />
        ) : (
          <EmptyState text="Nothing due in the next 30 days." action="Add a subscription or bill" onAction={onAdd} />
        )
      ) : (
        <View>
          {rows.map((o, i) => (
            <DueRow
              key={`${o.schedule_id}:${o.due_on}`}
              occurrence={o}
              accounts={accounts}
              today={today}
              onOpen={() => onOpen(o)}
              onPay={() => onPay(o)}
              onSkip={() => onSkip(o)}
              last={i === rows.length - 1}
            />
          ))}
        </View>
      )}
      {rows.length > 0 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <TouchableOpacity accessibilityRole="button" onPress={onAdd} hitSlop={8} style={{ minHeight: 36, justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: ROLES.accent }}>+ Add</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={onViewAll} hitSlop={8} style={{ minHeight: 36, justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: ROLES.accent }}>
              {more > 0 ? `View all (${more + rows.length})` : 'View all'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {rows.length > 0 ? (
        <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: ROLES.inkSoft }}>Swipe a row left to mark it paid or skip it.</Text>
      ) : null}
    </TodayCard>
  );
}
