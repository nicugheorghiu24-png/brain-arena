"use client";

import { useAuth } from "../components/AuthProvider";
import { DEFAULT_PROFILE } from "../lib/fakeData";
import { ProfileView } from "../components/profile/ProfileView";

export default function ProfilePage() {
  const { user } = useAuth();
  const username =
    user?.username ?? user?.email?.split("@")[0] ?? DEFAULT_PROFILE.username;
  return <ProfileView username={username} />;
}
