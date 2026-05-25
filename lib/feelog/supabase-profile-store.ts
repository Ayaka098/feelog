import type { SupabaseClient } from "@supabase/supabase-js";
import { dataUrlToBlob } from "./image-processing";
import {
  DEFAULT_USER_PROFILE,
  getProfileDisplayName,
  getProfileHandle,
  type UserProfile,
} from "./profile-store";

const PROFILE_COLUMNS =
  "user_id,display_name,user_handle,avatar_storage_path,avatar_mime_type,avatar_size_bytes,created_at,updated_at";
const PROFILE_AVATAR_BUCKET = "feelog-images";
const PROFILE_AVATAR_SIGNED_URL_SECONDS = 60 * 60;

type SupabaseProfileRow = {
  user_id: string;
  display_name: string | null;
  user_handle: string | null;
  avatar_storage_path: string | null;
  avatar_mime_type: string | null;
  avatar_size_bytes: number | string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchSupabaseProfile({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logSupabaseProfileError("fetch profile", error, { userId });
    throw error;
  }

  if (!data) return null;

  return rowToProfile(supabase, data as SupabaseProfileRow);
}

export async function upsertSupabaseProfile({
  supabase,
  userId,
  profile,
}: {
  supabase: SupabaseClient;
  userId: string;
  profile: UserProfile;
}) {
  const payload = {
    user_id: userId,
    display_name: getProfileDisplayName(profile),
    user_handle: getProfileHandle(profile),
    avatar_storage_path: profile.avatarStoragePath ?? null,
    avatar_mime_type: profile.avatarMimeType ?? null,
    avatar_size_bytes: profile.avatarSizeBytes ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    logSupabaseProfileError("upsert profile", error, {
      userId,
      payloadColumns: Object.keys(payload),
    });
    throw error;
  }

  return rowToProfile(supabase, data as SupabaseProfileRow);
}

export async function uploadSupabaseProfileAvatar({
  supabase,
  userId,
  avatarDataUrl,
  previousStoragePath,
}: {
  supabase: SupabaseClient;
  userId: string;
  avatarDataUrl: string;
  previousStoragePath?: string;
}) {
  const blob = dataUrlToBlob(avatarDataUrl);
  const mimeType = blob.type || "image/webp";
  const storagePath = buildProfileAvatarStoragePath(userId, mimeType);

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(storagePath, blob, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    logSupabaseProfileError("upload profile avatar", uploadError, {
      userId,
      storagePath,
      mimeType,
      sizeBytes: blob.size,
    });
    throw uploadError;
  }

  if (previousStoragePath && previousStoragePath !== storagePath) {
    await removeSupabaseProfileAvatar({ supabase, storagePath: previousStoragePath });
  }

  const avatarUrl = await createSignedProfileAvatarUrl(supabase, storagePath);

  return {
    avatarStoragePath: storagePath,
    avatarUrl,
    avatarMimeType: mimeType,
    avatarSizeBytes: blob.size,
  };
}

export async function removeSupabaseProfileAvatar({
  supabase,
  storagePath,
}: {
  supabase: SupabaseClient;
  storagePath?: string;
}) {
  if (!storagePath) return;

  const { error } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .remove([storagePath]);

  if (error) {
    logSupabaseProfileError("remove profile avatar", error, { storagePath });
    throw error;
  }
}

async function rowToProfile(supabase: SupabaseClient, row: SupabaseProfileRow) {
  const avatarStoragePath = row.avatar_storage_path ?? undefined;
  const avatarUrl = avatarStoragePath
    ? await createSignedProfileAvatarUrl(supabase, avatarStoragePath)
    : undefined;
  const avatarSizeBytes = Number(row.avatar_size_bytes ?? 0);

  return {
    displayName: row.display_name ?? DEFAULT_USER_PROFILE.displayName,
    userHandle: row.user_handle ?? DEFAULT_USER_PROFILE.userHandle,
    avatarStoragePath,
    avatarUrl,
    avatarMimeType: row.avatar_mime_type ?? undefined,
    avatarSizeBytes: Number.isFinite(avatarSizeBytes) && avatarSizeBytes > 0
      ? avatarSizeBytes
      : undefined,
  } satisfies UserProfile;
}

async function createSignedProfileAvatarUrl(
  supabase: SupabaseClient,
  storagePath: string,
) {
  const { data, error } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .createSignedUrl(storagePath, PROFILE_AVATAR_SIGNED_URL_SECONDS);

  if (error) {
    logSupabaseProfileError("create profile avatar signed url", error, {
      storagePath,
      signedUrlSeconds: PROFILE_AVATAR_SIGNED_URL_SECONDS,
    });
    throw error;
  }

  return data.signedUrl;
}

function buildProfileAvatarStoragePath(userId: string, mimeType: string) {
  const extension = mimeType === "image/jpeg" || mimeType === "image/jpg" ? "jpg" : "webp";
  return `profiles/${userId}/avatar.${extension}`;
}

function logSupabaseProfileError(
  operation: string,
  error: unknown,
  context: Record<string, unknown>,
) {
  console.error(`[feelog] ${operation} failed`, {
    ...context,
    profilesTable: {
      table: "profiles",
      selectedColumns: PROFILE_COLUMNS,
      avatarBucket: PROFILE_AVATAR_BUCKET,
      avatarPathPattern: "profiles/{user_id}/avatar.webp",
    },
    error,
  });
}
