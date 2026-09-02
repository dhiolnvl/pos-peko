import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

/**
 * Root index - Router untuk redirect ke halaman yang sesuai
 * berdasarkan authentication state dan role
 */
export default function Index() {
  const { isLoading, isAuthenticated, user, currentBranch } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#56B2C1" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  // Owner needs to select branch first
  if (user?.role === 'owner' && !currentBranch) {
    return <Redirect href="/(auth)/select-branch" />;
  }

  // Redirect based on user role
  if (user?.role === 'owner') {
    return <Redirect href="/(owner)" />;
  } else if (user?.role === 'back_office') {
    return <Redirect href="/(backoffice)" />;
  } else if (user?.role === 'cashier') {
    return <Redirect href="/(cashier)" />;
  }

  // Default fallback
  return <Redirect href="/(auth)/login" />;
}
