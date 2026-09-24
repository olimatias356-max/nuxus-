import { ProfileView } from '@/components/ProfileView';
import { useMe } from '@/lib/auth';
import { Loading } from '@/ui';

export default function MeTab() {
  const { profile, userId } = useMe();
  if (!profile) return <Loading />;
  return <ProfileView profile={profile} me={userId} isTab />;
}
