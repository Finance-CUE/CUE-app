import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';

import {
  AuthButton,
  AuthField,
  AuthLink,
  AuthMessage,
  AuthScaffold,
} from '@/features/auth/components/AuthScaffold';
import { useSetPhone } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { validateIndianMobileNumber } from '@/features/auth/utils/phoneValidation';
import { toErrorMessage } from '@/lib/api';

/** Google sign-ups arrive without a phone; every account needs exactly one. */
export default function AddPhoneRoute() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const save = useSetPhone();

  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (status === 'restoring') return null;
  if (status !== 'authenticated') return <Redirect href="/" />;

  const first = user?.full_name.trim().split(/\s+/)[0];

  const submit = () => {
    const digits = phone.replace(/\D/g, '');
    const check = validateIndianMobileNumber(digits);
    if (!check.isValid) {
      setError(check.message ?? 'Please enter a valid mobile number.');
      return;
    }
    setError(null);
    save.mutate(digits, {
      onSuccess: () => router.replace('/'),
      onError: (e) => setError(toErrorMessage(e, "We couldn't save your number. Please try again.")),
    });
  };

  return (
    <AuthScaffold
      eyebrow="ONE LAST STEP"
      title={first ? `Welcome, ${first}` : 'Welcome to CUE'}
      description="Add your mobile number to finish setting up. Each number can belong to one CUE account.">
      <AuthField
        label="Mobile number (+91)"
        placeholder="10-digit mobile number"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={10}
        autoFocus
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          if (error) setError(null);
        }}
        onSubmitEditing={submit}
        invalid={Boolean(error)}
      />
      <AuthMessage message={error} />
      <AuthButton label="Continue" onPress={submit} disabled={!phone.trim()} loading={save.isPending} />
      <AuthLink
        prompt="Wrong Google account?"
        label="Sign out"
        onPress={async () => {
          await signOut();
          router.replace('/');
        }}
      />
    </AuthScaffold>
  );
}
