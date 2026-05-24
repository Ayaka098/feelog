"use client";

import Image from "next/image";
import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { writeClipboardText } from "@/lib/feelog/clipboard";
import {
  HYDRATION_NOW,
  MAX_STORED_IMAGE_DATA_URL_LENGTH,
  TIMELINE_PAGE_SIZE,
} from "@/lib/feelog/constants";
import {
  fileToAvatarDataUrl,
  fileToUploadedImage,
} from "@/lib/feelog/image-processing";
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
import {
  DEFAULT_USER_PROFILE,
  getProfileDisplayName,
  getProfileHandle,
  loadUserProfile,
  saveUserProfile,
  type UserProfile,
} from "@/lib/feelog/profile-store";
import { initialPosts } from "@/lib/feelog/seed-data";
import {
  createSupabasePost,
  deleteSupabasePost,
  fetchSupabasePostsForExport,
  fetchSupabasePostsPage,
  updateSupabasePost,
} from "@/lib/feelog/supabase-post-store";
import type { DraftImage, Post, PostImage } from "@/lib/feelog/types";
import {
  getSupabaseBrowserClient,
  hasSupabaseBrowserConfig,
} from "@/lib/supabase/client";

const PINK = "#f8a9c8";
const PINK_HOVER = "#f48bb5";
const HEADER_LOGO_SRC = "/feelog-logo-header-v2.png";
const APP_ICON_SRC = "/feelog-logo-favicon.png";
const isSupabaseConfigured = hasSupabaseBrowserConfig();
const isDevelopment = process.env.NODE_ENV !== "production";
type ToolTab = "home" | "search" | "export" | "settings";
type RailIconName = ToolTab;

export default function Home() {
  const [posts, setPosts] = useState<Post[]>(
    isSupabaseConfigured ? [] : initialPosts,
  );
  const [totalPosts, setTotalPosts] = useState(
    isSupabaseConfigured ? 0 : initialPosts.length,
  );
  const [remoteExportPosts, setRemoteExportPosts] = useState<Post[]>([]);
  const [body, setBody] = useState("");
  const [draftImage, setDraftImage] = useState<DraftImage>();
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [profileReady, setProfileReady] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
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
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [authStatus, setAuthStatus] = useState(
    isSupabaseConfigured ? "" : "Supabase未設定",
  );
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [timelineStatus, setTimelineStatus] = useState("");
  const [debugError, setDebugError] = useState("");
  const [isFetchingPosts, setIsFetchingPosts] = useState(false);
  const [isMutatingPost, setIsMutatingPost] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolTab>("home");
  const [visibleCount, setVisibleCount] = useState(TIMELINE_PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreTimerRef = useRef<number | null>(null);
  const isSupabasePostsMode = isSupabaseConfigured && authReady && Boolean(authUser);

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
      setProfile(loadUserProfile());
      setProfileReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!profileReady) return;
    saveUserProfile(profile);
  }, [profile, profileReady]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let isActive = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isActive) return;

      if (error) {
        setAuthStatus("ログイン状態を取得できませんでした");
      }

      setAuthUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      setAuthReady(true);
      setIsAuthBusy(false);
      setAuthStatus("");
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const storedPosts = loadLocalPosts();
      if (storedPosts) {
        setPosts(storedPosts);
        setTotalPosts(storedPosts.length);
      }
      setStorageReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured || !storageReady) return;
    saveLocalPosts(posts);
  }, [posts, storageReady]);

  useEffect(() => {
    if (!isSupabaseConfigured || !authReady) return;

    let isActive = true;
    let timer: number | null = null;

    if (!authUser) {
      timer = window.setTimeout(() => {
        if (!isActive) return;
        setPosts([]);
        setTotalPosts(0);
        setRemoteExportPosts([]);
        setTimelineStatus("");
        setDebugError("");
        setIsFetchingPosts(false);
      }, 0);

      return () => {
        isActive = false;
        if (timer) window.clearTimeout(timer);
      };
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    timer = window.setTimeout(() => {
      if (!isActive) return;

      setIsFetchingPosts(true);
      setTimelineStatus("");
      setDebugError("");
      setPosts([]);
      setTotalPosts(0);
      setVisibleCount(TIMELINE_PAGE_SIZE);

      fetchSupabasePostsPage({
        supabase,
        userId: authUser.id,
        range: { from: fromDate, to: toDate },
        query,
        offset: 0,
        limit: TIMELINE_PAGE_SIZE,
      })
        .then(({ posts: nextPosts, total }) => {
          if (!isActive) return;
          setPosts(nextPosts);
          setTotalPosts(total);
        })
        .catch((error: unknown) => {
          if (!isActive) return;
          setPosts([]);
          setTotalPosts(0);
          setTimelineStatus("投稿を取得できませんでした");
          setDebugError(formatDebugError("fetch posts", error, authUser.id));
        })
        .finally(() => {
          if (!isActive) return;
          setIsFetchingPosts(false);
        });
    }, 0);

    return () => {
      isActive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [authReady, authUser, fromDate, query, toDate]);

  useEffect(() => {
    let isActive = true;

    if (!isSupabaseConfigured || !authReady || !authUser) {
      const timer = window.setTimeout(() => {
        if (isActive) setRemoteExportPosts([]);
      }, 0);

      return () => {
        isActive = false;
        window.clearTimeout(timer);
      };
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    fetchSupabasePostsForExport({
      supabase,
      userId: authUser.id,
      range: { from: exportFromDate, to: exportToDate },
    })
      .then((nextPosts) => {
        if (!isActive) return;
        setRemoteExportPosts(nextPosts);
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        setRemoteExportPosts([]);
        setDebugError(formatDebugError("fetch export posts", error, authUser.id));
      });

    return () => {
      isActive = false;
    };
  }, [authReady, authUser, exportFromDate, exportToDate]);

  const filteredPosts = useMemo(
    () =>
      isSupabasePostsMode
        ? posts
        : filterPosts(posts, query, { from: fromDate, to: toDate }),
    [fromDate, isSupabasePostsMode, posts, query, toDate],
  );

  const exportPosts = useMemo(
    () =>
      isSupabasePostsMode
        ? remoteExportPosts
        : getExportPosts(posts, { from: exportFromDate, to: exportToDate }),
    [exportFromDate, exportToDate, isSupabasePostsMode, posts, remoteExportPosts],
  );

  const exportText = useMemo(() => buildExportText(exportPosts), [exportPosts]);
  const visiblePosts = useMemo(
    () =>
      isSupabasePostsMode ? filteredPosts : filteredPosts.slice(0, visibleCount),
    [filteredPosts, isSupabasePostsMode, visibleCount],
  );
  const displayedTotal = isSupabasePostsMode ? totalPosts : filteredPosts.length;
  const hasMorePosts = isSupabasePostsMode
    ? posts.length < totalPosts
    : visibleCount < filteredPosts.length;

  const loadMorePosts = useCallback(() => {
    if (!hasMorePosts || isLoadingMore) return;

    setIsLoadingMore(true);

    if (isSupabasePostsMode && authUser) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setIsLoadingMore(false);
        return;
      }

      fetchSupabasePostsPage({
        supabase,
        userId: authUser.id,
        range: { from: fromDate, to: toDate },
        query,
        offset: posts.length,
        limit: TIMELINE_PAGE_SIZE,
      })
        .then(({ posts: nextPosts, total }) => {
          setPosts((currentPosts) => {
            const existingIds = new Set(currentPosts.map((post) => post.id));
            const mergedPosts = [
              ...currentPosts,
              ...nextPosts.filter((post) => !existingIds.has(post.id)),
            ];
            return mergedPosts;
          });
          setTotalPosts(total);
        })
        .catch((error: unknown) => {
          setTimelineStatus("続きを取得できませんでした");
          setDebugError(formatDebugError("fetch more posts", error, authUser.id));
        })
        .finally(() => setIsLoadingMore(false));
      return;
    }

    loadMoreTimerRef.current = window.setTimeout(() => {
      setVisibleCount((currentCount) =>
        Math.min(currentCount + TIMELINE_PAGE_SIZE, filteredPosts.length),
      );
      loadMoreTimerRef.current = null;
      setIsLoadingMore(false);
    }, 160);
  }, [
    authUser,
    filteredPosts.length,
    fromDate,
    hasMorePosts,
    isLoadingMore,
    isSupabasePostsMode,
    posts.length,
    query,
    toDate,
  ]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    if (isSupabaseConfigured) {
      const supabase = getSupabaseBrowserClient();

      if (!supabase || !authUser) {
        setTimelineStatus("ログインすると投稿できます");
        return;
      }

      setIsMutatingPost(true);
      setTimelineStatus(draftImage ? "画像を保存中" : "");
      setImageStatus(draftImage ? "画像をアップロード中" : "");
      setDebugError("");

      try {
        const nextPost = await createSupabasePost({
          supabase,
          userId: authUser.id,
          body: trimmed,
          image: draftImage?.kind === "uploaded" ? draftImage : undefined,
        });

        if (
          filterPosts([nextPost], query, { from: fromDate, to: toDate }).length > 0
        ) {
          setPosts((currentPosts) => [nextPost, ...currentPosts]);
          setTotalPosts((currentTotal) => currentTotal + 1);
        }
        if (
          filterPosts([nextPost], "", {
            from: exportFromDate,
            to: exportToDate,
          }).length > 0
        ) {
          setRemoteExportPosts((currentPosts) =>
            getExportPosts([...currentPosts, nextPost], {
              from: exportFromDate,
              to: exportToDate,
            }),
          );
        }
        setBody("");
        setDraftImage(undefined);
        setImageStatus("");
        setTimelineStatus("");
      } catch (error) {
        setTimelineStatus(
          draftImage
            ? "画像を保存できなかったため投稿しませんでした"
            : "投稿できませんでした",
        );
        setImageStatus(draftImage ? "画像アップロードに失敗しました" : "");
        setDebugError(formatDebugError("create post", error, authUser.id));
      } finally {
        setIsMutatingPost(false);
      }

      return;
    }

    const nextPost = createPost({ body: trimmed, image: draftImage });

    setPosts((currentPosts) => [nextPost, ...currentPosts]);
    setTotalPosts((currentTotal) => currentTotal + 1);
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
          ? isSupabaseConfigured
            ? "画像は圧縮して保存します"
            : "大きい画像はこの画面でのみ表示されます"
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

  function updateProfileDisplayName(value: string) {
    setProfile((currentProfile) => ({
      ...currentProfile,
      displayName: value.slice(0, 40),
    }));
    setProfileStatus("");
  }

  function updateProfileHandle(value: string) {
    setProfile((currentProfile) => ({
      ...currentProfile,
      userHandle: value.replace(/^@+/, "").replace(/\s+/g, "_").slice(0, 32),
    }));
    setProfileStatus("");
  }

  async function handleProfileAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileStatus("画像ファイルを選んでください");
      return;
    }

    setProfileStatus("プロフィール画像を準備中");

    try {
      const avatarDataUrl = await fileToAvatarDataUrl(file);
      setProfile((currentProfile) => ({
        ...currentProfile,
        avatarDataUrl,
      }));
      setProfileStatus("プロフィール画像を変更しました");
    } catch {
      setProfileStatus("プロフィール画像を読み込めませんでした");
    }
  }

  function clearProfileAvatar() {
    setProfile((currentProfile) => ({
      ...currentProfile,
      avatarDataUrl: undefined,
    }));
    setProfileStatus("プロフィール画像を解除しました");
  }

  function startEditing(post: Post) {
    setEditingId(post.id);
    setEditingBody(post.body);
  }

  async function saveEditing(postId: string) {
    const trimmed = editingBody.trim();
    if (!trimmed) return;

    if (isSupabasePostsMode && authUser) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      setIsMutatingPost(true);
      setTimelineStatus("");
      setDebugError("");

      try {
        const updatedPost = await updateSupabasePost({
          supabase,
          userId: authUser.id,
          postId,
          body: trimmed,
        });

        const stillMatchesTimeline =
          filterPosts([updatedPost], query, { from: fromDate, to: toDate }).length >
          0;
        setPosts((currentPosts) =>
          stillMatchesTimeline
            ? currentPosts.map((post) => (post.id === postId ? updatedPost : post))
            : deletePostById(currentPosts, postId),
        );
        if (!stillMatchesTimeline) {
          setTotalPosts((currentTotal) => Math.max(0, currentTotal - 1));
        }
        setRemoteExportPosts((currentPosts) =>
          currentPosts.map((post) => (post.id === postId ? updatedPost : post)),
        );
        setEditingId(null);
        setEditingBody("");
      } catch (error) {
        setTimelineStatus("編集を保存できませんでした");
        setDebugError(formatDebugError("update post", error, authUser.id, postId));
      } finally {
        setIsMutatingPost(false);
      }

      return;
    }

    setPosts((currentPosts) => updatePostBody(currentPosts, postId, trimmed));
    setEditingId(null);
    setEditingBody("");
  }

  async function deletePost(postId: string) {
    const confirmed = window.confirm("この投稿を削除しますか？");
    if (!confirmed) return;

    if (isSupabasePostsMode && authUser) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      setIsMutatingPost(true);
      setTimelineStatus("");
      setDebugError("");

      try {
        await deleteSupabasePost({ supabase, userId: authUser.id, postId });
        setPosts((currentPosts) => deletePostById(currentPosts, postId));
        setRemoteExportPosts((currentPosts) => deletePostById(currentPosts, postId));
        setTotalPosts((currentTotal) => Math.max(0, currentTotal - 1));
      } catch (error) {
        setTimelineStatus("削除できませんでした");
        setDebugError(formatDebugError("delete post", error, authUser.id, postId));
      } finally {
        setIsMutatingPost(false);
      }

      return;
    }

    setPosts((currentPosts) => deletePostById(currentPosts, postId));
    setTotalPosts((currentTotal) => Math.max(0, currentTotal - 1));
  }

  async function signInWithGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthStatus("Supabaseの環境変数が未設定です");
      return;
    }

    setIsAuthBusy(true);
    setAuthStatus("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      setAuthStatus("Googleログインを開始できませんでした");
      setIsAuthBusy(false);
    }
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthStatus("Supabaseの環境変数が未設定です");
      return;
    }

    setIsAuthBusy(true);
    setAuthStatus("");

    const { error } = await supabase.auth.signOut();

    if (error) {
      setAuthStatus("ログアウトできませんでした");
    } else {
      setAuthUser(null);
    }

    setIsAuthBusy(false);
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

  const hasActiveSidePanel = activeTool !== "home";

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-white text-neutral-950">
      <div
        className="mx-auto grid min-h-screen w-full min-w-0 max-w-[1100px] grid-cols-1 md:grid-cols-[88px_minmax(0,620px)] xl:grid-cols-[176px_minmax(0,600px)_minmax(0,324px)]"
      >
        <AppRail activeTool={activeTool} onToolChange={setActiveTool} />

        <main className="min-h-screen min-w-0 border-x border-neutral-200 bg-white" id="top">
          <header className="sticky top-0 z-30 flex min-h-[52px] items-center justify-between gap-3 border-b border-neutral-200 bg-white/90 px-4 py-2 backdrop-blur-md">
            <div className="flex min-w-0 items-center">
              <Image
                alt="feelog"
                className="block h-9 w-auto max-w-[132px] object-contain"
                height={300}
                priority
                src={HEADER_LOGO_SRC}
                width={760}
              />
            </div>
            <AuthControls
              isBusy={isAuthBusy}
              isConfigured={isSupabaseConfigured}
              isReady={authReady}
              onSignIn={signInWithGoogle}
              status={authStatus}
              user={authUser}
            />
          </header>

          <Composer
            body={body}
            draftImage={draftImage}
            isPostDisabled={isMutatingPost || (isSupabaseConfigured && !authUser)}
            onBodyChange={setBody}
            onClearImage={clearDraftImage}
            onImageFileChange={handleImageFileChange}
            onSubmit={handleSubmit}
            profile={profile}
            status={imageStatus}
          />

          <div className="border-b border-neutral-200 xl:hidden">
            <ToolsPanel
              activeTool={activeTool}
              authStatus={authStatus}
              authUser={authUser}
              copyState={copyState}
              exportFromDate={exportFromDate}
              exportText={exportText}
              exportToDate={exportToDate}
              fromDate={fromDate}
              idPrefix="mobile"
              isAuthBusy={isAuthBusy}
              onCopy={copyExportText}
              onProfileAvatarChange={handleProfileAvatarChange}
              onProfileAvatarClear={clearProfileAvatar}
              onProfileDisplayNameChange={updateProfileDisplayName}
              onProfileHandleChange={updateProfileHandle}
              onSignOut={signOut}
              onToolChange={setActiveTool}
              profile={profile}
              profileStatus={profileStatus}
              query={query}
              resultCount={displayedTotal}
              setExportFromDate={setExportFromDate}
              setExportToDate={setExportToDate}
              setFromDate={handleFromDateChange}
              setQuery={handleQueryChange}
              setToDate={handleToDateChange}
              toDate={toDate}
            />
          </div>
          <DebugErrorNotice message={debugError} />

          <section aria-label="タイムライン">
            {visiblePosts.length > 0 ? (
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
                    profile={profile}
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
                    {visiblePosts.length} / {displayedTotal}
                  </p>
                </div>
              </>
            ) : (
              <div className="px-6 py-14 text-center">
                <p className="text-[15px] font-semibold text-neutral-900">
                  {isFetchingPosts
                    ? "読み込み中"
                    : isSupabaseConfigured && !authUser
                      ? "ログインしてください"
                      : timelineStatus || "見つかりませんでした"}
                </p>
                <p className="mt-1 text-[14px] text-neutral-500">
                  {isFetchingPosts
                    ? "投稿を取得しています。"
                    : isSupabaseConfigured && !authUser
                      ? "Googleログイン後、自分の投稿だけが表示されます。"
                      : timelineStatus
                        ? "少し時間を置いてもう一度試してください。"
                        : "検索条件を少しゆるめてみてください。"}
                </p>
              </div>
            )}
          </section>
        </main>

        {hasActiveSidePanel ? (
          <aside className="hidden min-w-0 overflow-hidden xl:block">
            <div className="sticky top-0 max-h-screen min-w-0 overflow-y-auto overflow-x-hidden px-4 py-3">
              <ToolsPanel
                activeTool={activeTool}
                authStatus={authStatus}
                authUser={authUser}
                copyState={copyState}
                exportFromDate={exportFromDate}
                exportText={exportText}
                exportToDate={exportToDate}
                fromDate={fromDate}
                idPrefix="desktop"
                isAuthBusy={isAuthBusy}
                onCopy={copyExportText}
                onProfileAvatarChange={handleProfileAvatarChange}
                onProfileAvatarClear={clearProfileAvatar}
                onProfileDisplayNameChange={updateProfileDisplayName}
                onProfileHandleChange={updateProfileHandle}
                onSignOut={signOut}
                onToolChange={setActiveTool}
                profile={profile}
                profileStatus={profileStatus}
                query={query}
                resultCount={displayedTotal}
                setExportFromDate={setExportFromDate}
                setExportToDate={setExportToDate}
                setFromDate={handleFromDateChange}
                setQuery={handleQueryChange}
                setToDate={handleToDateChange}
                toDate={toDate}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function DebugErrorNotice({ message }: { message: string }) {
  if (!isDevelopment || !message) return null;

  return (
    <div className="border-b border-pink-200 bg-pink-50 px-4 py-3 text-[13px] leading-5 text-neutral-700">
      <p className="font-bold text-neutral-900">開発用エラー</p>
      <p className="mt-1 break-words font-mono text-[12px]">{message}</p>
      <p className="mt-1 text-[12px] text-neutral-500">
        詳細はブラウザのconsole.errorを確認してください。
      </p>
    </div>
  );
}

function formatDebugError(operation: string, error: unknown, userId?: string, postId?: string) {
  const parts = [`${operation} failed`];

  if (isErrorRecord(error)) {
    const code = getStringValue(error.code);
    const message = getStringValue(error.message);
    const details = getStringValue(error.details);
    const hint = getStringValue(error.hint);

    if (code) parts.push(`code=${code}`);
    if (message) parts.push(`message=${message}`);
    if (details) parts.push(`details=${details}`);
    if (hint) parts.push(`hint=${hint}`);
  } else if (error instanceof Error) {
    parts.push(`message=${error.message}`);
  } else if (typeof error === "string") {
    parts.push(`message=${error}`);
  }

  if (userId) parts.push(`authUser.id=${userId}`);
  if (postId) parts.push(`postId=${postId}`);

  return parts.join(" / ");
}

function isErrorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function AuthControls({
  isBusy,
  isConfigured,
  isReady,
  onSignIn,
  status,
  user,
}: {
  isBusy: boolean;
  isConfigured: boolean;
  isReady: boolean;
  onSignIn: () => void;
  status: string;
  user: User | null;
}) {
  const isDisabled = isBusy || !isReady || !isConfigured;

  if (user) return null;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2">
      <button
        className="h-9 rounded-full px-4 text-[14px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isDisabled}
        onClick={onSignIn}
        style={{ backgroundColor: isDisabled ? "#f5b8cf" : PINK }}
        title={status || undefined}
        type="button"
      >
        {isReady ? "Googleでログイン" : "確認中"}
      </button>
    </div>
  );
}

function AppRail({
  activeTool,
  onToolChange,
}: {
  activeTool: ToolTab;
  onToolChange: (tool: ToolTab) => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen min-w-0 flex-col justify-between px-3 py-2 md:flex">
      <div className="space-y-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full md:mx-auto xl:mx-0">
          <Image
            alt="feelog"
            className="h-12 w-12 object-contain"
            height={512}
            priority
            src={APP_ICON_SRC}
            width={512}
          />
        </div>
        <nav className="space-y-1 text-[17px] font-semibold">
          <RailToolLink
            active={activeTool === "home"}
            href="#top"
            icon="home"
            label="ホーム"
            onSelect={() => onToolChange("home")}
          />
          <RailToolLink
            active={activeTool === "search"}
            className="xl:hidden"
            href="#mobile-tools"
            icon="search"
            label="検索"
            onSelect={() => onToolChange("search")}
          />
          <RailToolLink
            active={activeTool === "search"}
            className="hidden xl:grid"
            href="#desktop-tools"
            icon="search"
            label="検索"
            onSelect={() => onToolChange("search")}
          />
          <RailToolLink
            active={activeTool === "export"}
            className="xl:hidden"
            href="#mobile-tools"
            icon="export"
            label="出力"
            onSelect={() => onToolChange("export")}
          />
          <RailToolLink
            active={activeTool === "export"}
            className="hidden xl:grid"
            href="#desktop-tools"
            icon="export"
            label="出力"
            onSelect={() => onToolChange("export")}
          />
          <RailToolLink
            active={activeTool === "settings"}
            className="xl:hidden"
            href="#mobile-tools"
            icon="settings"
            label="設定"
            onSelect={() => onToolChange("settings")}
          />
          <RailToolLink
            active={activeTool === "settings"}
            className="hidden xl:grid"
            href="#desktop-tools"
            icon="settings"
            label="設定"
            onSelect={() => onToolChange("settings")}
          />
        </nav>
      </div>
    </aside>
  );
}

function RailToolLink({
  active,
  className = "",
  href,
  icon,
  label,
  onSelect,
}: {
  active: boolean;
  className?: string;
  href: string;
  icon: ToolTab;
  label: string;
  onSelect: () => void;
}) {
  return (
    <a
      className={`flex h-12 items-center justify-center rounded-full px-3 transition-colors xl:grid xl:grid-cols-[28px_minmax(0,1fr)] xl:justify-start xl:gap-4 ${
        active
          ? "bg-pink-50 text-neutral-950"
          : "text-neutral-900 hover:bg-pink-50"
      } ${className}`}
      href={href}
      onClick={onSelect}
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center text-neutral-950"
      >
        <RailIcon name={icon} />
      </span>
      <span className="hidden min-w-0 truncate xl:inline">{label}</span>
    </a>
  );
}

function RailIcon({ name }: { name: RailIconName }) {
  const iconClass = "h-[22px] w-[22px]";

  if (name === "home") {
    return (
      <svg
        aria-hidden="true"
        className={iconClass}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M3.5 10.8 12 4l8.5 6.8" />
        <path d="M5.5 9.8V20h13V9.8" />
        <path d="M9.5 20v-6h5v6" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg
        aria-hidden="true"
        className={iconClass}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="10.8" cy="10.8" r="6.3" />
        <path d="m16 16 4.2 4.2" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg
        aria-hidden="true"
        className={iconClass}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="3.25" />
        <path d="M12 3.8v2.4" />
        <path d="M12 17.8v2.4" />
        <path d="m5.9 5.9 1.7 1.7" />
        <path d="m16.4 16.4 1.7 1.7" />
        <path d="M3.8 12h2.4" />
        <path d="M17.8 12h2.4" />
        <path d="m5.9 18.1 1.7-1.7" />
        <path d="m16.4 7.6 1.7-1.7" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={iconClass}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 4v10" />
      <path d="m8.5 7.5 3.5-3.5 3.5 3.5" />
      <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[19px] w-[19px]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M8.2 6.5 9.6 4.8h4.8l1.4 1.7H19a2 2 0 0 1 2 2v8.7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h3.2Z" />
      <circle cx="12" cy="12.8" r="3.4" />
    </svg>
  );
}

function Composer({
  body,
  draftImage,
  isPostDisabled,
  onBodyChange,
  onClearImage,
  onImageFileChange,
  onSubmit,
  profile,
  status,
}: {
  body: string;
  draftImage: DraftImage;
  isPostDisabled: boolean;
  onBodyChange: (value: string) => void;
  onClearImage: () => void;
  onImageFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  profile: UserProfile;
  status: string;
}) {
  const displayName = getProfileDisplayName(profile);
  const userHandle = getProfileHandle(profile);

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
    if (!body.trim() || isPostDisabled) return;

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form
      className="sticky top-[52px] z-20 border-b border-neutral-200 bg-white/95 px-4 pt-3 backdrop-blur-md"
      onSubmit={onSubmit}
    >
      <div className="flex gap-3">
        <Avatar profile={profile} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1 text-[14px] leading-5">
            <span className="truncate font-bold text-neutral-950">{displayName}</span>
            <span className="shrink-0 text-neutral-500">@{userHandle}</span>
          </div>
          <textarea
            className="min-h-24 w-full resize-none bg-transparent pt-1 text-[20px] leading-7 text-neutral-950 outline-none placeholder:text-neutral-500"
            onChange={(event) => onBodyChange(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
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
                <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">
                  <CameraIcon />
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
              className="h-9 shrink-0 rounded-full bg-[#f8a9c8] px-5 text-[15px] font-bold text-white transition-colors hover:bg-[#f48bb5] disabled:cursor-not-allowed disabled:bg-[#f5b8cf] disabled:opacity-50 disabled:hover:bg-[#f5b8cf]"
              disabled={!body.trim() || isPostDisabled}
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
  profile,
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
  profile: UserProfile;
}) {
  const isEditing = editingId === post.id;
  const displayName = getProfileDisplayName(profile);
  const userHandle = getProfileHandle(profile);

  return (
    <article className="border-b border-neutral-200 px-4 py-3 transition-colors hover:bg-neutral-50/70">
      <div className="flex gap-3">
        <Avatar compact profile={profile} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-[15px] leading-5">
              <span className="font-bold text-neutral-950">{displayName}</span>
              <span className="ml-2 text-neutral-500">@{userHandle}</span>
              <span className="mx-1 text-neutral-500">·</span>
              <time className="text-neutral-500" dateTime={post.createdAt}>
                {formatPostTime(post.createdAt)}
              </time>
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

          <div className="mt-3 flex items-center text-[14px] text-neutral-500">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-[17px]" style={{ color: PINK_HOVER }}>
                ♡
              </span>
              <span>{hearts}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function ToolsPanel({
  activeTool,
  authStatus,
  authUser,
  copyState,
  exportFromDate,
  exportText,
  exportToDate,
  fromDate,
  idPrefix,
  isAuthBusy,
  onCopy,
  onProfileAvatarChange,
  onProfileAvatarClear,
  onProfileDisplayNameChange,
  onProfileHandleChange,
  onSignOut,
  onToolChange,
  profile,
  profileStatus,
  query,
  resultCount,
  setExportFromDate,
  setExportToDate,
  setFromDate,
  setQuery,
  setToDate,
  toDate,
}: {
  activeTool: ToolTab;
  authStatus: string;
  authUser: User | null;
  copyState: "idle" | "copied" | "failed";
  exportFromDate: string;
  exportText: string;
  exportToDate: string;
  fromDate: string;
  idPrefix: string;
  isAuthBusy: boolean;
  onCopy: () => void;
  onProfileAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onProfileAvatarClear: () => void;
  onProfileDisplayNameChange: (value: string) => void;
  onProfileHandleChange: (value: string) => void;
  onSignOut: () => void;
  onToolChange: (tool: ToolTab) => void;
  profile: UserProfile;
  profileStatus: string;
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
  const tabs: { id: ToolTab; label: string }[] = [
    { id: "search", label: "検索" },
    { id: "export", label: "AI出力" },
    { id: "settings", label: "設定" },
  ];
  const showTabs = idPrefix === "mobile";
  const sectionClassName = showTabs ? "mt-4" : "";
  const panelTransitionClassName = `${sectionClassName} feelog-panel-transition`;

  return (
    <div className="min-w-0 px-4 py-3 xl:px-0 xl:py-0" id={`${idPrefix}-tools`}>
      {showTabs ? (
        <div
          aria-label="詳細パネル"
          className="grid grid-cols-3 gap-1 rounded-full bg-neutral-100 p-1"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = activeTool === tab.id;

            return (
              <button
                aria-controls={`${idPrefix}-${tab.id}`}
                aria-selected={isActive}
                className={`h-9 rounded-full px-2 text-[13px] font-bold transition-colors ${
                  isActive
                    ? "bg-white text-neutral-950 shadow-sm"
                    : "text-neutral-500 hover:bg-white/70 hover:text-neutral-900"
                }`}
                key={tab.id}
                onClick={() => onToolChange(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {activeTool === "settings" ? (
        <ProfilePanel
          authStatus={authStatus}
          authUser={authUser}
          className={panelTransitionClassName}
          idPrefix={idPrefix}
          isAuthBusy={isAuthBusy}
          key={`${idPrefix}-settings-panel`}
          onAvatarChange={onProfileAvatarChange}
          onAvatarClear={onProfileAvatarClear}
          onDisplayNameChange={onProfileDisplayNameChange}
          onHandleChange={onProfileHandleChange}
          onSignOut={onSignOut}
          profile={profile}
          status={profileStatus}
        />
      ) : null}

      {activeTool === "search" ? (
        <section
          aria-labelledby={`${idPrefix}-search-title`}
          className={panelTransitionClassName}
          id={`${idPrefix}-search`}
          key={`${idPrefix}-search-panel`}
        >
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
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
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
      ) : null}

      {activeTool === "export" ? (
        <section
          aria-labelledby={`${idPrefix}-export-title`}
          className={panelTransitionClassName}
          id={`${idPrefix}-export`}
          key={`${idPrefix}-export-panel`}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2
              className="text-[20px] font-extrabold tracking-normal"
              id={`${idPrefix}-export-title`}
            >
              AI出力
            </h2>
            <button
              className="h-9 rounded-full bg-[#f8a9c8] px-4 text-[14px] font-bold text-white transition-colors hover:bg-[#f48bb5] disabled:cursor-not-allowed disabled:bg-[#f5b8cf] disabled:opacity-50 disabled:hover:bg-[#f5b8cf]"
              disabled={!exportText}
              onClick={onCopy}
              type="button"
            >
              {copyLabel}
            </button>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
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
      ) : null}
    </div>
  );
}

function ProfilePanel({
  authStatus,
  authUser,
  className = "mt-4",
  idPrefix,
  isAuthBusy,
  onAvatarChange,
  onAvatarClear,
  onDisplayNameChange,
  onHandleChange,
  onSignOut,
  profile,
  status,
}: {
  authStatus: string;
  authUser: User | null;
  className?: string;
  idPrefix: string;
  isAuthBusy: boolean;
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAvatarClear: () => void;
  onDisplayNameChange: (value: string) => void;
  onHandleChange: (value: string) => void;
  onSignOut: () => void;
  profile: UserProfile;
  status: string;
}) {
  const displayName = getProfileDisplayName(profile);
  const userHandle = getProfileHandle(profile);
  const authEmail = authUser?.email ?? "未ログイン";

  return (
    <section
      aria-labelledby={`${idPrefix}-profile-title`}
      className={className}
      id={`${idPrefix}-profile`}
    >
      <h2
        className="mb-3 text-[20px] font-extrabold tracking-normal"
        id={`${idPrefix}-profile-title`}
      >
        設定
      </h2>
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
        <div className="flex items-center gap-3">
          <Avatar profile={profile} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold leading-5 text-neutral-950">
              {displayName}
            </p>
            <p className="truncate text-[13px] leading-5 text-neutral-500">
              @{userHandle}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block" htmlFor={`${idPrefix}-display-name`}>
            <span className="mb-1 block text-[12px] font-semibold text-neutral-500">
              表示名
            </span>
            <input
              className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[14px] outline-none transition focus:border-pink-200 focus:ring-2 focus:ring-pink-100"
              id={`${idPrefix}-display-name`}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              value={profile.displayName}
            />
          </label>

          <label className="block" htmlFor={`${idPrefix}-user-handle`}>
            <span className="mb-1 block text-[12px] font-semibold text-neutral-500">
              ユーザーID
            </span>
            <div className="flex h-10 items-center overflow-hidden rounded-xl border border-neutral-200 bg-white focus-within:border-pink-200 focus-within:ring-2 focus-within:ring-pink-100">
              <span className="pl-3 text-[14px] font-semibold text-neutral-400">@</span>
              <input
                className="h-full min-w-0 flex-1 bg-transparent px-1 pr-3 text-[14px] outline-none"
                id={`${idPrefix}-user-handle`}
                onChange={(event) => onHandleChange(event.target.value)}
                value={profile.userHandle}
              />
            </div>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-neutral-200 bg-white px-3 py-3">
          <p className="text-[12px] font-semibold text-neutral-500">ログイン中</p>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[13px] font-medium text-neutral-700">
              {authEmail}
            </p>
            {authUser ? (
              <button
                className="h-9 shrink-0 rounded-full border border-neutral-200 px-3 text-[13px] font-bold text-neutral-800 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isAuthBusy}
                onClick={onSignOut}
                title={authStatus || undefined}
                type="button"
              >
                ログアウト
              </button>
            ) : null}
          </div>
          {authStatus ? (
            <p className="mt-2 text-[12px] font-medium text-neutral-500">{authStatus}</p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label
            className="flex h-9 cursor-pointer items-center rounded-full bg-white px-3 text-[13px] font-bold text-neutral-700 transition-colors hover:bg-pink-50"
            style={{ color: PINK_HOVER }}
          >
            画像を選ぶ
            <input
              accept="image/*"
              className="sr-only"
              onChange={onAvatarChange}
              type="file"
            />
          </label>
          {profile.avatarDataUrl ? (
            <button
              className="h-9 rounded-full px-3 text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100"
              onClick={onAvatarClear}
              type="button"
            >
              解除
            </button>
          ) : null}
          {status ? (
            <span className="text-[12px] font-medium text-neutral-500">{status}</span>
          ) : null}
        </div>
      </div>
    </section>
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
    <label className="block min-w-0" htmlFor={id}>
      <span className="mb-1 block text-[12px] font-semibold text-neutral-500">
        {label}
      </span>
      <input
        className="h-10 w-full min-w-0 rounded-xl border border-neutral-200 bg-white px-3 text-[14px] outline-none transition focus:border-pink-200 focus:ring-2 focus:ring-pink-100"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

function PostImagePreview({ image }: { image: PostImage }) {
  if (image.kind === "uploaded" || image.kind === "remote") {
    const imageUrl = image.kind === "uploaded" ? image.dataUrl : image.signedUrl;

    return (
      <div
        aria-label={image.label}
        className="aspect-[16/9] w-full max-w-[420px] overflow-hidden rounded-2xl border border-neutral-200 bg-center bg-cover"
        role="img"
        style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }}
      />
    );
  }

  return (
    <div
      aria-label={`${image.label}の画像`}
      className="relative aspect-[16/9] w-full max-w-[420px] overflow-hidden rounded-2xl border border-neutral-200"
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

function Avatar({ compact = false, profile }: { compact?: boolean; profile: UserProfile }) {
  const sizeClass = compact
    ? "h-10 w-10 text-[17px] leading-10"
    : "h-11 w-11 text-[18px] leading-[44px]";

  if (profile.avatarDataUrl) {
    return (
      <div
        aria-hidden="true"
        className={`shrink-0 rounded-full border border-pink-100 bg-cover bg-center ${sizeClass}`}
        style={{ backgroundImage: `url(${JSON.stringify(profile.avatarDataUrl)})` }}
      />
    );
  }

  return (
    <div
      className={`shrink-0 rounded-full bg-pink-100 text-center font-black text-pink-500 ${sizeClass}`}
    >
      f
    </div>
  );
}
