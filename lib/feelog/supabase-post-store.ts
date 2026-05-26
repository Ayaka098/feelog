import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadedImageToBlob } from "./image-processing";
import { createLikeGrowth } from "./post-model";
import type { DateRange, LikeGrowth, Post, RemoteImage, UploadedImage } from "./types";

const POST_COLUMNS =
  "id,user_id,body,like_initial,like_max,like_plateau_hours,like_velocity,created_at,updated_at";
const POST_IMAGE_COLUMNS =
  "id,post_id,user_id,storage_path,mime_type,size_bytes,created_at";
const POST_WITH_IMAGES_COLUMNS = `${POST_COLUMNS},post_images(${POST_IMAGE_COLUMNS})`;
const IMAGES_BUCKET = "feelog-images";
const SIGNED_IMAGE_URL_SECONDS = 60 * 60;
const MAX_EXPORT_ROWS = 1000;
const POSTS_TABLE_DEBUG = {
  table: "posts",
  selectedColumns: POST_WITH_IMAGES_COLUMNS,
  imageTable: "post_images",
  imageBucket: IMAGES_BUCKET,
  insertedColumns: [
    "user_id",
    "body",
    "like_initial",
    "like_max",
    "like_plateau_hours",
    "like_velocity",
  ],
  updatedColumns: ["body", "updated_at"],
};

type SupabasePostRow = {
  id: string;
  user_id: string;
  body: string;
  like_initial: number;
  like_max: number;
  like_plateau_hours: number | string;
  like_velocity: number | string;
  created_at: string;
  updated_at: string | null;
};

type SupabasePostImageRow = {
  id: string;
  post_id: string;
  user_id: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | string | null;
  created_at: string;
};

type SupabasePostWithImagesRow = SupabasePostRow & {
  post_images?: SupabasePostImageRow[] | SupabasePostImageRow | null;
};

type SupabasePostPayload = {
  user_id: string;
  body: string;
  like_initial: number;
  like_max: number;
  like_plateau_hours: number;
  like_velocity: number;
};

export async function fetchSupabasePostsPage({
  supabase,
  userId,
  range,
  query,
  offset,
  limit,
}: {
  supabase: SupabaseClient;
  userId: string;
  range: DateRange;
  query: string;
  offset: number;
  limit: number;
}) {
  let request = supabase
    .from("posts")
    .select(POST_WITH_IMAGES_COLUMNS, { count: "exact" })
    .eq("user_id", userId);

  if (range.from) {
    request = request.gte("created_at", toStartOfDayIso(range.from));
  }

  if (range.to) {
    request = request.lt("created_at", toNextDayIso(range.to));
  }

  if (query.trim()) {
    request = request.ilike("body", `%${escapeIlikePattern(query.trim())}%`);
  }

  const pageRequest = request
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await pageRequest;

  if (error) {
    logSupabasePostError("fetch posts", error, {
      userId,
      range,
      query,
      offset,
      limit,
    });
    throw error;
  }

  return {
    posts: await rowsToPostsWithSignedImages(
      supabase,
      (data ?? []) as SupabasePostWithImagesRow[],
    ),
    total: count ?? 0,
  };
}

export async function fetchSupabasePostsForExport({
  supabase,
  userId,
  range,
  keyword,
}: {
  supabase: SupabaseClient;
  userId: string;
  range: DateRange;
  keyword: string;
}) {
  let request = supabase
    .from("posts")
    .select(POST_COLUMNS)
    .eq("user_id", userId);

  if (range.from) {
    request = request.gte("created_at", toStartOfDayIso(range.from));
  }

  if (range.to) {
    request = request.lt("created_at", toNextDayIso(range.to));
  }

  if (keyword.trim()) {
    request = request.ilike("body", `%${escapeIlikePattern(keyword.trim())}%`);
  }

  const { data, error } = await request
    .order("created_at", { ascending: true })
    .limit(MAX_EXPORT_ROWS);

  if (error) {
    logSupabasePostError("fetch posts for export", error, {
      userId,
      range,
      keyword,
      limit: MAX_EXPORT_ROWS,
    });
    throw error;
  }

  return ((data ?? []) as SupabasePostRow[]).map(rowToPost);
}

export async function createSupabasePost({
  supabase,
  userId,
  body,
  image,
}: {
  supabase: SupabaseClient;
  userId: string;
  body: string;
  image?: UploadedImage;
}) {
  const growth = createLikeGrowth();
  const payload = growthToPayload(userId, body, growth);
  const { data, error } = await supabase
    .from("posts")
    .insert(payload)
    .select(POST_COLUMNS)
    .single();

  if (error) {
    logSupabasePostError("create post", error, {
      userId,
      payloadColumns: Object.keys(payload),
      bodyLength: body.length,
      likeMax: growth.max,
    });
    throw error;
  }

  const createdPost = rowToPost(data as SupabasePostRow);

  if (!image) {
    return createdPost;
  }

  let uploadedStoragePath: string | null = null;

  try {
    const remoteImage = await uploadSupabasePostImage({
      supabase,
      userId,
      postId: createdPost.id,
      image,
      onUploaded: (storagePath) => {
        uploadedStoragePath = storagePath;
      },
    });

    return { ...createdPost, image: remoteImage };
  } catch (error) {
    await cleanupFailedPostCreate({
      supabase,
      userId,
      postId: createdPost.id,
      storagePath: uploadedStoragePath,
    });
    throw error;
  }
}

export async function updateSupabasePost({
  supabase,
  userId,
  postId,
  body,
}: {
  supabase: SupabaseClient;
  userId: string;
  postId: string;
  body: string;
}) {
  const { data, error } = await supabase
    .from("posts")
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("user_id", userId)
    .select(POST_WITH_IMAGES_COLUMNS)
    .single();

  if (error) {
    logSupabasePostError("update post", error, {
      userId,
      postId,
      updatedColumns: POSTS_TABLE_DEBUG.updatedColumns,
      bodyLength: body.length,
    });
    throw error;
  }

  return rowToPostWithSignedImage(supabase, data as SupabasePostWithImagesRow);
}

export async function deleteSupabasePost({
  supabase,
  userId,
  postId,
}: {
  supabase: SupabaseClient;
  userId: string;
  postId: string;
}) {
  const imageRows = await fetchSupabasePostImages({ supabase, userId, postId });
  const storagePaths = imageRows.map((image) => image.storage_path);

  if (storagePaths.length > 0) {
    await removeStorageObjects(supabase, storagePaths, {
      operation: "delete post",
      userId,
      postId,
    });

    const { error: imageDeleteError } = await supabase
      .from("post_images")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);

    if (imageDeleteError) {
      logSupabasePostError("delete post image rows", imageDeleteError, {
        userId,
        postId,
        storagePaths,
      });
      throw imageDeleteError;
    }
  }

  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", userId);

  if (error) {
    logSupabasePostError("delete post", error, {
      userId,
      postId,
    });
    throw error;
  }
}

async function uploadSupabasePostImage({
  supabase,
  userId,
  postId,
  image,
  onUploaded,
}: {
  supabase: SupabaseClient;
  userId: string;
  postId: string;
  image: UploadedImage;
  onUploaded: (storagePath: string) => void;
}) {
  const blob = uploadedImageToBlob(image);
  const mimeType = blob.type || image.mimeType || "image/*";
  const storagePath = buildImageStoragePath({
    userId,
    postId,
    fileName: image.label,
    mimeType,
  });

  const { error: uploadError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(storagePath, blob, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    logSupabasePostError("upload post image", uploadError, {
      userId,
      postId,
      storagePath,
      mimeType,
      sizeBytes: blob.size,
    });
    throw uploadError;
  }

  onUploaded(storagePath);

  const imagePayload = {
    post_id: postId,
    user_id: userId,
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: blob.size,
  };
  const { data, error } = await supabase
    .from("post_images")
    .insert(imagePayload)
    .select(POST_IMAGE_COLUMNS)
    .single();

  if (error) {
    logSupabasePostError("create post image row", error, {
      userId,
      postId,
      storagePath,
      insertedColumns: Object.keys(imagePayload),
    });
    throw error;
  }

  const imageRow = data as SupabasePostImageRow;
  const signedUrl = await createSignedImageUrl(supabase, imageRow.storage_path);

  return imageRowToRemoteImage(imageRow, signedUrl);
}

async function fetchSupabasePostImages({
  supabase,
  userId,
  postId,
}: {
  supabase: SupabaseClient;
  userId: string;
  postId: string;
}) {
  const { data, error } = await supabase
    .from("post_images")
    .select(POST_IMAGE_COLUMNS)
    .eq("post_id", postId)
    .eq("user_id", userId);

  if (error) {
    logSupabasePostError("fetch post images", error, {
      userId,
      postId,
    });
    throw error;
  }

  return (data ?? []) as SupabasePostImageRow[];
}

async function rowsToPostsWithSignedImages(
  supabase: SupabaseClient,
  rows: SupabasePostWithImagesRow[],
) {
  return Promise.all(rows.map((row) => rowToPostWithSignedImage(supabase, row)));
}

async function rowToPostWithSignedImage(
  supabase: SupabaseClient,
  row: SupabasePostWithImagesRow,
) {
  const post = rowToPost(row);
  const imageRow = getFirstImageRow(row.post_images);

  if (!imageRow) {
    return post;
  }

  const signedUrl = await createSignedImageUrl(supabase, imageRow.storage_path);

  return {
    ...post,
    image: imageRowToRemoteImage(imageRow, signedUrl),
  };
}

function rowToPost(row: SupabasePostRow): Post {
  return {
    id: row.id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    growth: {
      initial: row.like_initial,
      max: row.like_max,
      plateauHours: Number(row.like_plateau_hours),
      velocity: Number(row.like_velocity),
    },
  };
}

function imageRowToRemoteImage(
  imageRow: SupabasePostImageRow,
  signedUrl: string,
): RemoteImage {
  return {
    kind: "remote",
    label: getFileNameFromStoragePath(imageRow.storage_path),
    storagePath: imageRow.storage_path,
    signedUrl,
    mimeType: imageRow.mime_type ?? "image/*",
    sizeBytes: Number(imageRow.size_bytes ?? 0),
  };
}

function getFirstImageRow(
  value: SupabasePostWithImagesRow["post_images"],
): SupabasePostImageRow | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

async function createSignedImageUrl(supabase: SupabaseClient, storagePath: string) {
  const { data, error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_IMAGE_URL_SECONDS);

  if (error) {
    logSupabasePostError("create signed image url", error, {
      storagePath,
      signedUrlSeconds: SIGNED_IMAGE_URL_SECONDS,
    });
    throw error;
  }

  return data.signedUrl;
}

async function removeStorageObjects(
  supabase: SupabaseClient,
  storagePaths: string[],
  context: Record<string, unknown>,
) {
  const { error } = await supabase.storage.from(IMAGES_BUCKET).remove(storagePaths);

  if (error) {
    logSupabasePostError("remove storage images", error, {
      ...context,
      storagePaths,
    });
    throw error;
  }
}

async function cleanupFailedPostCreate({
  supabase,
  userId,
  postId,
  storagePath,
}: {
  supabase: SupabaseClient;
  userId: string;
  postId: string;
  storagePath: string | null;
}) {
  try {
    if (storagePath) {
      await removeStorageObjects(supabase, [storagePath], {
        operation: "cleanup failed post create",
        userId,
        postId,
      });
    }

    await supabase
      .from("post_images")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);

    await supabase.from("posts").delete().eq("id", postId).eq("user_id", userId);
  } catch (cleanupError) {
    console.error("[feelog] Supabase cleanup after failed image post failed", {
      cleanupError,
      userId,
      postId,
      storagePath,
    });
  }
}

function buildImageStoragePath({
  userId,
  postId,
  fileName,
  mimeType,
}: {
  userId: string;
  postId: string;
  fileName: string;
  mimeType: string;
}) {
  return `${userId}/${postId}/${toStorageFileName(fileName, mimeType)}`;
}

function toStorageFileName(fileName: string, mimeType: string) {
  const baseName =
    fileName
      .replace(/\.[^.]+$/, "")
      .trim()
      .replaceAll(/\s+/g, "-")
      .replaceAll(/[^a-zA-Z0-9_-]/g, "-")
      .replaceAll(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "image";
  const extension = getExtensionForMimeType(mimeType) ?? getExtensionFromFileName(fileName);

  return `${baseName}.${extension ?? "jpg"}`;
}

function getExtensionForMimeType(mimeType: string) {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  return null;
}

function getExtensionFromFileName(fileName: string) {
  const match = /\.([a-zA-Z0-9]{2,8})$/.exec(fileName);
  return match?.[1]?.toLowerCase() ?? null;
}

function getFileNameFromStoragePath(storagePath: string) {
  return storagePath.split("/").at(-1) || "添付画像";
}

function growthToPayload(
  userId: string,
  body: string,
  growth: LikeGrowth,
): SupabasePostPayload {
  return {
    user_id: userId,
    body,
    like_initial: growth.initial,
    like_max: growth.max,
    like_plateau_hours: growth.plateauHours,
    like_velocity: growth.velocity,
  };
}

function toStartOfDayIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function toNextDayIso(value: string) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function escapeIlikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function logSupabasePostError(
  operation: string,
  error: unknown,
  context: Record<string, unknown>,
) {
  console.error(`[feelog] Supabase ${operation} failed`, {
    error,
    context,
    postsTable: POSTS_TABLE_DEBUG,
    rlsNote:
      "RLS requires the authenticated user id to match posts.user_id. Check auth.uid() = user_id policies.",
  });
}
