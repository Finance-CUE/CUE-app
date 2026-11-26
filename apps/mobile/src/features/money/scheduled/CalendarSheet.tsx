import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, ROLES } from '@/features/money/palette';
import { ChevronIcon } from '../components/icons';
import { useDues } from '../hooks';
import { useRupees } from '../privacy';
import { CardError, Skeleton } from '../today/parts';
import { Sheet } from '../sheets/Sheet';
import type { Account, Occurrence } from '../types';
import { DueRow } from './DueRow';
import { calendarWeeks, monthBounds, monthTotal, shiftMonth } from './model';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]; // prettier-ignore
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * View calendar (spec 4.8): a month grid with each day's commitments as dots and
 * the month's total at the top. Paid and skipped ones show greyed.
 */
export function CalendarSheet({
  visible,
  today,
  accounts,
  onClose,
  onOpen,
  onPay,
  onSkip,
}: {
  visible: boolean;
  today: string;
  accounts: Map<string, Account>;
  onClose: () => void;
  onOpen: (o: Occurrence) => void;
  onPay: (o: Occurrence) => void;
  onSkip: (o: Occurrence) => void;
}) {
  const formatRupees = useRupees();
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [day, setDay] = useState<string | null>(null);
  const { start, end } = monthBounds(month);
  const dues = useDues(start, end, false, visible);
  const weeks = dues.data ? calendarWeeks(month, dues.data) : [];
  const picked = day && dues.data ? dues.data.filter((o) => o.due_on === day && o.kind !== 'income') : [];
  const go = (delta: number) => {
    setMonth(shiftMonth(month, delta));
    setDay(null);
  };
  const [y, m] = month.split('-').map(Number);

  return (
    <Sheet visible={visible} onClose={onClose} title="Coming up" tall>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => go(-1)} hitSlop={10} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
          <ChevronIcon left color={COLORS.text} size={20} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: COLORS.text }}>
            {MONTHS[m - 1]} {y}
          </Text>
          {dues.data ? (
            <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>
              {formatRupees(monthTotal(dues.data))} due this month
            </Text>
          ) : null}
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next month" onPress={() => go(1)} hitSlop={10} style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
          <ChevronIcon color={COLORS.text} size={20} />
        </TouchableOpacity>
      </View>

      {!dues.data ? (
        dues.isError ? (
          <CardError message="Couldn't load your dues." onRetry={() => void dues.refetch()} />
        ) : (
          <Skeleton lines={[{ width: '100%', height: 220 }]} />
        )
      ) : (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row' }}>
            {WEEK.map((w, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: FONT.semibold, fontSize: 11, color: COLORS.muted }}>
                {w}
              </Text>
            ))}
          </View>
          {weeks.map((week) => (
            <View key={week[0].iso} style={{ flexDirection: 'row' }}>
              {week.map((d) => {
                const selected = d.iso === day;
                const open = d.dues.some((o) => o.status === 'due');
                return (
                  <TouchableOpacity
                    key={d.iso}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.day}${d.dues.length ? `, ${d.dues.length} due` : ''}`}
                    disabled={!d.inMonth}
                    onPress={() => setDay(selected ? null : d.iso)}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 6, minHeight: 44 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? ROLES.accent : 'transparent',
                        borderWidth: d.iso === today && !selected ? 1 : 0,
                        borderColor: ROLES.accent,
                      }}>
                      <Text
                        style={{
                          fontFamily: FONT.medium,
                          fontSize: 14,
                          color: selected ? COLORS.white : d.inMonth ? COLORS.text : 'transparent',
                        }}>
                        {d.day}
                      </Text>
                    </View>
                    {d.inMonth && d.dues.length ? (
                      <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: open ? ROLES.attention : ROLES.inkFaint }} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {day ? (
        picked.length === 0 ? (
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>Nothing due that day.</Text>
        ) : (
          <View>
            {picked.map((o, i) => (
              <DueRow
                key={`${o.schedule_id}:${o.due_on}`}
                occurrence={o}
                accounts={accounts}
                today={today}
                onOpen={() => onOpen(o)}
                onPay={() => onPay(o)}
                onSkip={() => onSkip(o)}
                last={i === picked.length - 1}
              />
            ))}
          </View>
        )
      ) : (
        <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>Tap a day to see what is due.</Text>
      )}
    </Sheet>
  );
}
