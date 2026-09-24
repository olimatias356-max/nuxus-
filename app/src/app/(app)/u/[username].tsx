import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { UserX } from 'lucide-react-native';

import { ProfileView } from '@/components/ProfileView';
import { useProfile } from '@/lib/api/social';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { EmptyState, ErrorState, Header, Loading } from '@/ui';

export default function UserProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { userId } = useMe();
  const q = useProfile(username);
  if (q.isLoading) return <Loading />;
  if (q.isError)
    return (
      <View style={{ flex: 1 }}>
        <Header />
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </View>
    );
  if (!q.data)
    return (
      <View style={{ flex: 1 }}>
        <Header />
        <EmptyState icon={UserX} title="Perfil no disponible" text="La cuenta no existe o no está disponible para vos." />
      </View>
    );
  return <ProfileView profile={q.data} me={userId} />;
}
