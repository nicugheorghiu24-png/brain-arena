"use client";

import { useSyncExternalStore } from "react";
import {
  getServerUser,
  getUser,
  subscribeUser,
} from "../lib/fakeAuth";
import { DEFAULT_PROFILE } from "../lib/fakeData";
import { ProfileView } from "../components/profile/ProfileView";

export default function ProfilePage() {
  const user = useSyncExternalStore(subscribeUser, getUser, getServerUser);
  const username =
    user?.username ?? user?.email?.split("@")[0] ?? DEFAULT_PROFILE.username;
  return <ProfileView username={username} />;
}
