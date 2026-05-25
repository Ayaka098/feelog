import { USER_PROFILE_STORAGE_KEY } from "./constants";
import { isRecord } from "./utils";

export type UserProfile = {
  displayName: string;
  userHandle: string;
  avatarDataUrl?: string;
  avatarStoragePath?: string;
  avatarUrl?: string;
  avatarMimeType?: string;
  avatarSizeBytes?: number;
};

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: "me",
  userHandle: "feel",
};

export function loadUserProfile() {
  try {
    const raw = window.localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_PROFILE;

    return normalizeUserProfile(JSON.parse(raw));
  } catch {
    return DEFAULT_USER_PROFILE;
  }
}

export function saveUserProfile(profile: UserProfile) {
  try {
    window.localStorage.setItem(
      USER_PROFILE_STORAGE_KEY,
      JSON.stringify(normalizeUserProfile(profile)),
    );
  } catch {
    // Profile settings are nice-to-have; the app should keep posting if storage is unavailable.
  }
}

export function normalizeUserProfile(value: unknown): UserProfile {
  if (!isRecord(value)) return DEFAULT_USER_PROFILE;

  const displayName =
    typeof value.displayName === "string"
      ? normalizeDisplayName(value.displayName)
      : DEFAULT_USER_PROFILE.displayName;
  const userHandle =
    typeof value.userHandle === "string"
      ? normalizeUserHandle(value.userHandle)
      : DEFAULT_USER_PROFILE.userHandle;
  const avatarDataUrl =
    typeof value.avatarDataUrl === "string" && value.avatarDataUrl.startsWith("data:image/")
      ? value.avatarDataUrl
      : undefined;
  const avatarStoragePath =
    typeof value.avatarStoragePath === "string" && value.avatarStoragePath
      ? value.avatarStoragePath
      : undefined;
  const avatarUrl =
    typeof value.avatarUrl === "string" && value.avatarUrl ? value.avatarUrl : undefined;
  const avatarMimeType =
    typeof value.avatarMimeType === "string" && value.avatarMimeType
      ? value.avatarMimeType
      : undefined;
  const avatarSizeBytes =
    typeof value.avatarSizeBytes === "number" && Number.isFinite(value.avatarSizeBytes)
      ? value.avatarSizeBytes
      : undefined;

  return {
    displayName,
    userHandle,
    avatarDataUrl,
    avatarStoragePath,
    avatarUrl,
    avatarMimeType,
    avatarSizeBytes,
  };
}

export function getProfileDisplayName(profile: UserProfile) {
  return normalizeDisplayName(profile.displayName);
}

export function getProfileHandle(profile: UserProfile) {
  return normalizeUserHandle(profile.userHandle);
}

export function getProfileAvatarUrl(profile: UserProfile) {
  return profile.avatarUrl || profile.avatarDataUrl;
}

export function normalizeDisplayName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 40);
  return normalized || DEFAULT_USER_PROFILE.displayName;
}

export function normalizeUserHandle(value: string) {
  const normalized = value
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "_")
    .slice(0, 32);

  return normalized || DEFAULT_USER_PROFILE.userHandle;
}
