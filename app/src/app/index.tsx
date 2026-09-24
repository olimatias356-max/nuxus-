import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function Index() {
  const { session } = useAuth();
  return <Redirect href={session ? '/home' : '/welcome'} />;
}
