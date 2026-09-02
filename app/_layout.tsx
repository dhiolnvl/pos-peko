import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '@/hooks/useAuth';
import { ErrorBoundary } from '@/components/ErrorBoundary';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { initialize, isInitialized, isAuthenticated, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (isInitialized) {
      SplashScreen.hideAsync();
    }
  }, [isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    console.log('[LAYOUT] routing check — isAuthenticated:', isAuthenticated, '| user:', user?.email ?? 'null', '| segments[0]:', segments[0], '| inAuthGroup:', inAuthGroup);

    if (!isAuthenticated) {
      if (!inAuthGroup) {
        console.log('[LAYOUT] tidak authenticated, redirect ke login');
        router.replace('/(auth)/login');
      }
    } else if (user) {
      if (inAuthGroup) {
        console.log('[LAYOUT] authenticated, redirect ke role:', user.role);
        if (user.role === 'owner') {
          router.replace('/(owner)');
        } else if (user.role === 'back_office') {
          router.replace('/(backoffice)');
        } else if (user.role === 'cashier') {
          router.replace('/(cashier)');
        } else if (user.role === 'staff_pusat') {
          router.replace('/(staff-pusat)' as any);
        }
      }
    }
  }, [isInitialized, isAuthenticated, user, segments]);

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#56B2C1" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(owner)" />
          <Stack.Screen name="(backoffice)" />
          <Stack.Screen name="(cashier)" />
          <Stack.Screen name="(staff-pusat)" />
        </Stack>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
