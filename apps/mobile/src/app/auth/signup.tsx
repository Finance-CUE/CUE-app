import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { SignupScreen } from '@/features/auth/screens/SignupScreen';
import { useSignup } from '@/features/auth/hooks';
import { toErrorMessage } from '@/lib/api';

export default function SignupRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phoneNumber?: string }>();
  const signup = useSignup();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <SignupScreen
      initialPhoneNumber={params.phoneNumber ?? ''}
      isSubmitting={signup.isPending}
      submitError={errorMessage}
      onBack={() => router.back()}
      onLoginPress={() => router.replace('/')}
      onSubmit={({ fullName, email, phoneNumber, password }) => {
        setErrorMessage(null);

        signup.mutate(
          {
            full_name: fullName,
            email,
            phone: phoneNumber.replace(/\D/g, ''),
            password,
          },
          {
            onSuccess: () => {
              router.replace('/explore');
            },
            onError: (error) => {
              setErrorMessage(
                toErrorMessage(error, 'Could not create your account.'),
              );
            },
          },
        );
      }}
    />
  );
}
