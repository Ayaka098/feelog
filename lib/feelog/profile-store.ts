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
  updatedAt?: string;
};

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: "me",
  userHandle: "feel",
};

export function loadUserProfile({ includeAvatar = true } = {}) {
  try {
    const raw = window.localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_PROFILE;

    const profile = normalizeUserProfile(JSON.parse(raw));
    return includeAvatar ? profile : withoutProfileAvatar(profile);
  } catch {
    return DEFAULT_USER_PROFILE;
  }
}

export function saveUserProfile(profile: UserProfile, { includeAvatar = true } = {}) {
  try {
    const profileToSave = includeAvatar ? profile : withoutProfileAvatar(profile);
    window.localStorage.setItem(
      USER_PROFILE_STORAGE_KEY,
      JSON.stringify(normalizeUserProfile(profileToSave)),
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
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt
      ? value.updatedAt
      : typeof value.updated_at === "string" && value.updated_at
        ? value.updated_at
        : undefined;

  return {
    displayName,
    userHandle,
    avatarDataUrl,
    avatarStoragePath,
    avatarUrl,
    avatarMimeType,
    avatarSizeBytes,
    updatedAt,
  };
}

export function withoutProfileAvatar(profile: UserProfile): UserProfile {
  return {
    displayName: getProfileDisplayName(profile),
    userHandle: getProfileHandle(profile),
    updatedAt: profile.updatedAt,
  };
}

export function getProfileDisplayName(profile: UserProfile) {
  return normalizeDisplayName(profile.displayName);
}

export function getProfileHandle(profile: UserProfile) {
  return normalizeUserHandle(profile.userHandle);
}

export function getProfileAvatarUrl(profile: UserProfile) {
  if (profile.avatarUrl) {
    if (!profile.updatedAt) return profile.avatarUrl;

    const separator = profile.avatarUrl.includes("?") ? "&" : "?";
    return `${profile.avatarUrl}${separator}v=${encodeURIComponent(profile.updatedAt)}`;
  }

  return profile.avatarDataUrl;
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
