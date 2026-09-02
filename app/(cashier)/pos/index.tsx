// Redirected — main POS is now at app/(cashier)/index.tsx
import { Redirect } from 'expo-router';
export default function PosRedirect() {
  return <Redirect href="/(cashier)" />;
}
