import { ProfileView } from "../../components/profile/ProfileView";

type Props = {
  params: Promise<{ username: string }>;
};

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const decoded = decodeURIComponent(username);
  return <ProfileView username={decoded} />;
}
