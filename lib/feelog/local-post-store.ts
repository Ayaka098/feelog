import { MAX_STORED_IMAGE_DATA_URL_LENGTH, LOCAL_POSTS_STORAGE_KEY } from "./constants";
import { imagePresets } from "./seed-data";
import { sortPostsNewestFirst } from "./post-model";
import type { LikeGrowth, Post, PostImage } from "./types";
import { clamp, isRecord } from "./utils";

export function loadLocalPosts() {
  try {
    const raw = window.localStorage.getItem(LOCAL_POSTS_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const posts = parsed
      .map((item) => normalizePost(item))
      .filter((item): item is Post => Boolean(item));

    return sortPostsNewestFirst(posts);
  } catch {
    return null;
  }
}

export function saveLocalPosts(posts: Post[]) {
  const preparedPosts = preparePostsForStorage(posts);

  try {
    window.localStorage.setItem(LOCAL_POSTS_STORAGE_KEY, JSON.stringify(preparedPosts));
  } catch {
    const withoutUploadedImages = preparedPosts.map((post) =>
      post.image?.kind === "uploaded" ? { ...post, image: undefined } : post,
    );

    try {
      window.localStorage.setItem(
        LOCAL_POSTS_STORAGE_KEY,
        JSON.stringify(withoutUploadedImages),
      );
    } catch {
      // localStorage may be unavailable in private mode. The in-memory app still works.
    }
  }
}

function preparePostsForStorage(posts: Post[]) {
  return posts.map((post) => {
    if (
      post.image?.kind === "uploaded" &&
      post.image.dataUrl.length > MAX_STORED_IMAGE_DATA_URL_LENGTH
    ) {
      return { ...post, image: undefined };
    }

    return post;
  });
}

function normalizePost(value: unknown): Post | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string" ? value.id : "";
  const body = typeof value.body === "string" ? value.body : "";
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : "";
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : undefined;
  const growth = normalizeGrowth(value.growth);

  if (!id || !body || !createdAt || Number.isNaN(new Date(createdAt).getTime()) || !growth) {
    return null;
  }

  return {
    id,
    body,
    createdAt,
    updatedAt,
    growth,
    image: normalizeImage(value.image),
  };
}

function normalizeGrowth(value: unknown): LikeGrowth | null {
  if (!isRecord(value)) return null;

  const initial = Number(value.initial);
  const max = Number(value.max);
  const plateauHours = Number(value.plateauHours);
  const velocity = Number(value.velocity);

  if (
    !Number.isFinite(initial) ||
    !Number.isFinite(max) ||
    !Number.isFinite(plateauHours) ||
    !Number.isFinite(velocity)
  ) {
    return null;
  }

  const normalizedMax = clamp(Math.round(max), 0, 900);

  return {
    initial: clamp(Math.round(initial), 0, normalizedMax),
    max: normalizedMax,
    plateauHours: clamp(plateauHours, 12, 240),
    velocity: clamp(velocity, 0.6, 4),
  };
}

function normalizeImage(value: unknown): PostImage | undefined {
  if (!isRecord(value)) return undefined;

  if (value.kind === "uploaded") {
    const label = typeof value.label === "string" ? value.label : "添付画像";
    const dataUrl = typeof value.dataUrl === "string" ? value.dataUrl : "";
    const mimeType = typeof value.mimeType === "string" ? value.mimeType : "image/*";
    const size = Number(value.size);

    if (!dataUrl.startsWith("data:image/")) return undefined;

    return {
      kind: "uploaded",
      label,
      dataUrl,
      mimeType,
      size: Number.isFinite(size) ? size : dataUrl.length,
    };
  }

  if (value.kind === "remote") {
    const label = typeof value.label === "string" ? value.label : "添付画像";
    const storagePath = typeof value.storagePath === "string" ? value.storagePath : "";
    const signedUrl = typeof value.signedUrl === "string" ? value.signedUrl : "";
    const mimeType = typeof value.mimeType === "string" ? value.mimeType : "image/*";
    const sizeBytes = Number(value.sizeBytes);

    if (!storagePath || !signedUrl) return undefined;

    return {
      kind: "remote",
      label,
      storagePath,
      signedUrl,
      mimeType,
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    };
  }

  if (
    value.kind === "mock" ||
    (typeof value.gradient === "string" && typeof value.accent === "string")
  ) {
    return {
      kind: "mock",
      label: typeof value.label === "string" ? value.label : "画像",
      gradient: typeof value.gradient === "string" ? value.gradient : imagePresets[0].gradient,
      accent: typeof value.accent === "string" ? value.accent : imagePresets[0].accent,
    };
  }

  return undefined;
}
