import { useLocalSearchParams } from 'expo-router';
import { router } from 'expo-router';

export function useBackFromDashboard() {
  const params = useLocalSearchParams<{ from?: string }>();
  const fromDashboard = params.from === 'dashboard';

  const goBack = () => {
    if (fromDashboard) {
      router.replace('/(owner)' as any);
    } else {
      router.back();
    }
  };

  return goBack;
}
