import type { SupabaseClient } from "@supabase/supabase-js";
import type { DateRange, LikeGrowth, Post } from "./types";
import { createLikeGrowth } from "./post-model";

const POST_COLUMNS =
  "id,user_id,body,like_initial,like_max,like_plateau_hours,like_velocity,created_at,updated_at";
const MAX_EXPORT_ROWS = 1000;
const POSTS_TABLE_DEBUG = {
  table: "posts",
  selectedColumns: POST_COLUMNS,
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
    .select(POST_COLUMNS, { count: "exact" })
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
    posts: ((data ?? []) as SupabasePostRow[]).map(rowToPost),
    total: count ?? 0,
  };
}

export async function fetchSupabasePostsForExport({
  supabase,
  userId,
  range,
}: {
  supabase: SupabaseClient;
  userId: string;
  range: DateRange;
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

  const { data, error } = await request
    .order("created_at", { ascending: true })
    .limit(MAX_EXPORT_ROWS);

  if (error) {
    logSupabasePostError("fetch posts for export", error, {
      userId,
      range,
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
}: {
  supabase: SupabaseClient;
  userId: string;
  body: string;
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

  return rowToPost(data as SupabasePostRow);
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
    .select(POST_COLUMNS)
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

  return rowToPost(data as SupabasePostRow);
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
