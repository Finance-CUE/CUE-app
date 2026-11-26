import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, ROLES, TYPE } from '@/features/money/palette';
import { CalendarIcon, InIcon, OutIcon, SavingsIcon } from '../components/icons';
import { monthEyebrow, tiles, type Tile } from '../month/model';
import { useRupees } from '../privacy';
import type { MonthSummary } from '../types';
import { CardError, Eyebrow, Skeleton } from './parts';

const LOOK: Record<Tile['key'], { bg: string; ink: string; icon: (c: string) => ReactNode }> = {
  income: { bg: ROLES.positiveSoft, ink: ROLES.positiveInk, icon: (c) => <InIcon color={c} size={16} /> },
  expenses: { bg: ROLES.noteSoft, ink: ROLES.noteInk, icon: (c) => <OutIcon color={c} size={16} /> },
  savings: { bg: ROLES.accentSoft, ink: ROLES.accent, icon: (c) => <SavingsIcon color={c} size={16} /> },
  dues: { bg: ROLES.attentionSoft, ink: ROLES.attention, icon: (c) => <CalendarIcon color={c} size={16} /> },
};

/**
 * Block 3 (spec 4.4): "THIS MONTH · NOVEMBER" and four tappable tiles. An empty
 * Income or Expenses tile opens Quick Add on that type; otherwise each opens
 * its detail screen.
 */
export function ThisMonthCard({
  query,
  onOpen,
  onQuickAdd,
}: {
  query: UseQueryResult<MonthSummary>;
  onOpen: (key: Tile['key']) => void;
  onQuickAdd: (kind: 'income' | 'expense') => void;
}) {
  const formatRupees = useRupees();
  const m = query.data;
  return (
    <View style={{ gap: 10 }}>
      <Eyebrow>{m ? monthEyebrow(m.month) : 'THIS MONTH'}</Eyebrow>
      {!m ? (
        <View style={{ backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.cardBorder, padding: 16 }}>
          {query.isError ? (
            <CardError message="Couldn't load this month." onRetry={() => void query.refetch()} />
          ) : (
            <Skeleton lines={[{ width: '100%', height: 60 }, { width: '100%', height: 60 }]} />
          )}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {tiles(m, formatRupees).map((t) => (
            <TileView
              key={t.key}
              tile={t}
              onPress={() => (t.quickAdd ? onQuickAdd(t.quickAdd) : onOpen(t.key))}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function TileView({ tile, onPress }: { tile: Tile; onPress: () => void }) {
  const look = LOOK[tile.key];
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${tile.label}, ${tile.amount}. ${tile.sub}`}
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        // Two per row with the 10px gap between them.
        flexBasis: '47%',
        flexGrow: 1,
        minHeight: 118,
        backgroundColor: COLORS.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        padding: 16,
        gap: 6,
      }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: look.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {look.icon(look.ink)}
      </View>
      <Text style={{ ...TYPE.eyebrow, color: COLORS.muted }}>{tile.label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...TYPE.cardAmount, color: COLORS.text }}>
        {tile.amount}
      </Text>
      <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: COLORS.muted }}>{tile.sub}</Text>
    </TouchableOpacity>
  );
}
