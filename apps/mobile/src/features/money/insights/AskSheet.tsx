import { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, ROLES } from '@/features/money/palette';
import { toErrorMessage } from '@/lib/api';
import { PrimaryButton } from '../components/ui';
import { toISODate } from '../dates';
import { useAskCue } from '../hooks';
import { useRupees } from '../privacy';
import { FormError, Sheet } from '../sheets/Sheet';
import type { AskDraft, AskReply } from '../types';
import { fillAmounts } from './model';

const STARTERS = [
  'How much did I spend on food this month?',
  'Who owes me money?',
  "What's due this week?",
  'I spent ₹250 on lunch today',
];

/**
 * Ask CUE (spec section 3): answers from your own data, or fills a form from a
 * sentence ("I spent ₹500 on dinner yesterday using HDFC") that waits for you to
 * tap Save. It reads with rules, not AI, and never saves anything by itself.
 */
export function AskSheet({
  visible,
  initialQuery,
  onClose,
  onDraft,
}: {
  visible: boolean;
  /** A question to ask straight away (from a note's Ask CUE). */
  initialQuery: string | null;
  onClose: () => void;
  onDraft: (draft: AskDraft) => void;
}) {
  const formatRupees = useRupees();
  const ask = useAskCue();
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState<AskReply | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuery(text);
    setError(null);
    try {
      setReply(await ask.mutateAsync({ query: text, today: toISODate(new Date()) }));
    } catch (err) {
      setError(toErrorMessage(err, "CUE couldn't answer right now. Please try again."));
    }
  };

  useEffect(() => {
    if (!visible) return;
    setReply(null);
    setError(null);
    setQuery(initialQuery ?? '');
    if (initialQuery) void send(initialQuery);
    // Only when the sheet opens.
  }, [visible, initialQuery]);

  const chips = reply?.suggestions.length ? reply.suggestions : reply ? [] : STARTERS;
  return (
    <Sheet visible={visible} onClose={onClose} title="Ask CUE" subtitle="About your money, from your own entries." tall>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          backgroundColor: COLORS.white,
          paddingLeft: 14,
        }}>
        <TextInput
          accessibilityLabel="Ask CUE"
          autoFocus={!initialQuery}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void send(query)}
          returnKeyType="send"
          placeholder="Ask, or tell CUE what happened"
          placeholderTextColor={COLORS.muted}
          maxLength={200}
          style={{ flex: 1, minHeight: 48, fontFamily: FONT.medium, fontSize: 15, color: COLORS.text }}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={() => void send(query)}
          disabled={ask.isPending}
          style={{ minWidth: 56, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: ROLES.accent }}>{ask.isPending ? '…' : 'Ask'}</Text>
        </TouchableOpacity>
      </View>
      <FormError message={error} />

      {reply ? (
        <View style={{ backgroundColor: ROLES.noteSoft, borderRadius: 14, padding: 14, gap: 6 }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14.5, color: COLORS.text }}>{fillAmounts(reply.text, formatRupees)}</Text>
          {reply.lines.map((l, i) => (
            <Text key={`${l}:${i}`} style={{ fontFamily: FONT.regular, fontSize: 13, color: ROLES.noteInk }}>
              {fillAmounts(l, formatRupees)}
            </Text>
          ))}
        </View>
      ) : null}
      {reply?.draft ? (
        <PrimaryButton label="Check and save" onPress={() => reply.draft && onDraft(reply.draft)} />
      ) : null}

      {chips.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>{reply ? 'Try' : 'For example'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {chips.map((s) => (
              <TouchableOpacity
                key={s}
                accessibilityRole="button"
                onPress={() => void send(s)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: ROLES.accentSoft }}>
                <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: ROLES.accent }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.muted }}>
        CUE reads your question with simple rules and answers only from your entries. Nothing is saved until you tap Save.
      </Text>
    </Sheet>
  );
}
