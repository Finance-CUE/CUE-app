import { useLocalSearchParams } from 'expo-router';

import { AccountScreen } from '@/features/money/screens/AccountScreen';

export default function AccountRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AccountScreen id={id} />;
}
