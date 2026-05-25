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
const PROFILE_TEXT_COLUMNS =
  "user_id,display_name,user_handle,created_at,updated_at";
export const PROFILE_AVATAR_BUCKET = "feelog-images";
export const PROFILE_AVATAR_SIGNED_URL_SECONDS = 60 * 60;
const PROFILE_AVATAR_PATH_PATTERN = "{user_id}/profile/avatar-{id}.webp";

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

type SupabaseProfileTextRow = {
  user_id: string;
  display_name: string | null;
  user_handle: string | null;
  created_at: string;
  updated_at: string;
};

type SupabaseProfileErrorOperation =
  | "avatar blob failed"
  | "storage upload failed"
  | "storage download verify failed"
  | "signed URL failed"
  | "profiles update failed"
  | "profiles text update failed"
  | "fetch profile failed"
  | "storage remove failed";

export class SupabaseProfileOperationError extends Error {
  operation: SupabaseProfileErrorOperation;
  context: Record<string, unknown>;
  supabaseError: unknown;

  constructor({
    operation,
    cause,
    context,
  }: {
    operation: SupabaseProfileErrorOperation;
    cause: unknown;
    context: Record<string, unknown>;
  }) {
    super(operation);
    this.name = "SupabaseProfileOperationError";
    this.operation = operation;
    this.context = context;
    this.supabaseError = cause;
  }
}

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
    throw createSupabaseProfileError("fetch profile failed", error, { user_id: userId });
  }

  if (!data) return null;

  return rowToProfile(supabase, data as SupabaseProfileRow);
}

export async function upsertSupabaseTextProfile({
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
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select(PROFILE_TEXT_COLUMNS)
    .single();

  if (error) {
    throw createSupabaseProfileError("profiles text update failed", error, {
      user_id: userId,
      payloadColumns: Object.keys(payload),
    });
  }

  return textRowToProfile(data as SupabaseProfileTextRow);
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
    throw createSupabaseProfileError("profiles update failed", error, {
      user_id: userId,
      payloadColumns: Object.keys(payload),
    });
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
  let blob: Blob;

  try {
    blob = dataUrlToBlob(avatarDataUrl);
  } catch (error) {
    throw createSupabaseProfileError("avatar blob failed", error, {
      user_id: userId,
      bucket: PROFILE_AVATAR_BUCKET,
      storagePath: null,
    });
  }

  const mimeType = blob.type || "image/webp";
  const storagePath = buildProfileAvatarStoragePath(userId);

  const uploadContext = {
    user_id: userId,
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
    throw createSupabaseProfileError("storage upload failed", uploadError, uploadContext);
  }

  const storageObjectVerified = await verifySupabaseProfileAvatarObject({
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
      userId,
      throwOnError: false,
    });
  }

  const avatarUrl = await tryCreateSignedProfileAvatarUrl(supabase, storagePath, {
    ...uploadContext,
    uploadData,
    uploadCompleted: true,
    storageObjectVerified,
  });

  return {
    avatarStoragePath: storagePath,
    avatarUrl,
    avatarMimeType: mimeType,
    avatarSizeBytes: blob.size,
    storageObjectVerified,
    signedUrlCreated: Boolean(avatarUrl),
  };
}

export async function removeSupabaseProfileAvatar({
  supabase,
  storagePath,
  userId,
  throwOnError = true,
}: {
  supabase: SupabaseClient;
  storagePath?: string;
  userId?: string;
  throwOnError?: boolean;
}) {
  if (!storagePath) return true;

  const { error } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .remove([storagePath]);

  if (error) {
    const profileError = createSupabaseProfileError("storage remove failed", error, {
      user_id: userId,
      bucket: PROFILE_AVATAR_BUCKET,
      storagePath,
    });
    if (throwOnError) throw profileError;
    return false;
  }

  return true;
}

function textRowToProfile(row: SupabaseProfileTextRow) {
  return {
    displayName: row.display_name ?? DEFAULT_USER_PROFILE.displayName,
    userHandle: row.user_handle ?? DEFAULT_USER_PROFILE.userHandle,
  } satisfies UserProfile;
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
    throw createSupabaseProfileError("signed URL failed", error, {
      ...context,
      bucket: PROFILE_AVATAR_BUCKET,
      storagePath,
      signedUrlSeconds: PROFILE_AVATAR_SIGNED_URL_SECONDS,
    });
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
    createSupabaseProfileError("storage download verify failed", error, {
      ...context,
      verification: "download after upload",
      rlsHint:
        "Upload succeeded, but reading the object failed. Check Storage select RLS for private buckets.",
    });
    return false;
  }

  return Boolean(data);
}

function buildProfileAvatarStoragePath(userId: string) {
  return `${userId}/profile/avatar-${createStorageObjectId()}.webp`;
}

function createSupabaseProfileError(
  operation: SupabaseProfileErrorOperation,
  error: unknown,
  context: Record<string, unknown>,
) {
  const profileError = new SupabaseProfileOperationError({
    operation,
    cause: error,
    context,
  });
  logSupabaseProfileError(profileError);
  return profileError;
}

function getProfileErrorCause(error: unknown) {
  if (error instanceof SupabaseProfileOperationError) {
    return error.supabaseError;
  }

  return error;
}

function createStorageObjectId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function logSupabaseProfileError(error: SupabaseProfileOperationError) {
  const context = error.context;
  const supabaseError = getProfileErrorCause(error);

  console.error(`[feelog] Supabase profile ${error.operation}`, {
    operation: error.operation,
    bucket: context.bucket,
    storagePath: context.storagePath,
    user_id: context.user_id,
    context,
    supabaseError: getSupabaseErrorDetails(supabaseError),
    profilesTable: {
      table: "profiles",
      selectedColumns: PROFILE_COLUMNS,
      textColumns: PROFILE_TEXT_COLUMNS,
      avatarBucket: PROFILE_AVATAR_BUCKET,
      avatarPathPattern: PROFILE_AVATAR_PATH_PATTERN,
    },
    storageRlsNote:
      "Profile avatars are stored under {user_id}/profile/... so Storage policies can use the same auth.uid() prefix rule as post images.",
    bucketVisibilityNote:
      "The app uses signed URLs and works with a private bucket. createSignedUrl requires Storage select access for the authenticated user.",
    error: supabaseError,
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
