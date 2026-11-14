import { useState } from 'react';
import { useRouter } from 'expo-router';

import { WelcomeLogin } from '@/features/auth/components/WelcomeLogin';
import { useGoogleSignIn, useLogin } from '@/features/auth/hooks';
import { errorCode, toErrorMessage } from '@/lib/api';

export function WelcomeLoginScreen() {
  const router = useRouter();
  const login = useLogin();
  const google = useGoogleSignIn();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleContinue = (email: string, password: string) => {
    setErrorMessage(null);
    const address = email.trim().toLowerCase();

    login.mutate(
      { email: address, password },
      {
        // The index route decides what comes next: phone, assessment or Today.
        onSuccess: () => router.replace('/'),
        onError: (error) => {
          if (errorCode(error) === 'email_not_verified') {
            // The server has already sent a fresh code.
            router.push({ pathname: '/auth/verify-email', params: { email: address } });
            return;
          }
          // The backend answers a wrong password and an unregistered address
          // identically, so this message must stay generic - narrowing it here
          // would hand back the account enumeration the API refuses to give.
          setErrorMessage(toErrorMessage(error, 'Incorrect email or password.'));
        },
      },
    );
  };

  const handleGoogle = () => {
    setErrorMessage(null);
    google.mutate(undefined, {
      onSuccess: (session) => {
        if (session) router.replace('/');
      },
      onError: (error) =>
        setErrorMessage(toErrorMessage(error, error instanceof Error ? error.message : "Google sign-in didn't work.")),
    });
  };

  return (
    <WelcomeLogin
      onContinue={handleContinue}
      onSignupPress={() => router.push('/auth/signup')}
      onForgotPress={(email) =>
        router.push({ pathname: '/auth/forgot-password', params: { email: email.trim() } })
      }
      onGooglePress={handleGoogle}
      isSubmitting={login.isPending}
      isGoogleLoading={google.isPending}
      submitError={errorMessage}
    />
  );
}
