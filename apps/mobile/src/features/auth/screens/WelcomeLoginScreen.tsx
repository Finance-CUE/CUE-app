import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { WelcomeLogin } from '@/features/auth/components/WelcomeLogin';

export function WelcomeLoginScreen() {
  const router = useRouter();

  const handleContinue = async (phoneNumber: string) => {
    const cleanedNumber = phoneNumber.replace(/\D/g, '');

    // 1. Validate input first
    if (cleanedNumber.length !== 10) {
      Alert.alert(
        'Invalid number',
        'Please enter a valid 10-digit mobile number.',
      );
      return;
    }

    // 2. Check whether this user exists
    //
    // This will be connected to the CUE backend/database.
    const exists = await checkUserExists(cleanedNumber);

    // 3. New user → signup
    if (!exists) {
      Alert.alert(
        'Account not found',
        'No account exists with this number. Please sign up first.',
        [
          {
            text: 'Sign up',
            onPress: () => {
              router.push({
                pathname: '/auth/signup',
                params: {
                  phoneNumber: cleanedNumber,
                },
              });
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ],
      );

      return;
    }

    // 4. Existing user → OTP
    router.push({
      pathname: '/auth/otp',
      params: {
        phoneNumber: cleanedNumber,
      },
    });
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
    />
  );
}

// Temporary placeholder.
// Replace this with the real API/database check.
async function checkUserExists(phoneNumber: string): Promise<boolean> {
  console.log('Checking user:', phoneNumber);

  return false;
}