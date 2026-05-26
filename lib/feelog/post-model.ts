import type { DateRange, LikeGrowth, Post, PostImage } from "./types";
import { clamp } from "./utils";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const exportDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function createLikeGrowth(): LikeGrowth {
  const max = Math.round(120 + Math.random() * 780);
  return {
    initial: Math.round(Math.random() * 10),
    max,
    plateauHours: Math.round(54 + Math.random() * 70),
    velocity: 1.35 + Math.random() * 1.25,
  };
}

export function createPost({
  body,
  image,
  now = new Date(),
}: {
  body: string;
  image?: PostImage;
  now?: Date;
}): Post {
  return {
    id: createId(),
    body,
    createdAt: now.toISOString(),
    growth: createLikeGrowth(),
    image,
  };
}

export function updatePostBody(posts: Post[], postId: string, body: string) {
  const updatedAt = new Date().toISOString();

  return posts.map((post) =>
    post.id === postId ? { ...post, body, updatedAt } : post,
  );
}

export function deletePostById(posts: Post[], postId: string) {
  return posts.filter((post) => post.id !== postId);
}

export function filterPosts(posts: Post[], query: string, range: DateRange) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return posts.filter((post) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      post.body.toLocaleLowerCase().includes(normalizedQuery);

    return matchesQuery && isWithinDateRange(post, range);
  });
}

export function getExportPosts(posts: Post[], range: DateRange, keyword = "") {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();

  return posts
    .filter((post) => {
      const matchesKeyword =
        normalizedKeyword.length === 0 ||
        post.body.toLocaleLowerCase().includes(normalizedKeyword);

      return matchesKeyword && isWithinDateRange(post, range);
    })
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

export function buildExportText(posts: Post[]) {
  return posts
    .map((post) => `${formatExportTime(post.createdAt)}\n${post.body.trim()}`)
    .join("\n\n---\n\n");
}

export function calculatePseudoHearts(post: Post, now: number) {
  const maxHearts = clamp(Math.round(post.growth.max), 0, 900);
  const initialHearts = clamp(Math.round(post.growth.initial), 0, maxHearts);
  const ageHours = Math.max(
    0,
    (now - new Date(post.createdAt).getTime()) / (1000 * 60 * 60),
  );
  const progress = clamp(ageHours / post.growth.plateauHours, 0, 1);
  const eased = 1 - Math.pow(1 - progress, post.growth.velocity);

  return Math.min(
    maxHearts,
    Math.round(initialHearts + (maxHearts - initialHearts) * eased),
  );
}

export function sortPostsNewestFirst(posts: Post[]) {
  return [...posts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function formatPostTime(iso: string) {
  return dateFormatter.format(new Date(iso));
}

export function formatExportTime(iso: string) {
  return exportDateFormatter.format(new Date(iso));
}

export function getDateInputValue(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWithinDateRange(post: Post, range: DateRange) {
  const day = getDateInputValue(post.createdAt);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `post-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}
