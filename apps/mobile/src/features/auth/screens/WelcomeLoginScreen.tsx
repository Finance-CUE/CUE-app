import { useState } from 'react';
import { useRouter } from 'expo-router';

import { WelcomeLogin } from '@/features/auth/components/WelcomeLogin';
import { useLogin } from '@/features/auth/hooks';
import { toErrorMessage } from '@/lib/api';

export function WelcomeLoginScreen() {
  const router = useRouter();
  const login = useLogin();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleContinue = (phoneNumber: string, password: string) => {
    setErrorMessage(null);

    login.mutate(
      {
        phone: phoneNumber.replace(/\D/g, ''),
        password,
      },
      {
        onSuccess: () => {
          router.replace('/explore');
        },
        onError: (error) => {
          // The backend answers a wrong password and an unregistered number
          // identically, so this message must stay generic - narrowing it here
          // would hand back the account enumeration the API refuses to give.
          setErrorMessage(
            toErrorMessage(error, 'Incorrect mobile number or password.'),
          );
        },
      },
    );
  };

  const handleGooglePress = () => {
    // Google authentication will be connected separately.
  };

  const handleSignupPress = () => {
    router.push('/auth/signup');
  };

  return (
    <WelcomeLogin
      onContinue={handleContinue}
      onGooglePress={handleGooglePress}
      onSignupPress={handleSignupPress}
      isSubmitting={login.isPending}
      submitError={errorMessage}
    />
  );
}
