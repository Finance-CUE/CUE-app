import { useLocalSearchParams, useRouter } from 'expo-router';

import { OTPScreen } from '@/features/auth/screens/OTPScreen';

export default function OTPRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phoneNumber?: string }>();

  return (
    <OTPScreen
      phoneNumber={params.phoneNumber ?? ''}
      onBack={() => router.back()}
      onVerify={() => {
        // Authentication will be wired later.
      }}
      onResend={() => {
        // OTP resend will be wired later.
      }}
    />
  );
}