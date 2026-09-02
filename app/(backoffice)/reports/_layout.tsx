import { Stack } from 'expo-router';

export default function ReportsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="sales" />
      <Stack.Screen name="stock" />
      <Stack.Screen name="shifts" />
      <Stack.Screen name="expenses" />
    </Stack>
  );
}
