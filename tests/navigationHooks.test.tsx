import { afterEach, expect, mock, test } from "bun:test";
import {
  act,
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import {
  StackActions,
  StackRouter,
  type NavigationAction,
  type ParamListBase,
  type Router,
  type StackNavigationState,
} from "@react-navigation/routers";

import type { Post } from "../api/Posts";
import { PrivateSubredditError } from "../api/Posts";
import type { Comment, PostDetail } from "../api/PostDetail";
import {
  PageStateCacheProvider,
  PageStateContext,
} from "../contexts/PageStateContext";
import { getPageCacheKey, stackHistoryRouter } from "../utils/stackHistory";
import { useListScrollRestoration } from "../utils/useListScrollRestoration";
import { usePostScrollRestoration } from "../utils/usePostScrollRestoration";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewInstance,
} from "react-native";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const AccountContext = createContext({ currentUser: { userName: "reader" } });
mock.module("../contexts/AccountContext", () => ({ AccountContext }));
mock.module("../contexts/ToastContext", () => ({
  ToastContext: createContext({ showToast: () => {} }),
}));
mock.module("../api/gql/WebToken", () => ({
  NotLoggedInError: class extends Error {},
}));
mock.module("../components/Navbar/SortAndContext", () => ({
  default: () => null,
}));
mock.module("../utils/navigation", () => ({
  useURLNavigation: () => ({ setOptions: () => {} }),
}));
mock.module("../utils/RedditURL", () => ({
  default: class {
    getPageName() {
      return "Post";
    }
  },
}));
mock.module("../db/functions/Stats", () => ({
  modifyStat: () => {},
  Stat: { POSTS_VIEWED: "posts" },
}));

let loadPost: (url: string) => Promise<PostDetail | undefined> = async () =>
  undefined;
mock.module("../api/gql/PostDetail", () => ({
  getPostsDetail: (url: string) => loadPost(url),
  getCommentSort: () => "best",
  loadMoreComments: async () => ({ comments: [], loadMore: undefined }),
}));
const { default: useRedditDataState } =
  await import("../utils/useRedditDataState");
const { default: usePostDetail } =
  await import("../pages/PostDetails/usePostDetail");

const original = StackRouter({ initialRouteName: "Home" });
const router: Router<StackNavigationState<ParamListBase>, NavigationAction> = {
  ...original,
  ...stackHistoryRouter(original),
};
const options = {
  routeNames: ["Home", "Posts"],
  routeParamList: {},
  routeGetIdList: {},
};
const renderers = new Set<ReactTestRenderer>();
afterEach(async () => {
  await act(async () => {
    for (const renderer of renderers) renderer.unmount();
  });
  renderers.clear();
});

async function mountPage<T>(useValue: () => T) {
  const dispatch = (action: NavigationAction) => {
    const next = router.getStateForAction(state, action, options);
    if (next) state = router.getRehydratedState(next, options);
  };
  let state = router.getInitialState(options);
  dispatch(StackActions.push("Posts"));
  let visible = true;
  let userName = "reader";
  let latest: { value: T } | undefined;
  function Page() {
    const value = useValue();
    useLayoutEffect(() => {
      latest = { value };
    });
    return null;
  }
  function App(): ReactNode {
    return (
      <AccountContext.Provider value={{ currentUser: { userName } }}>
        <PageStateCacheProvider state={state}>
          {visible && (
            <PageStateContext.Provider
              value={getPageCacheKey(state.routes[state.index])}
            >
              <Page key={state.routes[state.index].key} />
            </PageStateContext.Provider>
          )}
        </PageStateCacheProvider>
      </AccountContext.Provider>
    );
  }
  let instance: ReactTestRenderer | undefined;
  await act(async () => {
    instance = create(<App />);
  });
  if (!instance) throw new Error("Renderer did not mount");
  const renderer = instance;
  renderers.add(renderer);
  const update = async () => {
    await act(async () => {
      renderer.update(<App />);
    });
  };
  return {
    get current() {
      if (!latest) throw new Error("Page did not render");
      return latest.value;
    },
    update,
    async setAccount(name: string) {
      userName = name;
      await update();
    },
    async back() {
      dispatch(StackActions.pop());
      visible = false;
      await update();
    },
    async forward() {
      dispatch({ type: "GO_FORWARD" });
      visible = true;
      await update();
    },
  };
}

const makePost = (id: string): Post =>
  ({ id, type: "post", after: id }) as Post;
const makeDetail = (id: string): PostDetail =>
  ({
    id,
    path: [],
    renderCount: 0,
    comments: [
      {
        id: "comment",
        path: [0],
        renderCount: 0,
        comments: [],
        collapsed: false,
      } as unknown as Comment,
    ],
  }) as unknown as PostDetail;
const scrollEvent = (y: number, contentHeight = 5000) =>
  ({
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 400, height: contentHeight },
      layoutMeasurement: { width: 400, height: 800 },
      contentInset: { top: 100, bottom: 80, left: 0, right: 0 },
      zoomScale: 1,
    },
  }) as NativeSyntheticEvent<NativeScrollEvent>;

test("a feed restores loaded pages and continues from its saved cursor", async () => {
  const calls: (string | undefined)[] = [];
  const loadData = async (after: string | undefined) => {
    calls.push(after);
    return after === "two" ? [] : [makePost(after ? "two" : "one")];
  };
  const page = await mountPage(() => useRedditDataState({ loadData }));
  await act(async () => {
    await page.current.loadMoreData();
  });
  await page.back();
  await page.forward();
  expect(calls).toEqual([undefined, "one"]);
  expect(page.current.data.map((post) => post.id)).toEqual(["one", "two"]);
  await act(async () => {
    await page.current.loadMoreData();
  });
  expect(calls).toEqual([undefined, "one", "two"]);
  expect(page.current.fullyLoaded).toBe(true);
  await page.back();
  await page.forward();
  await act(async () => {
    await page.current.loadMoreData();
  });
  expect(calls).toEqual([undefined, "one", "two"]);
});

test("changing a feed sort discards an older in-flight response", async () => {
  const slow = Promise.withResolvers<Post[]>();
  let sort = "old";
  const page = await mountPage(() =>
    useRedditDataState({
      loadData: async () => (sort === "old" ? slow.promise : [makePost("new")]),
      refreshDependencies: [sort],
    }),
  );
  sort = "new";
  await page.update();
  await act(async () => {
    slow.resolve([makePost("old")]);
  });
  expect(page.current.data.map((post) => post.id)).toEqual(["new"]);
  await page.back();
  await page.forward();
  expect(page.current.data.map((post) => post.id)).toEqual(["new"]);
});

test("an initial feed failure retries on return without skipping the first page", async () => {
  const calls: (string | undefined)[] = [];
  const page = await mountPage(() =>
    useRedditDataState({
      loadData: async (after) => {
        calls.push(after);
        if (calls.length === 1) throw new Error("offline");
        return [makePost("loaded")];
      },
    }),
  );
  await page.back();
  await page.forward();
  expect(calls).toEqual([undefined, undefined]);
  expect(page.current.data[0].id).toBe("loaded");
});

test("a failed sort change resets the old pagination cursor before retry", async () => {
  let fail = false;
  let sort = "old";
  const calls: (string | undefined)[] = [];
  const page = await mountPage(() =>
    useRedditDataState({
      loadData: async (after) => {
        calls.push(after);
        if (fail) throw new Error("offline");
        return [makePost(sort)];
      },
      refreshDependencies: [sort],
    }),
  );
  fail = true;
  sort = "new";
  await page.update();
  expect(page.current.data).toEqual([]);
  await page.back();
  fail = false;
  await page.forward();
  expect(calls).toEqual([undefined, undefined, undefined]);
  expect(page.current.data[0].id).toBe("new");
});

test("a failed initial post request retries when returning", async () => {
  let calls = 0;
  loadPost = async () => {
    if (++calls === 1) throw new Error("offline");
    return makeDetail("loaded");
  };
  const page = await mountPage(() => usePostDetail("/post", false));
  expect(page.current.loadError?.message).toBe("offline");
  await page.back();
  await page.forward();
  expect(calls).toBe(2);
  expect(page.current.postDetail?.id).toBe("loaded");
  expect(page.current.loadError).toBe(null);
});

test("returning to an access-denied post with another account retries once", async () => {
  let calls = 0;
  loadPost = async () => {
    if (++calls === 1) throw new PrivateSubredditError();
    return makeDetail("loaded");
  };
  const page = await mountPage(() => usePostDetail("/private", false));
  await page.back();
  await page.setAccount("subscriber");
  await page.forward();
  expect(calls).toBe(2);
  expect(page.current.postDetail?.id).toBe("loaded");
});

test("account-dependent feeds retry access failures once on account change", async () => {
  let calls = 0;
  const page = await mountPage(() => {
    const { currentUser } = useContext(AccountContext);
    return useRedditDataState({
      loadData: async () => {
        if (++calls === 1) throw new PrivateSubredditError();
        return [makePost("loaded")];
      },
      refreshDependencies: [currentUser.userName],
    });
  });
  await page.setAccount("subscriber");
  expect(calls).toBe(2);
  expect(page.current.data[0].id).toBe("loaded");
});

test("post loading finishes in history without a second request", async () => {
  const pending = Promise.withResolvers<PostDetail>();
  let calls = 0;
  loadPost = () => {
    calls++;
    return pending.promise;
  };
  const page = await mountPage(() => usePostDetail("/post", false));
  await page.back();
  await act(async () => {
    pending.resolve(makeDetail("loaded"));
  });
  await page.forward();
  expect(calls).toBe(1);
  expect(page.current.postDetail?.id).toBe("loaded");
  expect(page.current.refreshing).toBe(false);
  const comment = page.current.postDetail?.comments[0];
  if (!comment) throw new Error("Comment did not load");
  await act(async () => {
    page.current.changeComment({ ...comment, collapsed: true });
  });
  await page.back();
  await page.forward();
  expect(calls).toBe(1);
  expect(page.current.postDetail?.comments[0].collapsed).toBe(true);
});

test("split-view URL changes release old data and ignore its late response", async () => {
  const slow = Promise.withResolvers<PostDetail>();
  const calls: string[] = [];
  loadPost = async (url) => {
    calls.push(url);
    return calls.length === 1 ? slow.promise : makeDetail(url);
  };
  let url = "/first";
  const page = await mountPage(() => usePostDetail(url, true));
  url = "/second";
  await page.update();
  await act(async () => {
    slow.resolve(makeDetail("late"));
  });
  expect(page.current.postDetail?.id).toBe("/second");
  url = "/first";
  await page.update();
  expect(calls).toEqual(["/first", "/second", "/first"]);
  expect(page.current.postDetail?.id).toBe("/first");
});

test("a failed refresh retains the loaded comment tree", async () => {
  loadPost = async () => makeDetail("loaded");
  const page = await mountPage(() => usePostDetail("/post", false));
  const loaded = page.current.postDetail;
  loadPost = async () => {
    throw new Error("offline");
  };
  await act(async () => {
    await page.current.loadPostDetails();
  });
  expect(page.current.postDetail).toBe(loaded);
  expect(page.current.refreshing).toBe(false);
  await page.back();
  await page.forward();
  expect(page.current.postDetail).toBe(loaded);
});

test("list restoration keeps the offset within the visible item", async () => {
  const page = await mountPage(() =>
    useListScrollRestoration<Post>("scroll", 5),
  );
  page.current.ref.current = {
    getFirstVisibleIndex: () => 2,
    getLayout: () => ({ y: 300 }),
    getAbsoluteLastScrollOffset: () => 470,
    getFirstItemOffset: () => 120,
  } as unknown as NonNullable<typeof page.current.ref.current>;
  page.current.onScroll(scrollEvent(470));
  await page.back();
  await page.forward();
  expect(page.current.initialScrollIndex).toBe(2);
  expect(page.current.initialScrollIndexParams).toEqual({ viewOffset: 50 });
});

test("initial list scroll events cannot erase its saved anchor or inflate distance", async () => {
  const page = await mountPage(() =>
    useListScrollRestoration<Post>("scroll", 5),
  );
  let offset = 470;
  const list = {
    getFirstVisibleIndex: () => (offset === 0 ? 0 : 2),
    getLayout: (index: number) => ({ y: index === 0 ? 0 : 300 }),
    getAbsoluteLastScrollOffset: () => offset,
    getFirstItemOffset: () => 120,
  } as unknown as NonNullable<typeof page.current.ref.current>;
  page.current.ref.current = list;
  page.current.onScroll(scrollEvent(offset));
  await page.back();
  await page.forward();
  page.current.ref.current = list;
  offset = 0;
  expect(page.current.onScroll(scrollEvent(offset))).toBe(false);
  page.current.onLoad();
  await page.back();
  await page.forward();
  expect(page.current.initialScrollIndex).toBe(2);
  expect(page.current.initialScrollIndexParams).toEqual({ viewOffset: 50 });
  page.current.ref.current = list;
  offset = 470;
  expect(page.current.onScroll(scrollEvent(offset))).toBe(false);
  page.current.onLoad();
  expect(page.current.onScroll(scrollEvent(offset))).toBe(false);
  page.current.onScrollBeginDrag();
  offset = 480;
  expect(page.current.onScroll(scrollEvent(offset))).toBe(true);
});

test("comment restoration waits through a short layout and native offset confirmation", async () => {
  const scrolls: { x: number; y: number; animated: boolean }[] = [];
  const scrollView = {
    current: {
      scrollTo: (position: { x: number; y: number; animated: boolean }) =>
        scrolls.push(position),
    } as unknown as ScrollViewInstance,
  };
  let ready = true;
  const page = await mountPage(() =>
    usePostScrollRestoration("/post", scrollView, ready),
  );
  page.current.onScroll(scrollEvent(3000));
  await page.back();
  ready = false;
  await page.forward();
  page.current.onLayout({
    nativeEvent: { layout: { height: 800 } },
  } as LayoutChangeEvent);
  page.current.onContentSizeChange(400, 1000);
  page.current.onScroll(scrollEvent(280, 1000));
  expect(scrolls).toEqual([]);
  ready = true;
  await page.update();
  expect(scrolls).toEqual([]);
  page.current.onContentSizeChange(400, 5000);
  expect(scrolls).toEqual([{ x: 0, y: 3000, animated: false }]);
  page.current.onScroll(scrollEvent(3000));
  await page.back();
  await page.forward();
  expect(page.current.contentOffset).toEqual({ x: 0, y: 3000 });
});

test("touching a page cancels a pending restoration", async () => {
  let scrolls = 0;
  const scrollView = {
    current: { scrollTo: () => scrolls++ } as unknown as ScrollViewInstance,
  };
  let ready = true;
  const page = await mountPage(() =>
    usePostScrollRestoration("/post", scrollView, ready),
  );
  page.current.onScroll(scrollEvent(3000));
  await page.back();
  ready = false;
  await page.forward();
  page.current.onScroll(scrollEvent(280, 1000));
  page.current.onTouchStart();
  ready = true;
  await page.update();
  page.current.onContentSizeChange(400, 5000);
  expect(scrolls).toBe(0);
  await page.back();
  await page.forward();
  expect(page.current.contentOffset).toEqual({ x: 0, y: 280 });
});
