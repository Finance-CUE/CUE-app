import { useState } from 'react';
import { useRouter } from 'expo-router';

import { WelcomeLogin } from '@/features/auth/components/WelcomeLogin';
import { useLogin } from '@/features/auth/hooks';
import { toErrorMessage } from '@/lib/api';

export function WelcomeLoginScreen() {
  const router = useRouter();
  const login = useLogin();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleContinue = (email: string, password: string) => {
    setErrorMessage(null);

    login.mutate(
      {
        email: email.trim().toLowerCase(),
        password,
      },
      {
        onSuccess: () => {
          router.replace('/explore');
        },
        onError: (error) => {
          // The backend answers a wrong password and an unregistered address
          // identically, so this message must stay generic - narrowing it here
          // would hand back the account enumeration the API refuses to give.
          setErrorMessage(
            toErrorMessage(error, 'Incorrect email or password.'),
          );
        },
      },
    );
  };

  const handleSignupPress = () => {
    router.push('/auth/signup');
  };

  return (
    <WelcomeLogin
      onContinue={handleContinue}
      onSignupPress={handleSignupPress}
      isSubmitting={login.isPending}
      submitError={errorMessage}
    />
  );
}
