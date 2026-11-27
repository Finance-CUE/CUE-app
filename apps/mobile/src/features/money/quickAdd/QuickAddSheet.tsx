import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { COLORS, HEADING_FONT, FONT, useDashboardTheme } from '@/features/money/palette';
import { newClientKey } from '../accounts';
import { ClockIcon, InIcon, KhataIcon, OutIcon, RupeeIcon, SavingsIcon, SwapIcon } from '../components/icons';
import { ChipRow, PrimaryButton, TextField } from '../components/ui';
import { daysBefore, parseDisplayDate, toDisplayDate, toISODate } from '../dates';
import { formatRupees as plainRupees, paiseToInput, parseRupeesToPaise } from '../format';
import { useAddScheduled, useAddTransaction, useTransactions, useUpdateTransaction } from '../hooks';
import { useRupees } from '../privacy';
import type { Account, LedgerTxn } from '../types';
import { FieldError, FormError, Sheet, useGuardedSubmit } from '../sheets/Sheet';
import {
  categoryName,
  defaultAccountId,
  defaultToAccountId,
  EXPENSE_CATEGORIES,
  type EntryKind,
  hasInput,
  INCOME_CATEGORIES,
  lowBalanceNote,
  nextRepeatDate,
  QUICK_AMOUNTS,
  REPEAT_OPTIONS,
  type RepeatChoice,
  scheduleKindFor,
  smartDefaults,
  suggestExpenseCategory,
  suggestIncomeCategory,
  validate,
} from './model';

export type QuickAddChoice = EntryKind | null;
/** What the caller needs after a save: the entry (for Undo) and any low-balance note. */
export type Saved = {
  txn: LedgerTxn | null;
  kind: EntryKind;
  lowNote: string | null;
  accountId: string;
  edited: boolean;
  /** A future date: saved as a scheduled payment due then, not as an entry. */
  scheduledFor?: string;
};
export type Seed = { mode: 'edit' | 'duplicate'; txn: LedgerTxn };

const TITLES: Record<EntryKind, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer' };
const SAVE_ERROR = 'Not saved. Check your connection and try again.';

type DateChoice = 'today' | 'yesterday' | 'other';
const DATE_OPTIONS: { value: DateChoice; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'other', label: 'Another day' },
];

/**
 * The floating + opens this one sheet (spec Quick Add): Expense, Income and
 * Transfer on the ledger; Subscription opens the scheduled payment form; Lend /
 * Borrow opens Khata until P3. More options holds notes and Recurring. A new
 * expense or income dated after today becomes a scheduled payment (suggestion 6).
 */
export function QuickAddSheet({
  visible,
  initial,
  accounts,
  defaultDate,
  presetAccountId,
  seed = null,
  onClose,
  onSaved,
  onLendBorrow,
  onGroupExpense,
  onSettlement,
  onSubscription,
  onGoalJar,
}: {
  visible: boolean;
  initial: QuickAddChoice;
  accounts: Account[];
  /** The date selected on Today, so backdating is one tap. */
  defaultDate: string;
  /** e.g. "Add it as an expense instead" from Update balance. */
  presetAccountId?: string | null;
  /** Edit an entry (any date), or Duplicate it into a new one. */
  seed?: Seed | null;
  onClose: () => void;
  onSaved: (saved: Saved) => void;
  /** Lend and Borrow tiles; hidden when not given. */
  onLendBorrow?: (direction: 'lent' | 'borrowed') => void;
  /** P3: Group Expense and Settlement tiles; hidden when not given. */
  onGroupExpense?: () => void;
  onSettlement?: () => void;
  onSubscription: () => void;
  /** The Goal Jar tile (P2); hidden when not given. */
  onGoalJar?: () => void;
}) {
  const formatRupees = useRupees();
  const theme = useDashboardTheme();
  const [kind, setKind] = useState<QuickAddChoice>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [pickedCategory, setPickedCategory] = useState<string | null>(null);
  const [pickedAccount, setPickedAccount] = useState<string | null>(null);
  const [pickedTo, setPickedTo] = useState<string | null>(null);
  const [dateChoice, setDateChoice] = useState<DateChoice>('today');
  const [otherDate, setOtherDate] = useState('');
  const [note, setNote] = useState('');
  const [more, setMore] = useState(false);
  const [repeat, setRepeat] = useState<RepeatChoice | null>(null);
  const [nextText, setNextText] = useState('');
  const [variable, setVariable] = useState(false);
  const [tried, setTried] = useState(false);
  const [clientKey, setClientKey] = useState(newClientKey);
  const saved = useRef<LedgerTxn | null>(null);
  const create = useAddTransaction();
  const update = useUpdateTransaction();
  const schedule = useAddScheduled();
  const editing = seed?.mode === 'edit' ? seed.txn : null;
  const mutation = editing ? update : create;
  const pending = mutation.isPending || schedule.isPending;
  const { run, error } = useGuardedSubmit(visible, SAVE_ERROR);

  // A year of entries, for smart defaults and the last account used per type.
  const today = new Date();
  const todayISO = toISODate(today);
  const history = useTransactions(daysBefore(today, 365), todayISO, visible).data ?? [];
  const open = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);

  // Seed the form each time the sheet opens, never while the user is typing.
  useEffect(() => {
    if (!visible) return;
    const from = seed?.txn ?? null;
    setKind(from ? (from.type as EntryKind) : initial);
    setAmount(from ? paiseToInput(from.amount_paise) : '');
    setDescription(from?.description ?? '');
    setPickedCategory(from?.category ?? null);
    setPickedAccount(from?.account_id ?? presetAccountId ?? null);
    setPickedTo(from?.to_account_id ?? null);
    // Editing keeps the entry's date; a duplicate is new, so it takes Today's selected date.
    const wanted = seed?.mode === 'edit' && from ? from.occurred_on : defaultDate;
    // A future date selected on Today stays: the entry becomes a scheduled payment.
    const start = wanted > todayISO && (seed?.mode === 'edit' || initial === 'transfer') ? todayISO : wanted;
    setDateChoice(start === todayISO ? 'today' : start === daysBefore(new Date(), 1) ? 'yesterday' : 'other');
    setOtherDate(toDisplayDate(start));
    setNote(from?.note ?? '');
    setMore(Boolean(from?.note));
    setRepeat(null);
    setNextText('');
    setVariable(false);
    setTried(false);
    setClientKey(newClientKey());
    // defaultDate and todayISO are read only when the sheet opens.
  }, [visible, initial, presetAccountId, seed]);

  const paise = parseRupeesToPaise(amount);
  const defaults = kind && kind !== 'transfer' ? smartDefaults(history, kind, description) : null;
  const suggested =
    kind === 'expense' ? suggestExpenseCategory(description) : kind === 'income' ? suggestIncomeCategory(description) : null;
  // A manual pick wins; then a past entry with the same description; then the keyword suggestion.
  const category = pickedCategory ?? defaults?.category ?? suggested;
  const openIds = new Set(open.map((a) => a.id));
  const fromDefault = defaults?.accountId && openIds.has(defaults.accountId) ? defaults.accountId : null;
  const accountId = (pickedAccount && openIds.has(pickedAccount) ? pickedAccount : null) ??
    fromDefault ??
    (kind ? defaultAccountId(open, history, kind) : null);
  const toAccountId = pickedTo && openIds.has(pickedTo) ? pickedTo : defaultToAccountId(open, accountId);
  const date =
    dateChoice === 'today' ? todayISO : dateChoice === 'yesterday' ? daysBefore(today, 1) : parseDisplayDate(otherDate);
  const future = !editing && kind !== 'transfer' && date !== null && date > todayISO;
  const nextOn = repeat ? (nextText ? parseDisplayDate(nextText) : date ? nextRepeatDate(date, repeat) : null) : null;
  const baseErrors = kind
    ? validate({ kind, amountPaise: paise, description, category, accountId, toAccountId, date }, todayISO, !editing)
    : {};
  const errors: typeof baseErrors & { next?: string } = { ...baseErrors };
  if (repeat && !future) {
    if (!nextOn) errors.next = 'Enter the next date as DD/MM/YYYY.';
    else if (date && nextOn <= date) errors.next = 'The next date must be after this one.';
  }
  const show = (field: keyof typeof errors) => (tried ? errors[field] : undefined);

  const close = () => {
    if (kind && hasInput(amount, description, note) && !pending) {
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
    if (!kind || Object.keys(errors).length > 0 || paise === null || !accountId || !date) return;
    const account = open.find((a) => a.id === accountId);
    // An edit's old amount is already in the balance, so the note would mislead.
    const lowNote = kind === 'income' || editing ? null : lowBalanceNote(account, paise, formatRupees);
    const text = description.trim();
    const transfer = kind === 'transfer';
    if (future) {
      // Suggestion 6: it can't touch balances before it happens, so it waits in Coming up.
      void run(
        async () => {
          await schedule.mutateAsync({
            client_key: clientKey,
            today: todayISO,
            kind: scheduleKindFor(kind, category),
            name: text || categoryName(category),
            amount_paise: paise,
            frequency: repeat ?? 'once',
            next_on: date,
            account_id: accountId,
            category,
            variable,
            reminder: true,
          });
        },
        () => {
          onSaved({ txn: null, kind, lowNote: null, accountId, edited: false, scheduledFor: date });
          onClose();
        },
      );
      return;
    }
    void run(
      async () => {
        saved.current = editing
          ? await update.mutateAsync({
              id: editing.id,
              amount_paise: paise,
              account_id: accountId,
              to_account_id: transfer ? toAccountId : null,
              category: transfer ? null : category,
              description: text || null,
              note: note.trim() || null,
              occurred_on: date,
            })
          : await create.mutateAsync({
              client_key: clientKey,
              type: kind,
              amount_paise: paise,
              account_id: accountId,
              ...(transfer && toAccountId ? { to_account_id: toAccountId } : {}),
              ...(!transfer && category ? { category } : {}),
              ...(text ? { description: text } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
              occurred_on: date,
              ...(repeat && nextOn && !transfer ? { repeat: { frequency: repeat, next_on: nextOn, variable } } : {}),
            });
      },
      () => {
        if (saved.current) onSaved({ txn: saved.current, kind, lowNote, accountId, edited: Boolean(editing) });
        onClose();
      },
    );
  };

  if (!kind) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Log something" subtitle="What happened?">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Tile label="Expense" icon={<RupeeIcon color={theme.accentText} />} onPress={() => setKind('expense')} />
          <Tile label="Income" icon={<RupeeIcon color={theme.accentText} />} onPress={() => setKind('income')} />
          <Tile label="Transfer" icon={<SwapIcon color={theme.accentText} />} onPress={() => setKind('transfer')} />
          {onLendBorrow ? <Tile label="Lend" icon={<OutIcon color={theme.accentText} />} onPress={() => onLendBorrow('lent')} /> : null}
          {onLendBorrow ? <Tile label="Borrow" icon={<InIcon color={theme.accentText} />} onPress={() => onLendBorrow('borrowed')} /> : null}
          <Tile label="Subscription or bill" icon={<ClockIcon color={theme.accentText} />} onPress={onSubscription} />
          {onGoalJar ? <Tile label="Goal Jar" icon={<SavingsIcon color={theme.accentText} />} onPress={onGoalJar} /> : null}
          {onGroupExpense ? <Tile label="Group Expense" icon={<KhataIcon color={theme.accentText} />} onPress={onGroupExpense} /> : null}
          {onSettlement ? <Tile label="Settlement" icon={<SwapIcon color={theme.accentText} />} onPress={onSettlement} /> : null}
        </View>
        {open.length === 0 ? (
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>Add an account on Today first, so CUE knows where the money is.</Text>
        ) : null}
      </Sheet>
    );
  }

  const accountOptions = open.map((a) => ({ value: a.id, label: a.name }));
  const categories = kind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={editing ? `Edit ${TITLES[kind].toLowerCase()}` : TITLES[kind]}
      tall
      footer={
        <>
          <FormError message={error} />
          <PrimaryButton label={future ? 'Schedule' : 'Save'} onPress={save} disabled={pending} loading={pending} />
          <TouchableOpacity accessibilityRole="button" onPress={close} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.muted }}>Cancel</Text>
          </TouchableOpacity>
        </>
      }>
      <AmountField value={amount} onChange={setAmount} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {/* Not masked: what the user is entering stays visible (spec, hidden amounts). */}
        {QUICK_AMOUNTS.map((p) => (
          <Chip key={p} label={plainRupees(p)} onPress={() => setAmount(String(p / 100))} />
        ))}
      </View>
      <FieldError message={show('amount')} />

      {kind !== 'transfer' ? (
        <>
          <TextField
            label={kind === 'income' ? 'Source' : 'Description'}
            value={description}
            onChangeText={setDescription}
            placeholder={kind === 'income' ? 'November salary' : 'Swiggy dinner'}
            maxLength={80}
          />
          <FieldError message={show('description')} />
          <Label>Category</Label>
          <ChipRow options={[...categories]} value={category} onChange={setPickedCategory} />
          <FieldError message={show('category')} />
        </>
      ) : null}

      <Label>{kind === 'income' ? 'Received in' : kind === 'transfer' ? 'From' : 'Paid from'}</Label>
      <ChipRow options={accountOptions} value={accountId} onChange={setPickedAccount} />
      <FieldError message={show('account')} />
      {kind === 'transfer' ? (
        <>
          <Label>To</Label>
          <ChipRow options={accountOptions.filter((o) => o.value !== accountId)} value={toAccountId} onChange={setPickedTo} />
          <FieldError message={show('toAccount')} />
        </>
      ) : null}

      <Label>Date</Label>
      <ChipRow options={DATE_OPTIONS} value={dateChoice} onChange={setDateChoice} />
      {dateChoice === 'other' ? (
        <TextField
          label="Date (DD/MM/YYYY)"
          value={otherDate}
          onChangeText={setOtherDate}
          placeholder="DD/MM/YYYY"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
      ) : null}
      <FieldError message={show('date')} />
      {future ? (
        <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted, marginTop: -6 }}>
          A future date is saved as a scheduled payment. It shows in Coming up and is spent only when you mark it paid.
        </Text>
      ) : null}

      {more ? (
        <>
          <TextField label="Notes" value={note} onChangeText={setNote} maxLength={120} />
          {kind !== 'transfer' && !editing ? (
            <>
              <Label>Recurring</Label>
              <ChipRow
                options={[{ value: 'none', label: 'One time' }, ...REPEAT_OPTIONS]}
                value={repeat ?? 'none'}
                onChange={(v) => setRepeat(v === 'none' ? null : (v as RepeatChoice))}
              />
              {repeat && !future ? (
                <TextField
                  label={kind === 'income' ? 'Next expected (DD/MM/YYYY)' : 'Next due (DD/MM/YYYY)'}
                  value={nextText || (date ? toDisplayDate(nextRepeatDate(date, repeat)) : '')}
                  onChangeText={setNextText}
                  placeholder="DD/MM/YYYY"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              ) : null}
              <FieldError message={tried ? errors.next : undefined} />
              {repeat ? (
                <>
                  <Label>{kind === 'income' ? 'Fixed or variable' : 'Amount each time'}</Label>
                  <ChipRow
                    options={[
                      { value: 'fixed', label: 'Fixed' },
                      { value: 'variable', label: 'Variable' },
                    ]}
                    value={variable ? 'variable' : 'fixed'}
                    onChange={(v) => setVariable(v === 'variable')}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <TouchableOpacity accessibilityRole="button" onPress={() => setMore(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: theme.accentText }}>More options</Text>
        </TouchableOpacity>
      )}
    </Sheet>
  );
}

/** Amount first: a large serif field with ₹ and the number pad open straight away. */
function AmountField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 4 }}>
      <Text style={{ fontSize: 34, color: COLORS.muted, fontFamily: HEADING_FONT }}>₹</Text>
      <TextInput
        accessibilityLabel="Amount"
        autoFocus
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={COLORS.muted}
        style={{ flex: 1, fontSize: 34, color: COLORS.text, fontFamily: HEADING_FONT, paddingVertical: 4 }}
      />
    </View>
  );
}

function Tile({ label, icon, onPress }: { label: string; icon: ReactNode; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        width: '31%',
        minHeight: 84,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        backgroundColor: COLORS.white,
        padding: 8 }}>
      {icon}
      <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.text, textAlign: 'center' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useDashboardTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: theme.tint, justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: theme.accentText }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, marginBottom: -8 }}>{children}</Text>;
}
