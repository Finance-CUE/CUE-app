import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, ROLES, useDashboardTheme } from '@/features/money/palette';
import { toISODate } from '../dates';
import { useDismissNote } from '../hooks';
import { noteCopy, understandLines } from '../insights/model';
import { useRupees } from '../privacy';
import { Sheet } from '../sheets/Sheet';
import type { Note, NoteResponse } from '../types';

/**
 * Block 4, A note from CUE (spec 4.10): note-soft, radius 18, no border. One
 * observation and a supporting line, then Understand this, View insights and
 * Ask CUE. The small × dismisses it and the next one shows. Before about a week
 * of logging it says so instead of inventing an observation.
 */
export function NoteCard({
  query,
  onInsights,
  onAsk,
}: {
  query?: UseQueryResult<NoteResponse>;
  onInsights?: (note: Note) => void;
  onAsk?: (note: Note | null) => void;
}) {
  const formatRupees = useRupees();
  const theme = useDashboardTheme();
  const dismiss = useDismissNote();
  const [open, setOpen] = useState(false);
  const data = query?.data;
  const note = data?.note ?? null;
  const shell = { backgroundColor: ROLES.noteSoft, borderRadius: 18, padding: 16, gap: 6 } as const;
  const eyebrow = (
    <Text style={{ fontFamily: FONT.semibold, fontSize: 11.5, letterSpacing: 0.92, color: ROLES.noteInk }}>A NOTE FROM CUE</Text>
  );

  if (!note) {
    // Getting to know you, a quiet day with nothing to say, or still loading: never an invented note.
    const quiet = data && !data.getting_to_know;
    return (
      <View accessible style={shell}>
        {eyebrow}
        <Text style={{ fontFamily: FONT.semibold, fontSize: 13.3, color: COLORS.text }}>
          {quiet ? 'Nothing needs your attention today.' : 'CUE is getting to know your patterns.'}
        </Text>
        <Text style={{ fontFamily: FONT.regular, fontSize: 12.8, color: ROLES.noteInk }}>
          {quiet ? 'CUE will point things out as they come up.' : 'Your first note arrives after a week of logging.'}
        </Text>
        {onAsk ? <Action label="Ask CUE" onPress={() => onAsk(null)} /> : null}
      </View>
    );
  }

  const copy = noteCopy(note, formatRupees);
  const why = understandLines(note, formatRupees);
  return (
    <View style={shell}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {eyebrow}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Dismiss this note"
          onPress={() => void dismiss.mutateAsync({ key: note.key, today: toISODate(new Date()) }).catch(() => undefined)}
          hitSlop={12}
          style={{ minWidth: 32, minHeight: 32, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 16, color: ROLES.noteInk }}>×</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 13.3, color: COLORS.text }}>{copy.title}</Text>
      <Text style={{ fontFamily: FONT.regular, fontSize: 12.8, color: ROLES.noteInk }}>{copy.line}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 }}>
        <Action label="Understand this" onPress={() => setOpen(true)} />
        {onInsights ? <Action label="View insights" onPress={() => onInsights(note)} /> : null}
        {onAsk ? <Action label="Ask CUE" onPress={() => onAsk(note)} /> : null}
      </View>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Understand this" subtitle={copy.title}>
        <View style={{ gap: 6 }}>
          {why.numbers.map((n) => (
            <Text key={n} style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text }}>
              {n}
            </Text>
          ))}
        </View>
        {why.entries.length ? (
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: COLORS.muted }}>
              {note.kind === 'category_up' ? 'What drove it' : note.kind === 'streak' ? 'Week by week' : 'The details'}
            </Text>
            {why.entries.map((e, i) => (
              <Text key={`${e}:${i}`} style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text }}>
                {e}
              </Text>
            ))}
          </View>
        ) : null}
        {theme.slug && (note.kind === 'category_up' || note.kind === 'streak') ? (
          <View style={{ backgroundColor: ROLES.noteSoft, borderRadius: 12, padding: 12 }}>
            <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: ROLES.noteInk }}>{theme.belief}</Text>
          </View>
        ) : null}
        <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
          Every note comes from your own entries. CUE notices; it doesn't judge.
        </Text>
      </Sheet>
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: ROLES.noteInk, textDecorationLine: 'underline' }}>{label}</Text>
    </TouchableOpacity>
  );
}
