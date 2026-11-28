import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, useDashboardTheme } from '@/features/money/palette';
import { type Bank, bankBySlug, searchBanks } from '../banks';
import { TextField } from '../components/ui';

/**
 * The searchable bank dropdown (spec 4.5): type to filter, tap to pick.
 * Once picked it collapses to the bank's name with "Change".
 */
export function BankPicker({ value, onChange }: { value: string | null; onChange: (bank: Bank | null) => void }) {
  const theme = useDashboardTheme();
  const [query, setQuery] = useState('');
  const picked = bankBySlug(value);

  if (picked) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Badge text={picked.short} />
          <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.text }}>{picked.name}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Change bank" onPress={() => onChange(null)} hitSlop={10}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: theme.accentText }}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <TextField label="Bank" value={query} onChangeText={setQuery} placeholder="Search: HDFC, SBI, Kotak…" maxLength={40} />
      {searchBanks(query).map((b) => (
        <TouchableOpacity
          key={b.slug}
          accessibilityRole="button"
          onPress={() => {
            setQuery('');
            onChange(b);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
          <Badge text={b.short} />
          <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.text }}>{b.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Stands in for the bank's logo until logo files are added. */
function Badge({ text }: { text: string }) {
  const theme = useDashboardTheme();
  return (
    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: theme.accentText }}>{text[0]}</Text>
    </View>
  );
}
