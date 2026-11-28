import { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT, ROLES } from '@/features/money/palette';
import { newClientKey } from '../accounts';
import { ChipRow, PrimaryButton, SecondaryButton, TextField } from '../components/ui';
import { parseDisplayDate, toDisplayDate, toISODate } from '../dates';
import { paiseToInput, parseRupeesToPaise } from '../format';
import { useCreateJar, useUpdateJar } from '../hooks';
import { useRupees } from '../privacy';
import { FieldError, FormError, Sheet, useGuardedSubmit } from '../sheets/Sheet';
import type { Account, Jar, JarMethod } from '../types';
import { fundingAccounts, JAR_ICONS, METHODS, STEPS, stepProblem, type JarForm, type Step } from './model';

const SAVE_ERROR = 'Not saved. Check your connection and try again.';

/**
 * Create jar runs the brief's eight steps, one at a time: name, target, target
 * date (optional), icon, first contribution, how you add, account, create.
 * Edit goal shows the same fields on one page.
 */
export function JarFormSheet({
  visible,
  jar,
  accounts,
  hasSalary,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** Edit this jar; null creates one. */
  jar: Jar | null;
  accounts: Account[];
  /** "Every payday" needs a salary date. */
  hasSalary: boolean;
  onClose: () => void;
  onSaved: (jar: Jar, created: boolean) => void;
}) {
  const formatRupees = useRupees();
  const funding = fundingAccounts(accounts);
  const todayISO = toISODate(new Date());
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [dateText, setDateText] = useState('');
  const [noDate, setNoDate] = useState(false);
  const [icon, setIcon] = useState(JAR_ICONS[0]);
  const [initial, setInitial] = useState('');
  const [method, setMethod] = useState<JarMethod>('manual');
  const [contribution, setContribution] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [clientKey, setClientKey] = useState(newClientKey);
  const create = useCreateJar();
  const update = useUpdateJar();
  const pending = create.isPending || update.isPending;
  const { run, error } = useGuardedSubmit(visible, SAVE_ERROR);

  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setName(jar?.name ?? '');
    setTarget(jar ? paiseToInput(jar.target_paise) : '');
    setDateText(jar?.target_date ? toDisplayDate(jar.target_date) : '');
    setNoDate(jar ? !jar.target_date : false);
    setIcon(jar?.icon ?? JAR_ICONS[0]);
    setInitial('');
    setMethod(jar?.method ?? 'manual');
    setContribution(jar?.contribution_paise ? paiseToInput(jar.contribution_paise) : '');
    setAccountId(jar?.account_id ?? [...funding].sort((a, b) => (b.free_paise ?? 0) - (a.free_paise ?? 0))[0]?.id ?? null);
    setTried(false);
    setClientKey(newClientKey());
    // Only when the sheet opens.
  }, [visible, jar]);

  const form: JarForm = {
    name,
    targetPaise: parseRupeesToPaise(target),
    targetDate: noDate ? '' : parseDisplayDate(dateText),
    icon,
    initialPaise: initial.trim() === '' ? 0 : parseRupeesToPaise(initial),
    method,
    contributionPaise: parseRupeesToPaise(contribution),
    accountId,
  };
  const freeOf = (id: string) => {
    const a = funding.find((x) => x.id === id);
    if (!a) return null;
    // Editing: the jar's own money is already inside this account's jars.
    const own = jar && jar.account_id === id ? jar.saved_paise : 0;
    return a.free_paise === undefined || a.free_paise === null ? a.balance_paise : a.free_paise + own;
  };
  const problem = (s: Step) => stepProblem(s, form, todayISO, freeOf);
  const editing = jar !== null;
  const current = STEPS[step];

  const close = () => {
    if (!editing && name.trim() && !pending) {
      Alert.alert('Discard this jar?', undefined, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ]);
      return;
    }
    onClose();
  };

  const save = () => {
    setTried(true);
    const steps = editing ? STEPS.filter((s) => s !== 'First contribution') : STEPS;
    if (steps.some((s) => problem(s)) || !form.targetPaise || !accountId) return;
    const input = {
      name: name.trim(),
      icon,
      target_paise: form.targetPaise,
      target_date: noDate ? null : (form.targetDate as string),
      account_id: accountId,
      method,
      contribution_paise: method === 'manual' ? null : form.contributionPaise,
    };
    void run(
      async () => {
        const saved = editing
          ? await update.mutateAsync({ id: jar.id, today: todayISO, ...input })
          : await create.mutateAsync({ client_key: clientKey, today: todayISO, initial_paise: form.initialPaise ?? 0, ...input });
        onSaved(saved, !editing);
      },
      onClose,
    );
  };

  const next = () => {
    setTried(true);
    if (problem(current)) return;
    setTried(false);
    if (current === 'Create') save();
    else setStep(step + 1);
  };

  const fields: Record<Step, React.ReactNode> = {
    Name: (
      <>
        <TextField label="What are you saving for?" value={name} onChangeText={setName} placeholder="Goa trip" maxLength={40} />
        <FieldError message={tried ? problem('Name') : undefined} />
      </>
    ),
    Target: (
      <>
        <TextField label="Target amount" value={target} onChangeText={setTarget} keyboardType="decimal-pad" prefix="₹" placeholder="30,000" />
        <FieldError message={tried ? problem('Target') : undefined} />
      </>
    ),
    'Target date': (
      <>
        {!noDate ? (
          <TextField
            label="Reach it by (DD/MM/YYYY)"
            value={dateText}
            onChangeText={setDateText}
            placeholder="15/03/2027"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        ) : null}
        <ChipRow
          options={[
            { value: 'date', label: 'By a date' },
            { value: 'none', label: 'No target date' },
          ]}
          value={noDate ? 'none' : 'date'}
          onChange={(v) => setNoDate(v === 'none')}
        />
        <FieldError message={tried ? problem('Target date') : undefined} />
      </>
    ),
    Icon: (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {JAR_ICONS.map((e) => (
          <TouchableOpacity
            key={e}
            accessibilityRole="button"
            accessibilityState={{ selected: e === icon }}
            onPress={() => setIcon(e)}
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: e === icon ? ROLES.accentSoft : COLORS.white,
              borderWidth: e === icon ? 2 : 1,
              borderColor: e === icon ? ROLES.accent : COLORS.cardBorder,
            }}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>
    ),
    'First contribution': (
      <>
        <TextField label="Set aside now (optional)" value={initial} onChangeText={setInitial} keyboardType="decimal-pad" prefix="₹" placeholder="0" />
        <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>
          It stays in your account; CUE only marks it for this goal.
        </Text>
        <FieldError message={tried ? problem('First contribution') : undefined} />
      </>
    ),
    'How you add': (
      <>
        <ChipRow
          options={METHODS.map((m) => ({ ...m, label: m.value === 'payday' && !hasSalary ? 'Every payday (set up salary first)' : m.label }))}
          value={method}
          onChange={(m) => (m === 'payday' && !hasSalary ? undefined : setMethod(m))}
        />
        {method !== 'manual' ? (
          <TextField label="Amount each time" value={contribution} onChangeText={setContribution} keyboardType="decimal-pad" prefix="₹" />
        ) : null}
        <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>
          {method === 'manual'
            ? 'You add money whenever you like.'
            : 'CUE asks before every contribution. Nothing is added without your tap.'}
        </Text>
        <FieldError message={tried ? problem('How you add') : undefined} />
      </>
    ),
    Account: (
      <>
        <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted, marginBottom: -8 }}>The money stays in</Text>
        <ChipRow
          options={funding.map((a) => ({ value: a.id, label: `${a.name} · ${formatRupees(freeOf(a.id) ?? 0)} free` }))}
          value={accountId}
          onChange={setAccountId}
        />
        {funding.length === 0 ? (
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.muted }}>Add a bank account or cash on Today first.</Text>
        ) : null}
        <FieldError message={tried ? problem('Account') : undefined} />
      </>
    ),
    Create: (
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 40, textAlign: 'center' }}>{icon}</Text>
        <Text style={{ fontFamily: FONT.semibold, fontSize: 16, color: COLORS.text, textAlign: 'center' }}>{name.trim()}</Text>
        <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.muted, textAlign: 'center' }}>
          {formatRupees(form.targetPaise ?? 0)}
          {form.targetDate ? ` by ${toDisplayDate(form.targetDate)}` : ''}
          {form.initialPaise ? ` · starting with ${formatRupees(form.initialPaise)}` : ''}
        </Text>
        <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted, textAlign: 'center' }}>
          Your bank balance and net worth don't change. The money is set aside, not spent.
        </Text>
      </View>
    ),
  };

  if (editing) {
    return (
      <Sheet
        visible={visible}
        onClose={close}
        title={`Edit ${jar.name}`}
        tall
        footer={
          <>
            <FormError message={error} />
            <PrimaryButton label="Save" onPress={save} disabled={pending} loading={pending} />
          </>
        }>
        {STEPS.filter((s) => s !== 'First contribution' && s !== 'Create').map((s) => (
          <View key={s} style={{ gap: 10 }}>
            <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: COLORS.text }}>{s}</Text>
            {fields[s]}
          </View>
        ))}
        {jar.saved_paise > 0 ? (
          <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, color: COLORS.muted }}>
            Choosing another account moves the {formatRupees(jar.saved_paise)} in this jar with it.
          </Text>
        ) : null}
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Create jar"
      subtitle={`Step ${step + 1} of ${STEPS.length} · ${current}`}
      tall
      footer={
        <>
          <FormError message={error} />
          <PrimaryButton label={current === 'Create' ? 'Create jar' : 'Next'} onPress={next} disabled={pending} loading={pending} />
          {step > 0 ? <SecondaryButton label="Back" onPress={() => setStep(step - 1)} /> : null}
        </>
      }>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? ROLES.accent : ROLES.line }} />
        ))}
      </View>
      {fields[current]}
    </Sheet>
  );
}
