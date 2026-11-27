import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, ROLES } from '@/features/money/palette';
import { newClientKey } from '../accounts';
import { PrimaryButton, SecondaryButton, TextField } from '../components/ui';
import { useCreateGroup, useUpdateGroup } from '../hooks';
import { FieldError, FormError, Sheet, useGuardedSubmit } from '../sheets/Sheet';
import type { GroupDetail } from '../types';

const ICONS = ['🏖️', '✈️', '🏠', '🍽️', '🎉', '🚗', '⚽', '🎓', '💼', '🏔️', '🎬', '🛒'];

/**
 * New group or Edit group: a name, an icon and the people in it (names only;
 * they don't need CUE). You are always in the group. Someone with expenses in
 * the group can't be removed.
 */
export function GroupFormSheet({
  visible,
  detail,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** Edit this group; null creates one. */
  detail: GroupDetail | null;
  onClose: () => void;
  onSaved: (text: string, id: string) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [people, setPeople] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [tried, setTried] = useState(false);
  const [clientKey, setClientKey] = useState(newClientKey);
  const create = useCreateGroup();
  const update = useUpdateGroup();
  const pending = create.isPending || update.isPending;
  const { run, error } = useGuardedSubmit(visible);

  useEffect(() => {
    if (!visible) return;
    setName(detail?.group.name ?? '');
    setIcon(detail?.group.icon ?? ICONS[0]);
    setPeople([]);
    setRemoving([]);
    setNewName('');
    setTried(false);
    setClientKey(newClientKey());
  }, [visible, detail]);

  const existing = (detail?.members ?? []).filter((m) => !m.removed && !m.is_me);
  const addPerson = () => {
    const n = newName.trim();
    if (!n) return;
    const taken = [...people, ...existing.map((m) => m.name), 'you'].some((x) => x.toLowerCase() === n.toLowerCase());
    if (!taken) setPeople([...people, n.slice(0, 40)]);
    setNewName('');
  };
  // A name typed but not yet added still counts.
  const typed = newName.trim();
  const finalPeople = typed && !people.some((p) => p.toLowerCase() === typed.toLowerCase()) ? [...people, typed.slice(0, 40)] : people;
  const problem = !name.trim()
    ? 'Give the group a name.'
    : !detail && finalPeople.length === 0
      ? 'Add at least one person.'
      : null;

  const save = () => {
    setTried(true);
    if (problem) return;
    void run(
      async () => {
        if (detail) {
          await update.mutateAsync({ id: detail.group.id, name: name.trim(), icon, add_members: finalPeople, remove_members: removing });
          onSaved(`${name.trim()} updated`, detail.group.id);
        } else {
          const g = await create.mutateAsync({ client_key: clientKey, name: name.trim(), icon, members: finalPeople });
          onSaved(`${icon} ${g.name} created`, g.id);
        }
      },
      onClose,
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={detail ? `Edit ${detail.group.name}` : 'New group'}
      subtitle="Names only: the others don't need CUE."
      tall
      footer={
        <>
          <FormError message={error} />
          <PrimaryButton label={detail ? 'Save' : 'Create group'} onPress={save} disabled={pending} loading={pending} />
        </>
      }>
      <TextField label="Group name" value={name} onChangeText={setName} placeholder="Goa Trip" maxLength={40} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ICONS.map((e) => (
          <TouchableOpacity
            key={e}
            accessibilityRole="button"
            accessibilityState={{ selected: e === icon }}
            onPress={() => setIcon(e)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: e === icon ? ROLES.accentSoft : COLORS.white,
              borderWidth: e === icon ? 2 : 1,
              borderColor: e === icon ? ROLES.accent : COLORS.cardBorder,
            }}>
            <Text style={{ fontSize: 20 }}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: COLORS.text }}>People</Text>
      <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.muted }}>You</Text>
      {existing.map((m) => {
        const gone = removing.includes(m.id);
        return (
          <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 }}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: gone ? COLORS.muted : COLORS.text, textDecorationLine: gone ? 'line-through' : 'none' }}>
              {m.name}
            </Text>
            <Text
              accessibilityRole="button"
              onPress={() => setRemoving(gone ? removing.filter((x) => x !== m.id) : [...removing, m.id])}
              style={{ fontFamily: FONT.semibold, fontSize: 13, color: gone ? ROLES.accent : COLORS.error, padding: 8 }}>
              {gone ? 'Keep' : 'Remove'}
            </Text>
          </View>
        );
      })}
      {people.map((p) => (
        <View key={p} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 }}>
          <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text }}>{p}</Text>
          <Text accessibilityRole="button" onPress={() => setPeople(people.filter((x) => x !== p))} style={{ fontFamily: FONT.semibold, fontSize: 13, color: COLORS.error, padding: 8 }}>
            Remove
          </Text>
        </View>
      ))}
      <TextField label="Add a person" value={newName} onChangeText={setNewName} placeholder="Megha" maxLength={40} />
      <SecondaryButton label="+ Add" onPress={addPerson} />
      <FieldError message={tried ? problem : undefined} />
    </Sheet>
  );
}
