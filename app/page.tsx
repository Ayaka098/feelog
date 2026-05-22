"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type HeartGrowth = {
  initial: number;
  max: number;
  plateauHours: number;
  velocity: number;
};

type MockImage = {
  kind: "mock";
  label: string;
  gradient: string;
  accent: string;
};

type UploadedImage = {
  kind: "uploaded";
  label: string;
  dataUrl: string;
  mimeType: string;
  size: number;
};

type PostImage = MockImage | UploadedImage;

type FeelogPost = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  growth: HeartGrowth;
  image?: PostImage;
};

type DraftImage = PostImage | undefined;

const PINK = "#f8a9c8";
const PINK_HOVER = "#f48bb5";
const HYDRATION_NOW = new Date("2026-05-22T12:00:00+09:00").getTime();
const STORAGE_KEY = "feelog.posts.v1";
const MAX_IMAGE_EDGE = 1600;
const MAX_STORED_IMAGE_DATA_URL_LENGTH = 2_800_000;

const imagePresets: MockImage[] = [
  {
    kind: "mock",
    label: "窓辺",
    gradient:
      "linear-gradient(135deg, #f8a9c8 0%, #ffd9e6 42%, #b9e8ff 100%)",
    accent: "#f48bb5",
  },
  {
    kind: "mock",
    label: "夜道",
    gradient:
      "linear-gradient(135deg, #1f2937 0%, #64748b 48%, #f8a9c8 100%)",
    accent: "#94a3b8",
  },
  {
    kind: "mock",
    label: "机",
    gradient:
      "linear-gradient(135deg, #fafafa 0%, #e5e7eb 46%, #fde68a 100%)",
    accent: "#facc15",
  },
  {
    kind: "mock",
    label: "空",
    gradient:
      "linear-gradient(135deg, #dbeafe 0%, #bae6fd 50%, #fecdd3 100%)",
    accent: "#38bdf8",
  },
];

const initialPosts: FeelogPost[] = [
  {
    id: "seed-1",
    body: "朝の空気が思ったより軽かった。\n昨日の不安がまだ少し残っているけど、コーヒーを淹れたら体のほうが先に起きてくれた感じがする。",
    createdAt: "2026-05-22T08:18:00+09:00",
    growth: { initial: 4, max: 328, plateauHours: 82, velocity: 2.2 },
    image: imagePresets[0],
  },
  {
    id: "seed-2",
    body: "返事を急がなくていい、と思えた瞬間に肩が少し下がった。ちゃんと落ち着いてからでいい。",
    createdAt: "2026-05-21T23:41:00+09:00",
    growth: { initial: 7, max: 612, plateauHours: 96, velocity: 1.65 },
  },
  {
    id: "seed-3",
    body: "昼に散歩した。何かが解決したわけじゃないけど、歩幅がそろうと考えも少しそろう。",
    createdAt: "2026-05-21T14:06:00+09:00",
    growth: { initial: 11, max: 184, plateauHours: 58, velocity: 2.6 },
    image: imagePresets[3],
  },
  {
    id: "seed-4",
    body: "あの一言が思ったより刺さっていた。怒りというより、雑に扱われた感じが残っている。",
    createdAt: "2026-05-20T19:33:00+09:00",
    growth: { initial: 2, max: 873, plateauHours: 118, velocity: 1.45 },
  },
  {
    id: "seed-5",
    body: "今日は何も進んでいないようで、実はかなり休めた日だったのかもしれない。",
    createdAt: "2026-05-18T22:09:00+09:00",
    growth: { initial: 13, max: 421, plateauHours: 72, velocity: 2.05 },
  },
  {
    id: "seed-6",
    body: "机の上を少し片付けた。視界が静かになると、頭の中もほんの少し静かになる。",
    createdAt: "2026-05-17T10:24:00+09:00",
    growth: { initial: 8, max: 255, plateauHours: 64, velocity: 2.4 },
    image: imagePresets[2],
  },
];

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function calculatePseudoHearts(post: FeelogPost, now: number) {
  const ageHours = Math.max(
    0,
    (now - new Date(post.createdAt).getTime()) / (1000 * 60 * 60),
  );
  const progress = clamp(ageHours / post.growth.plateauHours, 0, 1);
  const eased = 1 - Math.pow(1 - progress, post.growth.velocity);
  return Math.min(
    post.growth.max,
    Math.round(post.growth.initial + (post.growth.max - post.growth.initial) * eased),
  );
}

function formatPostTime(iso: string) {
  return dateFormatter.format(new Date(iso));
}

function formatExportTime(iso: string) {
  return exportDateFormatter.format(new Date(iso));
}

function getDateInputValue(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWithinDateRange(post: FeelogPost, from: string, to: string) {
  const day = getDateInputValue(post.createdAt);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function createGrowth(): HeartGrowth {
  const max = Math.round(120 + Math.random() * 760);
  return {
    initial: Math.round(Math.random() * 10),
    max,
    plateauHours: Math.round(54 + Math.random() * 70),
    velocity: 1.35 + Math.random() * 1.25,
  };
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `post-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeGrowth(value: unknown): HeartGrowth | null {
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

  return {
    initial: clamp(Math.round(initial), 0, 30),
    max: clamp(Math.round(max), 0, 900),
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

function normalizePost(value: unknown): FeelogPost | null {
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

function loadStoredPosts() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const posts = parsed
      .map((item) => normalizePost(item))
      .filter((item): item is FeelogPost => Boolean(item))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return posts;
  } catch {
    return null;
  }
}

function preparePostsForStorage(posts: FeelogPost[]) {
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

function savePostsToStorage(posts: FeelogPost[]) {
  const preparedPosts = preparePostsForStorage(posts);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preparedPosts));
  } catch {
    const withoutUploadedImages = preparedPosts.map((post) =>
      post.image?.kind === "uploaded" ? { ...post, image: undefined } : post,
    );

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutUploadedImages));
    } catch {
      // localStorage may be unavailable in private mode. The in-memory app still works.
    }
  }
}

function buildExportText(posts: FeelogPost[]) {
  return posts
    .map((post) => `${formatExportTime(post.createdAt)}\n${post.body.trim()}`)
    .join("\n\n---\n\n");
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("コピーできませんでした");
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("画像を読み込めませんでした"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("画像を読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした"));
    image.src = dataUrl;
  });
}

async function fileToUploadedImage(file: File): Promise<UploadedImage> {
  const originalDataUrl = await readFileAsDataUrl(file);

  try {
    const image = await loadImageElement(originalDataUrl);
    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("画像を変換できませんでした");
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const webpDataUrl = canvas.toDataURL("image/webp", 0.82);
    const dataUrl = webpDataUrl.startsWith("data:image/webp")
      ? webpDataUrl
      : canvas.toDataURL("image/jpeg", 0.84);

    return {
      kind: "uploaded",
      label: file.name || "添付画像",
      dataUrl,
      mimeType: dataUrl.slice(5, dataUrl.indexOf(";")) || file.type,
      size: dataUrl.length,
    };
  } catch {
    return {
      kind: "uploaded",
      label: file.name || "添付画像",
      dataUrl: originalDataUrl,
      mimeType: file.type || "image/*",
      size: originalDataUrl.length,
    };
  }
}

export default function Home() {
  const [posts, setPosts] = useState<FeelogPost[]>(initialPosts);
  const [body, setBody] = useState("");
  const [draftImage, setDraftImage] = useState<DraftImage>();
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exportFromDate, setExportFromDate] = useState("");
  const [exportToDate, setExportToDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [now, setNow] = useState(HYDRATION_NOW);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [storageReady, setStorageReady] = useState(false);
  const [imageStatus, setImageStatus] = useState("");

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedPosts = loadStoredPosts();
      if (storedPosts) {
        setPosts(storedPosts);
      }
      setStorageReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    savePostsToStorage(posts);
  }, [posts, storageReady]);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return posts.filter((post) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        post.body.toLocaleLowerCase().includes(normalizedQuery);
      return matchesQuery && isWithinDateRange(post, fromDate, toDate);
    });
  }, [fromDate, posts, query, toDate]);

  const exportPosts = useMemo(
    () =>
      posts
        .filter((post) => isWithinDateRange(post, exportFromDate, exportToDate))
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [exportFromDate, exportToDate, posts],
  );

  const exportText = useMemo(() => buildExportText(exportPosts), [exportPosts]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    const nextPost: FeelogPost = {
      id: createId(),
      body: trimmed,
      createdAt: new Date().toISOString(),
      growth: createGrowth(),
      image: draftImage,
    };

    setPosts((currentPosts) => [nextPost, ...currentPosts]);
    setBody("");
    setDraftImage(undefined);
    setImageStatus("");
  }

  async function handleImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setImageStatus("画像ファイルを選んでください");
      return;
    }

    setImageStatus("画像を準備中");

    try {
      const image = await fileToUploadedImage(file);
      setDraftImage(image);
      setImageStatus(
        image.dataUrl.length > MAX_STORED_IMAGE_DATA_URL_LENGTH
          ? "大きい画像はこの画面でのみ表示されます"
          : "",
      );
    } catch {
      setImageStatus("画像を読み込めませんでした");
    }
  }

  function clearDraftImage() {
    setDraftImage(undefined);
    setImageStatus("");
  }

  function startEditing(post: FeelogPost) {
    setEditingId(post.id);
    setEditingBody(post.body);
  }

  function saveEditing(postId: string) {
    const trimmed = editingBody.trim();
    if (!trimmed) return;
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? { ...post, body: trimmed, updatedAt: new Date().toISOString() }
          : post,
      ),
    );
    setEditingId(null);
    setEditingBody("");
  }

  function deletePost(postId: string) {
    const confirmed = window.confirm("この投稿を削除しますか？");
    if (!confirmed) return;
    setPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
  }

  async function copyExportText() {
    if (!exportText) return;
    try {
      await writeClipboardText(exportText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  }

  return (
    <div className="min-h-screen bg-white text-neutral-950">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 md:grid-cols-[88px_minmax(0,620px)] xl:grid-cols-[180px_minmax(0,620px)_350px]">
        <AppRail />

        <main className="min-h-screen border-x border-neutral-200 bg-white" id="top">
          <header className="sticky top-0 z-30 flex h-[53px] items-center border-b border-neutral-200 bg-white/90 px-4 backdrop-blur-md">
            <div>
              <h1 className="text-xl font-bold leading-6 tracking-normal">feelog</h1>
              <p className="text-[13px] leading-4 text-neutral-500">感情の備忘録</p>
            </div>
          </header>

          <Composer
            body={body}
            draftImage={draftImage}
            onBodyChange={setBody}
            onClearImage={clearDraftImage}
            onImageFileChange={handleImageFileChange}
            onSubmit={handleSubmit}
            status={imageStatus}
          />

          <div className="border-b border-neutral-200 xl:hidden">
            <ToolsPanel
              copyState={copyState}
              exportFromDate={exportFromDate}
              exportText={exportText}
              exportToDate={exportToDate}
              fromDate={fromDate}
              idPrefix="mobile"
              onCopy={copyExportText}
              query={query}
              resultCount={filteredPosts.length}
              setExportFromDate={setExportFromDate}
              setExportToDate={setExportToDate}
              setFromDate={setFromDate}
              setQuery={setQuery}
              setToDate={setToDate}
              toDate={toDate}
            />
          </div>

          <section aria-label="タイムライン">
            {filteredPosts.length > 0 ? (
              filteredPosts.map((post) => (
                <PostItem
                  editingBody={editingBody}
                  editingId={editingId}
                  hearts={calculatePseudoHearts(post, now)}
                  key={post.id}
                  onCancelEdit={() => {
                    setEditingId(null);
                    setEditingBody("");
                  }}
                  onDelete={() => deletePost(post.id)}
                  onEdit={() => startEditing(post)}
                  onEditingBodyChange={setEditingBody}
                  onSaveEdit={() => saveEditing(post.id)}
                  post={post}
                />
              ))
            ) : (
              <div className="px-6 py-14 text-center">
                <p className="text-[15px] font-semibold text-neutral-900">
                  見つかりませんでした
                </p>
                <p className="mt-1 text-[14px] text-neutral-500">
                  検索条件を少しゆるめてみてください。
                </p>
              </div>
            )}
          </section>
        </main>

        <aside className="hidden xl:block">
          <div className="sticky top-0 max-h-screen overflow-y-auto px-5 py-3">
            <ToolsPanel
              copyState={copyState}
              exportFromDate={exportFromDate}
              exportText={exportText}
              exportToDate={exportToDate}
              fromDate={fromDate}
              idPrefix="desktop"
              onCopy={copyExportText}
              query={query}
              resultCount={filteredPosts.length}
              setExportFromDate={setExportFromDate}
              setExportToDate={setExportToDate}
              setFromDate={setFromDate}
              setQuery={setQuery}
              setToDate={setToDate}
              toDate={toDate}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function AppRail() {
  return (
    <aside className="sticky top-0 hidden h-screen flex-col justify-between px-3 py-3 md:flex">
      <div className="space-y-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full text-[22px] font-black text-neutral-950 md:mx-auto xl:mx-0">
          f
        </div>
        <nav className="space-y-1 text-[17px] font-semibold">
          <a
            className="flex h-12 items-center gap-4 rounded-full px-3 transition-colors hover:bg-pink-50"
            href="#top"
          >
            <span aria-hidden="true" className="text-xl">
              ⌂
            </span>
            <span className="hidden xl:inline">ホーム</span>
          </a>
          <a
            className="flex h-12 items-center gap-4 rounded-full px-3 transition-colors hover:bg-pink-50 xl:hidden"
            href="#mobile-search"
          >
            <span aria-hidden="true" className="text-xl">
              ⌕
            </span>
            <span className="hidden xl:inline">検索</span>
          </a>
          <a
            className="hidden h-12 items-center gap-4 rounded-full px-3 transition-colors hover:bg-pink-50 xl:flex"
            href="#desktop-search"
          >
            <span aria-hidden="true" className="text-xl">
              ⌕
            </span>
            <span className="hidden xl:inline">検索</span>
          </a>
          <a
            className="flex h-12 items-center gap-4 rounded-full px-3 transition-colors hover:bg-pink-50 xl:hidden"
            href="#mobile-export"
          >
            <span aria-hidden="true" className="text-xl">
              ⇪
            </span>
            <span className="hidden xl:inline">出力</span>
          </a>
          <a
            className="hidden h-12 items-center gap-4 rounded-full px-3 transition-colors hover:bg-pink-50 xl:flex"
            href="#desktop-export"
          >
            <span aria-hidden="true" className="text-xl">
              ⇪
            </span>
            <span className="hidden xl:inline">出力</span>
          </a>
        </nav>
      </div>
      <div className="hidden rounded-full border border-neutral-200 px-3 py-2 xl:block">
        <p className="text-[13px] font-semibold leading-4">ローカルMVP</p>
        <p className="text-[12px] leading-4 text-neutral-500">同期なし</p>
      </div>
    </aside>
  );
}

function Composer({
  body,
  draftImage,
  onBodyChange,
  onClearImage,
  onImageFileChange,
  onSubmit,
  status,
}: {
  body: string;
  draftImage: DraftImage;
  onBodyChange: (value: string) => void;
  onClearImage: () => void;
  onImageFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  status: string;
}) {
  return (
    <form
      className="sticky top-[53px] z-20 border-b border-neutral-200 bg-white/95 px-4 pt-3 backdrop-blur-md"
      onSubmit={onSubmit}
    >
      <div className="flex gap-3">
        <Avatar />
        <div className="min-w-0 flex-1">
          <textarea
            className="min-h-24 w-full resize-none bg-transparent pt-2 text-[20px] leading-7 text-neutral-950 outline-none placeholder:text-neutral-500"
            onChange={(event) => onBodyChange(event.target.value)}
            placeholder="いまどう思った？"
            value={body}
          />

          {draftImage ? (
            <div className="mb-3">
              <PostImagePreview image={draftImage} />
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-neutral-100 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <label
                className="flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-[14px] font-semibold transition-colors hover:bg-pink-50"
                style={{ color: PINK_HOVER }}
              >
                <span aria-hidden="true" className="text-[18px] leading-none">
                  ▧
                </span>
                画像
                <input
                  accept="image/*"
                  className="sr-only"
                  onChange={onImageFileChange}
                  type="file"
                />
              </label>
              {draftImage ? (
                <button
                  className="h-9 rounded-full px-3 text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100"
                  onClick={onClearImage}
                  type="button"
                >
                  解除
                </button>
              ) : null}
              {status ? (
                <span className="truncate text-[12px] font-medium text-neutral-500">
                  {status}
                </span>
              ) : null}
            </div>
            <button
              className="h-9 rounded-full px-5 text-[15px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!body.trim()}
              style={{ backgroundColor: body.trim() ? PINK : "#f5b8cf" }}
              type="submit"
            >
              投稿
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function PostItem({
  editingBody,
  editingId,
  hearts,
  onCancelEdit,
  onDelete,
  onEdit,
  onEditingBodyChange,
  onSaveEdit,
  post,
}: {
  editingBody: string;
  editingId: string | null;
  hearts: number;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onEditingBodyChange: (value: string) => void;
  onSaveEdit: () => void;
  post: FeelogPost;
}) {
  const isEditing = editingId === post.id;

  return (
    <article className="border-b border-neutral-200 px-4 py-3 transition-colors hover:bg-neutral-50/70">
      <div className="flex gap-3">
        <Avatar compact />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-[15px] leading-5">
              <span className="font-bold text-neutral-950">me</span>
              <span className="ml-2 text-neutral-500">@feel</span>
              <span className="mx-1 text-neutral-500">·</span>
              <time className="text-neutral-500" dateTime={post.createdAt}>
                {formatPostTime(post.createdAt)}
              </time>
              {post.updatedAt ? (
                <span className="ml-2 text-[13px] text-neutral-500">編集済み</span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1 text-[13px]">
              <button
                className="rounded-full px-2 py-1 font-medium text-neutral-500 transition-colors hover:bg-pink-50"
                onClick={onEdit}
                type="button"
              >
                編集
              </button>
              <button
                className="rounded-full px-2 py-1 font-medium text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600"
                onClick={onDelete}
                type="button"
              >
                削除
              </button>
            </div>
          </div>

          {isEditing ? (
            <div className="mt-2">
              <textarea
                className="min-h-28 w-full resize-y rounded-2xl border border-neutral-200 bg-white p-3 text-[16px] leading-6 outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
                onChange={(event) => onEditingBodyChange(event.target.value)}
                value={editingBody}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  className="h-9 rounded-full px-4 text-[14px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-100"
                  onClick={onCancelEdit}
                  type="button"
                >
                  キャンセル
                </button>
                <button
                  className="h-9 rounded-full px-4 text-[14px] font-bold text-white transition-colors disabled:opacity-50"
                  disabled={!editingBody.trim()}
                  onClick={onSaveEdit}
                  style={{ backgroundColor: editingBody.trim() ? PINK : "#f5b8cf" }}
                  type="button"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-6 text-neutral-950">
                {post.body}
              </p>
              {post.image ? (
                <div className="mt-3">
                  <PostImagePreview image={post.image} />
                </div>
              ) : null}
            </>
          )}

          <div className="mt-3 flex max-w-xs items-center justify-between text-[14px] text-neutral-500">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-[17px]" style={{ color: PINK_HOVER }}>
                ♡
              </span>
              <span>{hearts}</span>
            </div>
            <span className="text-[13px] text-neutral-400">private</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function ToolsPanel({
  copyState,
  exportFromDate,
  exportText,
  exportToDate,
  fromDate,
  idPrefix,
  onCopy,
  query,
  resultCount,
  setExportFromDate,
  setExportToDate,
  setFromDate,
  setQuery,
  setToDate,
  toDate,
}: {
  copyState: "idle" | "copied" | "failed";
  exportFromDate: string;
  exportText: string;
  exportToDate: string;
  fromDate: string;
  idPrefix: string;
  onCopy: () => void;
  query: string;
  resultCount: number;
  setExportFromDate: (value: string) => void;
  setExportToDate: (value: string) => void;
  setFromDate: (value: string) => void;
  setQuery: (value: string) => void;
  setToDate: (value: string) => void;
  toDate: string;
}) {
  const copyLabel =
    copyState === "copied"
      ? "コピー済み"
      : copyState === "failed"
        ? "失敗"
        : "コピー";

  return (
    <div className="space-y-4 px-4 py-4 xl:px-0 xl:py-0">
      <section aria-labelledby={`${idPrefix}-search-title`} id={`${idPrefix}-search`}>
        <h2
          className="mb-3 text-[20px] font-extrabold tracking-normal"
          id={`${idPrefix}-search-title`}
        >
          検索
        </h2>
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
          <label className="sr-only" htmlFor={`${idPrefix}-keyword`}>
            キーワード
          </label>
          <input
            className="h-11 w-full rounded-full border border-transparent bg-white px-4 text-[15px] outline-none transition focus:border-pink-200 focus:ring-2 focus:ring-pink-100"
            id={`${idPrefix}-keyword`}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="検索"
            type="search"
            value={query}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <DateField
              id={`${idPrefix}-from`}
              label="開始日"
              onChange={setFromDate}
              value={fromDate}
            />
            <DateField
              id={`${idPrefix}-to`}
              label="終了日"
              onChange={setToDate}
              value={toDate}
            />
          </div>
          <p className="mt-3 text-[13px] font-medium text-neutral-500">
            {resultCount}件
          </p>
        </div>
      </section>

      <section aria-labelledby={`${idPrefix}-export-title`} id={`${idPrefix}-export`}>
        <div className="mb-3 flex items-center justify-between">
          <h2
            className="text-[20px] font-extrabold tracking-normal"
            id={`${idPrefix}-export-title`}
          >
            AI出力
          </h2>
          <button
            className="h-9 rounded-full px-4 text-[14px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!exportText}
            onClick={onCopy}
            style={{ backgroundColor: exportText ? PINK : "#f5b8cf" }}
            type="button"
          >
            {copyLabel}
          </button>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <DateField
              id={`${idPrefix}-export-from`}
              label="開始日"
              onChange={setExportFromDate}
              value={exportFromDate}
            />
            <DateField
              id={`${idPrefix}-export-to`}
              label="終了日"
              onChange={setExportToDate}
              value={exportToDate}
            />
          </div>
          <textarea
            className="mt-3 min-h-44 w-full resize-y rounded-2xl border border-neutral-200 bg-white p-3 font-mono text-[12px] leading-5 text-neutral-800 outline-none focus:border-pink-200 focus:ring-2 focus:ring-pink-100"
            readOnly
            value={exportText}
          />
        </div>
      </section>
    </div>
  );
}

function DateField({
  id,
  label,
  onChange,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-[12px] font-semibold text-neutral-500">
        {label}
      </span>
      <input
        className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[14px] outline-none transition focus:border-pink-200 focus:ring-2 focus:ring-pink-100"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

function PostImagePreview({ image }: { image: PostImage }) {
  if (image.kind === "uploaded") {
    return (
      <div
        aria-label={image.label}
        className="aspect-[16/10] overflow-hidden rounded-2xl border border-neutral-200 bg-center bg-cover"
        role="img"
        style={{ backgroundImage: `url(${image.dataUrl})` }}
      />
    );
  }

  return (
    <div
      aria-label={`${image.label}の画像`}
      className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-neutral-200"
      role="img"
      style={{ background: image.gradient }}
    >
      <div
        className="absolute bottom-4 left-4 h-12 w-12 rounded-full border border-white/70 shadow-sm"
        style={{ backgroundColor: image.accent }}
      />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/20 to-transparent" />
    </div>
  );
}

function Avatar({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`shrink-0 rounded-full bg-pink-100 text-center font-black text-pink-500 ${
        compact ? "h-10 w-10 text-[17px] leading-10" : "h-11 w-11 text-[18px] leading-[44px]"
      }`}
    >
      f
    </div>
  );
}
