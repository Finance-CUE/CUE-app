import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { PanResponder, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, HEADING_FONT } from '@/features/assessment/theme';
import { useAuthStore } from '@/features/auth/store';
import { useArchetypeTheme } from '@/features/theme/useArchetypeTheme';
import { CalendarIcon } from '../components/icons';
import { greeting, monthRange, toISODate, weekDays, weekStartBack } from '../dates';
import { useTransactions } from '../hooks';
import { Sheet } from '../sheets/Sheet';
import { helloLine, initials, shortDay } from './model';

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MAX_WEEKS_BACK = 52;

/** Dates (ISO) in start..end that have at least one entry, for the 4px dots. */
function useEntryDates(start: string, end: string): Set<string> {
  const txns = useTransactions(start, end).data ?? [];
  return new Set(txns.filter((t) => t.type !== 'opening').map((t) => t.occurred_on));
}

/**
 * Spec 4.1: greeting, "Hello, Asha.", avatar to the You tab, a seven-day strip
 * (swipe or arrows move a week), Calendar and Today chips. Future dates stay
 * closed until Coming up (P1) can show what is due on them.
 */
export function TodayHeader({
  today,
  selected,
  weeksBack,
  onSelect,
  onWeeksBack,
  onSearch,
}: {
  today: Date;
  selected: string;
  weeksBack: number;
  onSelect: (iso: string) => void;
  onWeeksBack: (weeksBack: number) => void;
  /** Opens Transaction history with the search field focused. */
  onSearch: () => void;
}) {
  const router = useRouter();
  const theme = useArchetypeTheme();
  const fullName = useAuthStore((s) => s.user?.full_name)?.trim() ?? '';
  const [calendar, setCalendar] = useState(false);
  const todayISO = toISODate(today);
  const days = weekDays(weekStartBack(today, weeksBack));
  const dots = useEntryDates(toISODate(days[0]), toISODate(days[6]));

  const move = (delta: number) => onWeeksBack(Math.min(MAX_WEEKS_BACK, Math.max(0, weeksBack + delta)));
  // The swipe handler is made once; it reads the latest `move` through this ref.
  const moveRef = useRef(move);
  useEffect(() => {
    moveRef.current = move;
  });
  // A horizontal swipe on the strip moves one week: right = earlier, left = later.
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_, g) => {
        if (g.dx > 40) moveRef.current(1);
        else if (g.dx < -40) moveRef.current(-1);
      },
    }),
  ).current;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12.5, color: COLORS.muted }}>
            {greeting(new Date()) /* needs the hour; useToday only tracks the day */},
          </Text>
          <Text style={{ fontSize: 20, color: COLORS.text, fontFamily: HEADING_FONT, fontWeight: '600' }}>
            {helloLine(fullName)}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={fullName ? `Your profile, ${fullName}` : 'Your profile'}
          onPress={() => router.navigate('/you')}
          activeOpacity={0.7}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.accentText }}>{initials(fullName)}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center' }} {...swipe.panHandlers}>
        <Arrow label="Previous week" glyph="‹" disabled={weeksBack >= MAX_WEEKS_BACK} onPress={() => move(1)} />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {days.map((d, i) => {
            const iso = toISODate(d);
            const isSelected = iso === selected;
            const future = iso > todayISO;
            return (
              <TouchableOpacity
                key={iso}
                accessibilityRole="button"
                accessibilityLabel={`${shortDay(iso)}${dots.has(iso) ? ', has entries' : ''}`}
                accessibilityState={{ selected: isSelected, disabled: future }}
                disabled={future}
                onPress={() => onSelect(iso)}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 6,
                  minHeight: 56,
                  borderRadius: 14,
                  backgroundColor: isSelected ? theme.accent : 'transparent',
                  opacity: future ? 0.35 : 1,
                }}>
                <Text style={{ fontSize: 11, color: isSelected ? COLORS.white : COLORS.muted }}>{DAY[i]}</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: isSelected ? COLORS.white : COLORS.text }}>
                  {d.getDate()}
                </Text>
                <View style={{ flexDirection: 'row', gap: 3, height: 5, marginTop: 2 }}>
                  {iso === todayISO ? <Dot color={isSelected ? COLORS.white : theme.accent} /> : null}
                  {dots.has(iso) ? <Dot color={isSelected ? COLORS.white : COLORS.muted} /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <Arrow label="Next week" glyph="›" disabled={weeksBack === 0} onPress={() => move(-1)} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <IconChip label="Calendar" onPress={() => setCalendar(true)} icon={<CalendarIcon color={theme.accentText} size={16} />} />
        {selected !== todayISO ? (
          <IconChip
            label="Today"
            onPress={() => {
              onWeeksBack(0);
              onSelect(todayISO);
            }}
          />
        ) : null}
        <IconChip label="Search" onPress={onSearch} />
      </View>

      <CalendarSheet
        visible={calendar}
        today={today}
        selected={selected}
        onClose={() => setCalendar(false)}
        onPick={(iso) => {
          setCalendar(false);
          const weeks = Math.round(
            (weekStartBack(today, 0).getTime() - weekStartBack(new Date(`${iso}T12:00:00`), 0).getTime()) / (7 * 86_400_000),
          );
          onWeeksBack(Math.min(MAX_WEEKS_BACK, Math.max(0, weeks)));
          onSelect(iso);
        }}
      />
    </View>
  );
}

/** "Viewing Tue 11 Nov · Back to today": sticky under the header on a past date. */
export function PastDateBanner({ selected, onBack }: { selected: string; onBack: () => void }) {
  const theme = useArchetypeTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Viewing ${shortDay(selected)}. Back to today`}
      onPress={onBack}
      activeOpacity={0.8}
      style={{ alignSelf: 'center', minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: theme.tint, justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, color: theme.accentText }}>
        Viewing {shortDay(selected)} · <Text style={{ fontWeight: '700' }}>Back to today</Text>
      </Text>
    </TouchableOpacity>
  );
}

function Dot({ color }: { color: string }) {
  return <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />;
}

function Arrow({ label, glyph, disabled, onPress }: { label: string; glyph: string; disabled: boolean; onPress: () => void }) {
  const theme = useArchetypeTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ width: 28, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
      <Text style={{ fontSize: 22, color: theme.accentText, fontWeight: '600' }}>{glyph}</Text>
    </TouchableOpacity>
  );
}

function IconChip({ label, onPress, icon }: { label: string; onPress: () => void; icon?: ReactNode }) {
  const theme = useArchetypeTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={6}
      style={{
        height: 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: theme.tint,
      }}>
      {icon}
      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accentText }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Month sheet with the same dots. Picking any past date selects it and closes the sheet. */
function CalendarSheet({
  visible,
  today,
  selected,
  onClose,
  onPick,
}: {
  visible: boolean;
  today: Date;
  selected: string;
  onClose: () => void;
  onPick: (iso: string) => void;
}) {
  const theme = useArchetypeTheme();
  const [monthsBack, setMonthsBack] = useState(0);
  const first = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
  const { start, end } = monthRange(first);
  const dots = useEntryDates(start, end);
  const todayISO = toISODate(today);
  const lead = (first.getDay() + 6) % 7; // Monday-first grid
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={`${MONTHS[first.getMonth()]} ${first.getFullYear()}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Arrow label="Previous month" glyph="‹" disabled={monthsBack >= 12} onPress={() => setMonthsBack(monthsBack + 1)} />
        <Arrow label="Next month" glyph="›" disabled={monthsBack === 0} onPress={() => setMonthsBack(monthsBack - 1)} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {DAY.map((d) => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: COLORS.muted }}>
            {d}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          if (!d) return <View key={`lead-${i}`} style={{ width: `${100 / 7}%`, height: 48 }} />;
          const iso = toISODate(d);
          const future = iso > todayISO;
          const isSelected = iso === selected;
          return (
            <TouchableOpacity
              key={iso}
              accessibilityRole="button"
              accessibilityLabel={shortDay(iso)}
              accessibilityState={{ selected: isSelected, disabled: future }}
              disabled={future}
              onPress={() => onPick(iso)}
              style={{ width: `${100 / 7}%`, height: 48, alignItems: 'center', justifyContent: 'center', opacity: future ? 0.35 : 1 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? theme.accent : 'transparent',
                }}>
                <Text style={{ fontSize: 14, fontWeight: iso === todayISO ? '700' : '500', color: isSelected ? COLORS.white : COLORS.text }}>
                  {d.getDate()}
                </Text>
              </View>
              <View style={{ height: 4, marginTop: 1 }}>
                {dots.has(iso) ? <Dot color={COLORS.muted} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </Sheet>
  );
}
