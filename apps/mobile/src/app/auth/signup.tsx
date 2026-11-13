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
            // Supabase stores addresses lowercased; the code step reuses this one.
            email: email.toLowerCase(),
            phone: phoneNumber.replace(/\D/g, ''),
            password,
          },
          {
            // No session yet: the account opens once the emailed code is
            // verified, and that step sends them to the assessment.
            onSuccess: ({ email: address }) => {
              router.replace({ pathname: '/auth/verify-email', params: { email: address } });
            },
            onError: (error) => {
              setErrorMessage(
                toErrorMessage(error, "We couldn't create your account. Please try again."),
              );
            },
          },
        );
      }}
    />
  );
}
