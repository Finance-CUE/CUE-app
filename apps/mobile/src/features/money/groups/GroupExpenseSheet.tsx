import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, ROLES, useDashboardTheme } from '@/features/money/palette';
import { newClientKey } from '../accounts';
import { ChipRow, PrimaryButton, TextField } from '../components/ui';
import { daysBefore, parseDisplayDate, toDisplayDate, toISODate } from '../dates';
import { paiseToInput, parseRupeesToPaise } from '../format';
import { useAddGroupExpense, useEditGroupExpense, useGroup } from '../hooks';
import { useRupees } from '../privacy';
import { EXPENSE_CATEGORIES, suggestExpenseCategory } from '../quickAdd/model';
import { FieldError, FormError, Sheet, useGuardedSubmit } from '../sheets/Sheet';
import type { Account, Group, GroupExpense } from '../types';
import { equalShares, exactLeft, validateExpense } from './model';

type When = 'today' | 'yesterday' | 'other';
const WHEN: { value: When; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'other', label: 'Another day' },
];

/**
 * Quick Add Group Expense (spec section 5): group, description, amount, who
 * paid, the people sharing it and how (equally or by amounts); category, date
 * and notes behind More options. Your share counts as an expense; what others
 * owe you is a receivable, what you owe a liability. Editing recalculates every
 * member's balance.
 */
export function GroupExpenseSheet({
  visible,
  groupId: presetGroup,
  expense,
  groups,
  accounts,
  onClose,
  onSaved,
  onDelete,
}: {
  visible: boolean;
  groupId: string | null;
  /** Edit this expense (in presetGroup); null adds one. */
  expense: GroupExpense | null;
  groups: Group[];
  accounts: Account[];
  onClose: () => void;
  onSaved: (text: string) => void;
  onDelete?: (e: GroupExpense) => void;
}) {
  const formatRupees = useRupees();
  const theme = useDashboardTheme();
  const open = accounts.filter((a) => !a.archived);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [split, setSplit] = useState<'equal' | 'exact'>('equal');
  const [participants, setParticipants] = useState<string[]>([]);
  const [shareText, setShareText] = useState<Record<string, string>>({});
  const [accountId, setAccountId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [when, setWhen] = useState<When>('today');
  const [otherDate, setOtherDate] = useState('');
  const [note, setNote] = useState('');
  const [more, setMore] = useState(false);
  const [tried, setTried] = useState(false);
  const [clientKey, setClientKey] = useState(newClientKey);
  const add = useAddGroupExpense();
  const edit = useEditGroupExpense();
  const pending = add.isPending || edit.isPending;
  const detail = useGroup(visible ? groupId : null).data;
  const { run, error } = useGuardedSubmit(visible, 'Not saved. Check your connection and try again.');
  const todayISO = toISODate(new Date());
  const live = (detail?.members ?? []).filter((m) => !m.removed);
  const me = detail?.members.find((m) => m.is_me)?.id ?? null;

  useEffect(() => {
    if (!visible) return;
    setGroupId(presetGroup ?? groups[0]?.id ?? null);
    setDescription(expense?.description ?? '');
    setAmount(expense ? paiseToInput(expense.amount_paise) : '');
    setPaidBy(expense?.paid_by ?? null);
    setSplit(expense?.split ?? 'equal');
    setParticipants(expense ? Object.keys(expense.shares) : []);
    setShareText(expense ? Object.fromEntries(Object.entries(expense.shares).map(([k, v]) => [k, paiseToInput(v)])) : {});
    setAccountId(expense?.account_id ?? open.find((a) => a.kind !== 'credit_card')?.id ?? null);
    setCategory(expense?.category ?? null);
    const start = expense?.occurred_on ?? todayISO;
    setWhen(start === todayISO ? 'today' : start === daysBefore(new Date(), 1) ? 'yesterday' : 'other');
    setOtherDate(toDisplayDate(start));
    setNote(expense?.note ?? '');
    setMore(Boolean(expense?.note));
    setTried(false);
    setClientKey(newClientKey());
    // Only when the sheet opens.
  }, [visible, expense, presetGroup]);

  // A new expense defaults to "You paid, split with everyone" once the members load.
  useEffect(() => {
    if (!visible || expense || !detail) return;
    if (paidBy === null && me) setPaidBy(me);
    if (participants.length === 0) setParticipants(live.map((m) => m.id));
  }, [visible, expense, detail]);

  const paise = parseRupeesToPaise(amount);
  const shares: Record<string, number> =
    split === 'equal'
      ? equalShares(paise ?? 0, participants)
      : Object.fromEntries(Object.entries(shareText).map(([k, v]) => [k, parseRupeesToPaise(v) ?? 0]).filter(([, v]) => (v as number) > 0));
  const date = when === 'today' ? todayISO : when === 'yesterday' ? daysBefore(new Date(), 1) : parseDisplayDate(otherDate);
  const chosenCategory = category ?? suggestExpenseCategory(description) ?? 'other';
  const errors = validateExpense(
    { description, amountPaise: paise, paidBy, split, participants, shares, meId: me, accountId, date },
    todayISO,
    formatRupees,
  );
  const show = (f: keyof typeof errors) => (tried ? errors[f] : undefined);

  const close = () => {
    if (!expense && (description.trim() || amount.trim()) && !pending) {
      Alert.alert('Discard this entry?', undefined, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ]);
      return;
    }
    onClose();
  };

  const save = () => {
    setTried(true);
    if (Object.keys(errors).length || !groupId || !paise || !paidBy || !date) return;
    const input = {
      client_key: clientKey,
      description: description.trim(),
      category: chosenCategory,
      amount_paise: paise,
      paid_by: paidBy,
      split,
      participants: split === 'equal' ? participants : [],
      shares: split === 'exact' ? shares : {},
      occurred_on: date,
      note: note.trim() || null,
      account_id: paidBy === me ? accountId : null,
    };
    void run(
      async () => {
        if (expense) await edit.mutateAsync({ id: expense.id, today: todayISO, ...input });
        else await add.mutateAsync({ groupId, today: todayISO, ...input });
        const mine = shares[me ?? ''] ?? 0;
        onSaved(expense ? `${input.description} updated` : `${input.description} saved · your share ${formatRupees(mine)}`);
      },
      onClose,
    );
  };

  const toggle = (id: string) => setParticipants((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const nameOf = (id: string) => (id === me ? 'You' : (live.find((m) => m.id === id)?.name ?? ''));

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={expense ? 'Edit group expense' : 'Group expense'}
      tall
      footer={
        <>
          <FormError message={error} />
          <PrimaryButton label="Save" onPress={save} disabled={pending} loading={pending} />
          {expense && onDelete ? (
            <Text
              accessibilityRole="button"
              onPress={() => onDelete(expense)}
              style={{ textAlign: 'center', fontFamily: FONT.semibold, fontSize: 15, color: COLORS.error, paddingVertical: 10 }}>
              Delete
            </Text>
          ) : null}
        </>
      }>
      {!presetGroup ? (
        groups.length ? (
          <ChipRow options={groups.map((g) => ({ value: g.id, label: `${g.icon} ${g.name}` }))} value={groupId} onChange={setGroupId} />
        ) : (
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>Create a group in Khata › Groups first.</Text>
        )
      ) : null}
      <TextField label="What was it?" value={description} onChangeText={setDescription} placeholder="Dinner" maxLength={80} />
      <FieldError message={show('description')} />
      <TextField label="Total amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" prefix="₹" />
      <FieldError message={show('amount')} />

      <Label>Who paid</Label>
      <ChipRow options={live.map((m) => ({ value: m.id, label: m.is_me ? 'You' : m.name }))} value={paidBy} onChange={setPaidBy} />
      <FieldError message={show('paidBy')} />
      {paidBy && paidBy === me ? (
        <>
          <Label>Paid from</Label>
          <ChipRow options={open.map((a) => ({ value: a.id, label: a.name }))} value={accountId} onChange={setAccountId} />
          <FieldError message={show('account')} />
        </>
      ) : null}

      <Label>Split</Label>
      <ChipRow
        options={[
          { value: 'equal', label: 'Equally' },
          { value: 'exact', label: 'By amounts' },
        ]}
        value={split}
        onChange={setSplit}
      />
      {split === 'equal' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {live.map((m) => {
            const on = participants.includes(m.id);
            return (
              <TouchableOpacity
                key={m.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggle(m.id)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: on ? theme.accent : COLORS.border,
                  backgroundColor: on ? theme.tint : COLORS.card,
                }}>
                <Text style={{ fontFamily: on ? FONT.semibold : FONT.medium, fontSize: 14, color: on ? theme.accentText : COLORS.text }}>
                  {on ? '✓ ' : ''}
                  {m.is_me ? 'You' : m.name}
                  {on && paise ? ` · ${formatRupees(shares[m.id] ?? 0)}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {live.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, fontFamily: FONT.medium, fontSize: 14, color: COLORS.text }}>{nameOf(m.id)}</Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  width: 140,
                  height: 44,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.white,
                }}>
                <Text style={{ fontFamily: FONT.medium, color: COLORS.muted }}>₹ </Text>
                <TextInput
                  accessibilityLabel={`${nameOf(m.id)}'s share`}
                  value={shareText[m.id] ?? ''}
                  onChangeText={(v) => setShareText((cur) => ({ ...cur, [m.id]: v }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={COLORS.muted}
                  style={{ flex: 1, fontFamily: FONT.medium, fontSize: 15, color: COLORS.text }}
                />
              </View>
            </View>
          ))}
          {paise ? (
            <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: exactLeft(paise, shares) === 0 ? ROLES.positiveInk : COLORS.muted }}>
              {exactLeft(paise, shares) === 0 ? 'Shares add up.' : `${formatRupees(Math.abs(exactLeft(paise, shares)))} ${exactLeft(paise, shares) > 0 ? 'left to split' : 'over the total'}`}
            </Text>
          ) : null}
        </View>
      )}
      <FieldError message={show('split')} />

      {more ? (
        <>
          <Label>Category</Label>
          <ChipRow options={[...EXPENSE_CATEGORIES]} value={chosenCategory} onChange={setCategory} />
          <Label>Date</Label>
          <ChipRow options={WHEN} value={when} onChange={setWhen} />
          {when === 'other' ? (
            <TextField label="Date (DD/MM/YYYY)" value={otherDate} onChangeText={setOtherDate} keyboardType="numbers-and-punctuation" maxLength={10} />
          ) : null}
          <FieldError message={show('date')} />
          <TextField label="Notes" value={note} onChangeText={setNote} maxLength={120} />
        </>
      ) : (
        <TouchableOpacity accessibilityRole="button" onPress={() => setMore(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: theme.accentText }}>More options (category, date, notes)</Text>
        </TouchableOpacity>
      )}
      <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>
        Only your share counts as spending. What others owe you, or you owe them, is tracked in the group.
      </Text>
    </Sheet>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, marginBottom: -8 }}>{children}</Text>;
}
