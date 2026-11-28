import { useLocalSearchParams } from 'expo-router';

import { JarScreen } from '@/features/money/screens/JarScreen';

export default function JarRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <JarScreen id={id} />;
}
