import { Text, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { COLORS, FONT, ROLES, SHAPE, TYPE } from '@/features/money/palette';
import { ScheduleIcon } from '../components/icons';
import { useRupees } from '../privacy';
import type { Account, Occurrence } from '../types';
import { metaLine, spokenDue, statusPill, type Pill } from './model';

/**
 * One Coming up row (spec 4.8): type icon, name, "HDFC · Monthly · 🔔", amount
 * and the status pill. Swipe left for Mark paid and Skip; tap for details.
 * Screen readers get both actions without swiping.
 */
export function DueRow({
  occurrence: o,
  accounts,
  today,
  onOpen,
  onPay,
  onSkip,
  last,
}: {
  occurrence: Occurrence;
  accounts: Map<string, Account>;
  today: string;
  onOpen: () => void;
  onPay: () => void;
  onSkip: () => void;
  last?: boolean;
}) {
  const formatRupees = useRupees();
  const greyed = o.status !== 'due';
  const row = (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={spokenDue(o, formatRupees, today)}
      accessibilityActions={greyed ? [] : [{ name: 'pay', label: 'Mark paid' }, { name: 'skip', label: 'Skip' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'pay' ? onPay() : onSkip())}
      onPress={onOpen}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 9,
        minHeight: 56,
        backgroundColor: COLORS.card,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: COLORS.cardBorder,
        opacity: greyed ? 0.55 : 1,
      }}>
      <View
        style={{
          width: SHAPE.iconTile,
          height: SHAPE.iconTile,
          borderRadius: SHAPE.iconRadius,
          backgroundColor: ROLES.attentionSoft,
          borderWidth: 1,
          borderColor: ROLES.line,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <ScheduleIcon kind={o.kind} color={ROLES.attention} size={18} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.semibold, fontSize: 13, color: COLORS.text }}>
          {o.name}
        </Text>
        <Text numberOfLines={1} style={{ ...TYPE.meta, color: COLORS.muted }}>
          {metaLine(o, accounts)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ ...TYPE.rowAmount, color: COLORS.text }}>{formatRupees(o.amount_paise)}</Text>
        {greyed ? (
          <Text style={{ ...TYPE.meta, color: COLORS.muted }}>{o.status === 'paid' ? 'Paid' : 'Skipped'}</Text>
        ) : (
          <StatusPill pill={statusPill(o.due_on, today)} />
        )}
      </View>
    </TouchableOpacity>
  );
  if (greyed) return row;
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_p, _t, methods) => (
        <View style={{ flexDirection: 'row' }}>
          <Action
            label="Mark paid"
            bg={ROLES.positiveSoft}
            ink={ROLES.positiveInk}
            onPress={() => {
              methods.close();
              onPay();
            }}
          />
          <Action
            label="Skip"
            bg={ROLES.line}
            ink={COLORS.text}
            onPress={() => {
              methods.close();
              onSkip();
            }}
          />
        </View>
      )}>
      {row}
    </ReanimatedSwipeable>
  );
}

function Action({ label, bg, ink, onPress }: { label: string; bg: string; ink: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={{ width: 84, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: ink }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Upcoming: line outline. Due soon: attention-soft. Today: attention. Check: attention outline. */
export function StatusPill({ pill }: { pill: Pill }) {
  const look = {
    line: { bg: 'transparent', border: ROLES.line, ink: COLORS.muted },
    soft: { bg: ROLES.attentionSoft, border: ROLES.attentionSoft, ink: ROLES.attention },
    solid: { bg: ROLES.attention, border: ROLES.attention, ink: COLORS.white },
    check: { bg: 'transparent', border: ROLES.attention, ink: ROLES.attention },
  }[pill.tone];
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: look.border,
        backgroundColor: look.bg,
      }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 11, color: look.ink }}>{pill.label}</Text>
    </View>
  );
}
