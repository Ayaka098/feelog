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
export const PROFILE_AVATAR_BUCKET = "feelog-images";
export const PROFILE_AVATAR_SIGNED_URL_SECONDS = 60 * 60;
const PROFILE_AVATAR_PATH_PATTERN = "{user_id}/profile/avatar-{id}.{ext}";

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

  const uploadContext = {
    userId,
    bucket: PROFILE_AVATAR_BUCKET,
    storagePath,
    mimeType,
    sizeBytes: blob.size,
    signedUrlSeconds: PROFILE_AVATAR_SIGNED_URL_SECONDS,
  };
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(storagePath, blob, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    logSupabaseProfileError("upload profile avatar", uploadError, uploadContext);
    throw uploadError;
  }

  await verifySupabaseProfileAvatarObject({
    supabase,
    context: {
      ...uploadContext,
      uploadData,
      uploadCompleted: true,
    },
    storagePath,
  });

  if (previousStoragePath && previousStoragePath !== storagePath) {
    await removeSupabaseProfileAvatar({
      supabase,
      storagePath: previousStoragePath,
      throwOnError: false,
    });
  }

  const avatarUrl = await tryCreateSignedProfileAvatarUrl(supabase, storagePath, {
    ...uploadContext,
    uploadData,
    uploadCompleted: true,
  });

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
  throwOnError = true,
}: {
  supabase: SupabaseClient;
  storagePath?: string;
  throwOnError?: boolean;
}) {
  if (!storagePath) return true;

  const { error } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .remove([storagePath]);

  if (error) {
    logSupabaseProfileError("remove profile avatar", error, {
      bucket: PROFILE_AVATAR_BUCKET,
      storagePath,
    });
    if (throwOnError) throw error;
    return false;
  }

  return true;
}

async function rowToProfile(supabase: SupabaseClient, row: SupabaseProfileRow) {
  const avatarStoragePath = row.avatar_storage_path ?? undefined;
  const avatarUrl = avatarStoragePath
    ? await tryCreateSignedProfileAvatarUrl(supabase, avatarStoragePath, {
        bucket: PROFILE_AVATAR_BUCKET,
        storagePath: avatarStoragePath,
        signedUrlSeconds: PROFILE_AVATAR_SIGNED_URL_SECONDS,
        source: "rowToProfile",
      })
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
  context: Record<string, unknown> = {},
) {
  const { data, error } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .createSignedUrl(storagePath, PROFILE_AVATAR_SIGNED_URL_SECONDS);

  if (error) {
    logSupabaseProfileError("create profile avatar signed url", error, {
      ...context,
      bucket: PROFILE_AVATAR_BUCKET,
      storagePath,
      signedUrlSeconds: PROFILE_AVATAR_SIGNED_URL_SECONDS,
    });
    throw error;
  }

  return data.signedUrl;
}

async function tryCreateSignedProfileAvatarUrl(
  supabase: SupabaseClient,
  storagePath: string,
  context: Record<string, unknown> = {},
) {
  try {
    return await createSignedProfileAvatarUrl(supabase, storagePath, context);
  } catch {
    return undefined;
  }
}

async function verifySupabaseProfileAvatarObject({
  supabase,
  storagePath,
  context,
}: {
  supabase: SupabaseClient;
  storagePath: string;
  context: Record<string, unknown>;
}) {
  const { data, error } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .download(storagePath);

  if (error) {
    logSupabaseProfileError("verify profile avatar storage object", error, {
      ...context,
      verification: "download after upload",
      rlsHint:
        "Upload succeeded, but reading the object failed. Check Storage select RLS for private buckets.",
    });
    return false;
  }

  return Boolean(data);
}

function buildProfileAvatarStoragePath(userId: string, mimeType: string) {
  const extension = getProfileAvatarExtension(mimeType);
  return `${userId}/profile/avatar-${createStorageObjectId()}.${extension}`;
}

function getProfileAvatarExtension(mimeType: string) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "image/heif") return "heif";
  return "webp";
}

function createStorageObjectId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function logSupabaseProfileError(
  operation: string,
  error: unknown,
  context: Record<string, unknown>,
) {
  console.error(`[feelog] Supabase profile ${operation} failed`, {
    operation,
    context,
    supabaseError: getSupabaseErrorDetails(error),
    profilesTable: {
      table: "profiles",
      selectedColumns: PROFILE_COLUMNS,
      avatarBucket: PROFILE_AVATAR_BUCKET,
      avatarPathPattern: PROFILE_AVATAR_PATH_PATTERN,
    },
    storageRlsNote:
      "Profile avatars are stored under {user_id}/profile/... so Storage policies can use the same auth.uid() prefix rule as post images.",
    bucketVisibilityNote:
      "The app uses signed URLs and works with a private bucket. createSignedUrl requires Storage select access for the authenticated user.",
    error,
  });
}

function getSupabaseErrorDetails(error: unknown) {
  if (isRecord(error)) {
    return {
      name: getStringValue(error.name),
      message: getStringValue(error.message),
      code: getStringValue(error.code),
      details: getStringValue(error.details),
      hint: getStringValue(error.hint),
      status: getStringOrNumberValue(error.status),
      statusCode: getStringOrNumberValue(error.statusCode),
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown Supabase error",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getStringOrNumberValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}
