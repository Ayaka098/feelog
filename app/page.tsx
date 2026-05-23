"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { writeClipboardText } from "@/lib/feelog/clipboard";
import {
  HYDRATION_NOW,
  MAX_STORED_IMAGE_DATA_URL_LENGTH,
  TIMELINE_PAGE_SIZE,
} from "@/lib/feelog/constants";
import { fileToUploadedImage } from "@/lib/feelog/image-processing";
import { loadLocalPosts, saveLocalPosts } from "@/lib/feelog/local-post-store";
import {
  buildExportText,
  calculatePseudoHearts,
  createPost,
  deletePostById,
  filterPosts,
  formatPostTime,
  getExportPosts,
  updatePostBody,
} from "@/lib/feelog/post-model";
import { initialPosts } from "@/lib/feelog/seed-data";
import type { DraftImage, Post, PostImage } from "@/lib/feelog/types";

const PINK = "#f8a9c8";
const PINK_HOVER = "#f48bb5";

export default function Home() {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
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
  const [visibleCount, setVisibleCount] = useState(TIMELINE_PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreTimerRef = useRef<number | null>(null);

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
      const storedPosts = loadLocalPosts();
      if (storedPosts) {
        setPosts(storedPosts);
      }
      setStorageReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    saveLocalPosts(posts);
  }, [posts, storageReady]);

  const filteredPosts = useMemo(
    () => filterPosts(posts, query, { from: fromDate, to: toDate }),
    [fromDate, posts, query, toDate],
  );

  const exportPosts = useMemo(
    () => getExportPosts(posts, { from: exportFromDate, to: exportToDate }),
    [exportFromDate, exportToDate, posts],
  );

  const exportText = useMemo(() => buildExportText(exportPosts), [exportPosts]);
  const visiblePosts = useMemo(
    () => filteredPosts.slice(0, visibleCount),
    [filteredPosts, visibleCount],
  );
  const hasMorePosts = visibleCount < filteredPosts.length;

  const loadMorePosts = useCallback(() => {
    if (!hasMorePosts || isLoadingMore) return;

    setIsLoadingMore(true);
    loadMoreTimerRef.current = window.setTimeout(() => {
      setVisibleCount((currentCount) =>
        Math.min(currentCount + TIMELINE_PAGE_SIZE, filteredPosts.length),
      );
      loadMoreTimerRef.current = null;
      setIsLoadingMore(false);
    }, 160);
  }, [filteredPosts.length, hasMorePosts, isLoadingMore]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMorePosts) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMorePosts();
        }
      },
      { rootMargin: "700px 0px 900px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMorePosts, loadMorePosts]);

  useEffect(
    () => () => {
      if (loadMoreTimerRef.current) {
        window.clearTimeout(loadMoreTimerRef.current);
      }
    },
    [],
  );

  function resetTimelineWindow() {
    if (loadMoreTimerRef.current) {
      window.clearTimeout(loadMoreTimerRef.current);
      loadMoreTimerRef.current = null;
    }
    setVisibleCount(TIMELINE_PAGE_SIZE);
    setIsLoadingMore(false);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    resetTimelineWindow();
  }

  function handleFromDateChange(value: string) {
    setFromDate(value);
    resetTimelineWindow();
  }

  function handleToDateChange(value: string) {
    setToDate(value);
    resetTimelineWindow();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    const nextPost = createPost({ body: trimmed, image: draftImage });

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

  function startEditing(post: Post) {
    setEditingId(post.id);
    setEditingBody(post.body);
  }

  function saveEditing(postId: string) {
    const trimmed = editingBody.trim();
    if (!trimmed) return;
    setPosts((currentPosts) => updatePostBody(currentPosts, postId, trimmed));
    setEditingId(null);
    setEditingBody("");
  }

  function deletePost(postId: string) {
    const confirmed = window.confirm("この投稿を削除しますか？");
    if (!confirmed) return;
    setPosts((currentPosts) => deletePostById(currentPosts, postId));
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
              setFromDate={handleFromDateChange}
              setQuery={handleQueryChange}
              setToDate={handleToDateChange}
              toDate={toDate}
            />
          </div>

          <section aria-label="タイムライン">
            {filteredPosts.length > 0 ? (
              <>
                {visiblePosts.map((post) => (
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
                ))}
                <div
                  className="border-b border-neutral-200 px-6 py-6 text-center text-[14px] text-neutral-500"
                  ref={loadMoreRef}
                >
                  {hasMorePosts ? (
                    <span>{isLoadingMore ? "読み込み中" : "続きを読み込んでいます"}</span>
                  ) : (
                    <span>これ以上ありません</span>
                  )}
                  <p className="mt-1 text-[12px] text-neutral-400">
                    {visiblePosts.length} / {filteredPosts.length}
                  </p>
                </div>
              </>
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
              setFromDate={handleFromDateChange}
              setQuery={handleQueryChange}
              setToDate={handleToDateChange}
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

          <div className="flex items-center justify-between gap-2 border-t border-neutral-100 py-3">
            <div className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
              <label
                className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 text-[14px] font-semibold transition-colors hover:bg-pink-50"
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
                  className="h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100"
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
              className="h-9 shrink-0 rounded-full px-5 text-[15px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
  post: Post;
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
