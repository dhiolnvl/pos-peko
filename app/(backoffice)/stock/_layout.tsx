import { Stack } from 'expo-router';

export default function StockLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="adjustment" />
      <Stack.Screen name="opname" />
      <Stack.Screen name="purchase" />
      <Stack.Screen name="stock-request" />
      <Stack.Screen name="stock-request-form" />
      <Stack.Screen name="incoming-transfers" />
      <Stack.Screen name="incoming-transfer-detail" />
    </Stack>
  );
}
