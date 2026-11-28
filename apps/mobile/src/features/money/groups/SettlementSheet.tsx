import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { COLORS, FONT } from '@/features/money/palette';
import { newClientKey } from '../accounts';
import { ChipRow, PrimaryButton, TextField } from '../components/ui';
import { daysBefore, parseDisplayDate, toDisplayDate, toISODate } from '../dates';
import { paiseToInput, parseRupeesToPaise } from '../format';
import { useAddGroupSettlement, useGroup, useSettlePerson } from '../hooks';
import type { PersonBalance } from '../khata';
import { useRupees } from '../privacy';
import { FieldError, FormError, Sheet, useGuardedSubmit } from '../sheets/Sheet';
import type { Account, Group } from '../types';

type When = 'today' | 'yesterday' | 'other';
const WHEN: { value: When; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'other', label: 'Another day' },
];

export type SettlementPreset =
  | { kind: 'person'; person?: string; fromThem?: boolean; amountPaise?: number }
  | { kind: 'group'; groupId?: string; from?: string; to?: string; amountPaise?: number };

/**
 * Quick Add Settlement (spec section 5): with a person or in a group, who paid
 * whom, the amount, the account and the date. Never income or an expense: money
 * moves through the account and what is owed goes down. Paying a person more
 * than is open asks first; the rest is then recorded the other way.
 */
export function SettlementSheet({
  visible,
  preset,
  people,
  groups,
  accounts,
  onClose,
  onDone,
}: {
  visible: boolean;
  preset: SettlementPreset | null;
  people: PersonBalance[];
  groups: Group[];
  accounts: Account[];
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const formatRupees = useRupees();
  const open = accounts.filter((a) => !a.archived && a.kind !== 'credit_card');
  const [kind, setKind] = useState<'person' | 'group'>('person');
  const [person, setPerson] = useState<string | null>(null);
  const [fromThem, setFromThem] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [when, setWhen] = useState<When>('today');
  const [otherDate, setOtherDate] = useState('');
  const [tried, setTried] = useState(false);
  const [clientKey, setClientKey] = useState(newClientKey);
  const settlePerson = useSettlePerson();
  const addGroup = useAddGroupSettlement();
  const detail = useGroup(kind === 'group' && visible ? groupId : null).data;
  const { run, error } = useGuardedSubmit(visible);
  const todayISO = toISODate(new Date());

  useEffect(() => {
    if (!visible) return;
    const p: SettlementPreset = preset ?? (people.length || !groups.length ? { kind: 'person' } : { kind: 'group' });
    setKind(p.kind);
    if (p.kind === 'person') {
      const first = p.person ?? people.find((x) => x.net_paise !== 0)?.person ?? null;
      setPerson(first);
      const bal = people.find((x) => x.person.toLowerCase() === (first ?? '').toLowerCase())?.net_paise ?? 0;
      setFromThem(p.fromThem ?? bal >= 0);
      setAmount(p.amountPaise ? paiseToInput(p.amountPaise) : '');
    } else {
      setGroupId(p.groupId ?? groups[0]?.id ?? null);
      setFrom(p.from ?? null);
      setTo(p.to ?? null);
      setAmount(p.amountPaise ? paiseToInput(p.amountPaise) : '');
    }
    setAccountId(open.find((a) => a.kind === 'cash')?.id ?? open[0]?.id ?? null);
    setWhen('today');
    setOtherDate('');
    setTried(false);
    setClientKey(newClientKey());
    // Only when the sheet opens.
  }, [visible, preset]);

  const me = detail?.members.find((m) => m.is_me)?.id ?? null;
  const live = (detail?.members ?? []).filter((m) => !m.removed);
  const paise = parseRupeesToPaise(amount);
  const date = when === 'today' ? todayISO : when === 'yesterday' ? daysBefore(new Date(), 1) : parseDisplayDate(otherDate);
  const involvesMe = kind === 'person' || (me !== null && (from === me || to === me));
  const balance = people.find((x) => x.person.toLowerCase() === (person ?? '').toLowerCase())?.net_paise ?? 0;
  const openWith = fromThem ? Math.max(balance, 0) : Math.max(-balance, 0);

  const problem = (() => {
    if (kind === 'person' && !person?.trim()) return 'Choose the person.';
    if (kind === 'group' && (!groupId || !from || !to)) return 'Choose who paid and who was paid.';
    if (kind === 'group' && from === to) return 'Choose two different people.';
    if (!paise || paise <= 0) return 'Enter an amount above ₹0.';
    if (involvesMe && !accountId) return 'Choose the account the money moved through.';
    if (!date) return 'Enter the date as DD/MM/YYYY.';
    if (date > todayISO) return "This can't be in the future.";
    return null;
  })();

  const send = (allowOver: boolean) =>
    void run(
      async () => {
        if (kind === 'person' && person && paise && accountId && date) {
          await settlePerson.mutateAsync({
            client_key: clientKey,
            person: person.trim(),
            from_them: fromThem,
            amount_paise: paise,
            account_id: accountId,
            occurred_on: date,
            allow_over: allowOver,
          });
          onDone(fromThem ? `${person} paid you ${formatRupees(paise)}` : `You paid ${person} ${formatRupees(paise)}`);
        } else if (groupId && from && to && paise && date) {
          await addGroup.mutateAsync({
            groupId,
            today: todayISO,
            client_key: clientKey,
            from_member: from,
            to_member: to,
            amount_paise: paise,
            occurred_on: date,
            account_id: involvesMe ? accountId : null,
          });
          onDone('Settlement saved');
        }
      },
      onClose,
    );

  const save = () => {
    setTried(true);
    if (problem || !paise) return;
    if (kind === 'person' && paise > openWith) {
      // The spec: more than the open balance needs a warning first.
      Alert.alert(
        'More than is owed',
        openWith > 0
          ? `Only ${formatRupees(openWith)} is open with ${person}. The extra ${formatRupees(paise - openWith)} will be recorded the other way.`
          : `Nothing is open this way with ${person}. The whole amount will be recorded as ${fromThem ? 'money you now owe them' : 'money they now owe you'}.`,
        [
          { text: 'Edit amount', style: 'cancel' },
          { text: 'Record it', onPress: () => send(true) },
        ],
      );
      return;
    }
    send(false);
  };

  const memberChips = live.map((m) => ({ value: m.id, label: m.is_me ? 'You' : m.name }));
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Settlement"
      subtitle="Money paid back. Never income or spending."
      footer={
        <>
          <FormError message={error} />
          <PrimaryButton label="Save" onPress={save} disabled={settlePerson.isPending || addGroup.isPending} loading={settlePerson.isPending || addGroup.isPending} />
        </>
      }>
      {!preset ? (
        <ChipRow
          options={[
            { value: 'person', label: 'With a person' },
            { value: 'group', label: 'In a group' },
          ]}
          value={kind}
          onChange={setKind}
        />
      ) : null}

      {kind === 'person' ? (
        <>
          {people.length ? (
            <ChipRow options={people.map((p) => ({ value: p.person, label: p.person }))} value={person} onChange={setPerson} />
          ) : null}
          <TextField label="Person" value={person ?? ''} onChangeText={setPerson} maxLength={60} />
          <ChipRow
            options={[
              { value: 'them', label: 'They paid me' },
              { value: 'me', label: 'I paid them' },
            ]}
            value={fromThem ? 'them' : 'me'}
            onChange={(v) => setFromThem(v === 'them')}
          />
          {person ? (
            <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>
              {openWith > 0 ? `${formatRupees(openWith)} open this way.` : 'Nothing open this way.'}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <ChipRow options={groups.map((g) => ({ value: g.id, label: `${g.icon} ${g.name}` }))} value={groupId} onChange={setGroupId} />
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, marginBottom: -8 }}>Who paid</Text>
          <ChipRow options={memberChips} value={from} onChange={setFrom} />
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, marginBottom: -8 }}>Who was paid</Text>
          <ChipRow options={memberChips.filter((c) => c.value !== from)} value={to} onChange={setTo} />
        </>
      )}

      <TextField label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" prefix="₹" />
      {involvesMe ? (
        <>
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, marginBottom: -8 }}>
            {kind === 'person' ? (fromThem ? 'Received in' : 'Paid from') : to === me ? 'Received in' : 'Paid from'}
          </Text>
          <ChipRow options={open.map((a) => ({ value: a.id, label: a.name }))} value={accountId} onChange={setAccountId} />
        </>
      ) : null}
      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, marginBottom: -8 }}>Date</Text>
      <ChipRow options={WHEN} value={when} onChange={setWhen} />
      {when === 'other' ? (
        <TextField
          label="Date (DD/MM/YYYY)"
          value={otherDate || toDisplayDate(todayISO)}
          onChangeText={setOtherDate}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
      ) : null}
      <FieldError message={tried ? problem : undefined} />
    </Sheet>
  );
}
