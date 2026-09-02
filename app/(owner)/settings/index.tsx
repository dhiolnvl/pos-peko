/**
 * Owner Settings — index redirects to store settings
 */
import { Redirect } from 'expo-router';

export default function SettingsIndex() {
  return <Redirect href="/(owner)/settings/store" />;
}
