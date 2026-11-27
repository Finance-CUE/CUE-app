import type { UseQueryResult } from '@tanstack/react-query';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, ROLES, SHAPE } from '@/features/money/palette';
import { PlusIcon, SavingsIcon } from '../components/icons';
import { JAR_CARD, JarCard } from '../jars/JarCard';
import { headerLine } from '../jars/model';
import { useRupees } from '../privacy';
import type { Jar, Jars } from '../types';
import { CardError, EmptyState, Eyebrow, Skeleton } from './parts';

/**
 * Block 7, "MY GOAL JARS" (spec 4.7): "₹57,000 set aside across 3 jars" and a
 * horizontal carousel of jar cards ending in "+ Create new jar".
 */
export function GoalJarsCard({
  query,
  onOpen,
  onCreate,
  onViewAll,
}: {
  query: UseQueryResult<Jars>;
  onOpen: (jar: Jar) => void;
  onCreate: () => void;
  onViewAll: () => void;
}) {
  const formatRupees = useRupees();
  const data = query.data;
  const title = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Eyebrow>MY GOAL JARS</Eyebrow>
      {data && data.count > 0 ? (
        <TouchableOpacity accessibilityRole="button" onPress={onViewAll} hitSlop={10} style={{ minHeight: 32, justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: ROLES.accent }}>View all</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (!data) {
    return (
      <View style={{ gap: 10 }}>
        {title}
        <View style={{ backgroundColor: COLORS.card, borderRadius: SHAPE.cardRadius, borderWidth: 1, borderColor: COLORS.cardBorder, padding: SHAPE.cardPadding }}>
          {query.isError ? (
            <CardError message="Couldn't load your jars." onRetry={() => void query.refetch()} />
          ) : (
            <Skeleton lines={[{ width: '100%', height: 110 }]} />
          )}
        </View>
      </View>
    );
  }

  if (data.count === 0) {
    return (
      <View style={{ gap: 10 }}>
        {title}
        <View style={{ backgroundColor: COLORS.card, borderRadius: SHAPE.cardRadius, borderWidth: 1, borderColor: COLORS.cardBorder, padding: SHAPE.cardPadding }}>
          <EmptyState
            icon={<SavingsIcon color={ROLES.accent} size={48} />}
            text="Every big goal starts somewhere. Create your first jar."
            action="Create jar"
            onAction={onCreate}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {title}
      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.text, marginTop: -4 }}>
        {headerLine(data.total_saved_paise, data.count, formatRupees)}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Bleed to the screen edge so cards scroll under the side padding.
        style={{ marginHorizontal: -SHAPE.sidePadding }}
        contentContainerStyle={{ paddingHorizontal: SHAPE.sidePadding, gap: JAR_CARD.gap }}>
        {data.jars.map((j) => (
          <JarCard key={j.id} jar={j} onPress={() => onOpen(j)} />
        ))}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Create new jar"
          onPress={onCreate}
          activeOpacity={0.75}
          style={{
            width: JAR_CARD.width,
            height: JAR_CARD.height,
            borderRadius: 18,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: ROLES.accent,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
          <PlusIcon color={ROLES.accent} size={22} />
          <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: ROLES.accent }}>Create new jar</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
