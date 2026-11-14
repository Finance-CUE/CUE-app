import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  AuthButton,
  AuthField,
  AuthLink,
  AuthMessage,
  AuthScaffold,
} from '@/features/auth/components/AuthScaffold';
import { useResendCode, useVerifyEmail } from '@/features/auth/hooks';
import { useCooldown } from '@/features/auth/useCooldown';
import { toErrorMessage } from '@/lib/api';

const RESEND_SECONDS = 60;

export default function VerifyEmailRoute() {
  const router = useRouter();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const verify = useVerifyEmail();
  const resend = useResendCode();
  // A code was just sent (by signup, or by the login that brought us here).
  const cooldown = useCooldown(RESEND_SECONDS, true);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const digits = code.replace(/\D/g, '');
  const valid = digits.length >= 6;

  const submit = () => {
    if (!valid || verify.isPending) return;
    setError(null);
    setNotice(null);
    verify.mutate(
      { email, code: digits },
      {
        onSuccess: () => router.replace('/'),
        onError: (e) => setError(toErrorMessage(e, "We couldn't verify that code. Please try again.")),
      },
    );
  };

  const sendAgain = () => {
    setError(null);
    setNotice(null);
    resend.mutate(email, {
      onSuccess: () => {
        cooldown.start();
        setNotice('A new code is on its way. It can take a minute to arrive, so check your spam folder too.');
      },
      onError: (e) => setError(toErrorMessage(e, "We couldn't send a new code. Please try again.")),
    });
  };

  return (
    <AuthScaffold
      eyebrow="VERIFY YOUR EMAIL"
      title="Check your inbox"
      description="We sent a code to"
      emphasis={email}
      onBack={() => router.replace('/')}>
      <AuthField
        label="Verification code"
        placeholder="Enter the code"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={10}
        autoFocus
        value={code}
        onChangeText={(v) => {
          setCode(v);
          if (error) setError(null);
        }}
        onSubmitEditing={submit}
        invalid={Boolean(error)}
        style={{ fontSize: 20, letterSpacing: 4 }}
      />
      <AuthMessage message={error} />
      <AuthMessage message={notice} tone="success" />
      <AuthButton label="Verify and continue" onPress={submit} disabled={!valid} loading={verify.isPending} />
      <AuthLink
        prompt="Didn't get it?"
        label={cooldown.remaining > 0 ? `Resend in ${cooldown.remaining}s` : 'Resend code'}
        onPress={sendAgain}
        disabled={cooldown.remaining > 0 || resend.isPending}
      />
    </AuthScaffold>
  );
}
