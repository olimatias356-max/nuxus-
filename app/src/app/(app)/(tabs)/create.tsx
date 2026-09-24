// Placeholder route for the center tab; the tab bar opens the /create modal.
import { Redirect } from 'expo-router';

export default function CreateTab() {
  return <Redirect href="/create" />;
}
