import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  AuthButton,
  AuthField,
  AuthLink,
  AuthMessage,
  AuthScaffold,
} from '@/features/auth/components/AuthScaffold';
import { useForgotPassword, useResetPassword } from '@/features/auth/hooks';
import { useCooldown } from '@/features/auth/useCooldown';
import { validateEmail, validatePassword } from '@/features/auth/utils/passwordValidation';
import { toErrorMessage } from '@/lib/api';

const RESEND_SECONDS = 60;

/** Two steps on one screen: ask for the email, then the code and a new password. */
export default function ForgotPasswordRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const request = useForgotPassword();
  const reset = useResetPassword();
  const cooldown = useCooldown(RESEND_SECONDS);

  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const address = email.trim().toLowerCase();

  const sendCode = () => {
    const check = validateEmail(address);
    if (!check.isValid) {
      setError(check.message ?? 'Please enter a valid email address.');
      return;
    }
    setError(null);
    setNotice(null);
    request.mutate(address, {
      onSuccess: () => {
        cooldown.start();
        setStep('reset');
        // Same words whether or not the account exists, like the server.
        setNotice(
          'If an account exists for this email, a code is on its way. It can take a minute, so check your spam folder too.',
        );
      },
      onError: (e) => setError(toErrorMessage(e, "We couldn't send the code. Please try again.")),
    });
  };

  const submitReset = () => {
    const digits = code.replace(/\D/g, '');
    if (digits.length < 6) {
      setError('Enter the code from your email.');
      return;
    }
    const check = validatePassword(password);
    if (!check.isValid) {
      setError(check.message ?? 'Please choose a stronger password.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setNotice(null);
    reset.mutate(
      { email: address, code: digits, new_password: password },
      {
        onSuccess: () => router.replace('/'),
        onError: (e) => setError(toErrorMessage(e, "We couldn't reset your password. Please try again.")),
      },
    );
  };

  const clearError = () => {
    if (error) setError(null);
  };

  if (step === 'email') {
    return (
      <AuthScaffold
        eyebrow="ACCOUNT RECOVERY"
        title="Forgot password?"
        description="Enter the email you use for CUE and we'll send you a code to set a new password."
        onBack={() => router.back()}>
        <AuthField
          label="Email"
          placeholder="you@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            clearError();
          }}
          onSubmitEditing={sendCode}
          invalid={Boolean(error)}
        />
        <AuthMessage message={error} />
        <AuthButton label="Send code" onPress={sendCode} disabled={!email.trim()} loading={request.isPending} />
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      eyebrow="ACCOUNT RECOVERY"
      title="Set a new password"
      description="Enter the code we sent to"
      emphasis={address}
      onBack={() => {
        setStep('email');
        setError(null);
        setNotice(null);
      }}>
      <AuthMessage message={notice} tone="success" />
      <AuthField
        label="Code"
        placeholder="Enter the code"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={10}
        value={code}
        onChangeText={(v) => {
          setCode(v);
          clearError();
        }}
        style={{ fontSize: 18, letterSpacing: 3 }}
      />
      <AuthField
        label="New password"
        placeholder="At least 8 characters, with a letter and a number"
        textContentType="newPassword"
        autoComplete="new-password"
        secure
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          clearError();
        }}
      />
      <AuthField
        label="Confirm new password"
        textContentType="newPassword"
        autoComplete="new-password"
        secure
        value={confirm}
        onChangeText={(v) => {
          setConfirm(v);
          clearError();
        }}
        onSubmitEditing={submitReset}
      />
      <AuthMessage message={error} />
      <AuthButton
        label="Save new password"
        onPress={submitReset}
        disabled={!code || !password || !confirm}
        loading={reset.isPending}
      />
      <AuthLink
        prompt="Didn't get it?"
        label={cooldown.remaining > 0 ? `Resend in ${cooldown.remaining}s` : 'Resend code'}
        onPress={sendCode}
        disabled={cooldown.remaining > 0 || request.isPending}
      />
    </AuthScaffold>
  );
}
