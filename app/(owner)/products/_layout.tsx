import { Stack } from 'expo-router';

export default function OwnerProductsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="form" />
      <Stack.Screen name="categories" />
    </Stack>
  );
}
