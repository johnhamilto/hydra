import { describe, expect, test } from "bun:test";
import {
  CommonActions,
  StackActions,
  StackRouter,
  type NavigationAction,
  type NavigationState,
  type ParamListBase,
  type Router,
  type StackNavigationState,
} from "@react-navigation/routers";

import {
  getFutureRoutes,
  getPageCacheKey,
  stackHistoryRouter,
} from "../utils/stackHistory";
import { PageStateCache } from "../utils/PageStateCache";
import { resetAccountTabState } from "../utils/accountNavigation";

const options = {
  routeNames: ["Home", "Posts", "Comments", "Gallery"],
  routeParamList: {},
  routeGetIdList: {},
};
const original = StackRouter({ initialRouteName: "Home" });
const router: Router<StackNavigationState<ParamListBase>, NavigationAction> = {
  ...original,
  ...stackHistoryRouter(original),
};

function apply(
  state: StackNavigationState<ParamListBase>,
  action: NavigationAction,
) {
  const next = router.getStateForAction(state, action, options);
  if (!next) return state;
  return router.getRehydratedState(next, options);
}

function openPages() {
  let state = router.getInitialState(options);
  state = apply(state, StackActions.push("Posts", { url: "/r/example" }));
  return apply(state, StackActions.push("Comments", { url: "/comments/123" }));
}

describe("forward page history", () => {
  for (const action of [CommonActions.goBack(), StackActions.pop()]) {
    test(`restores page identity and params after ${action.type}`, () => {
      const opened = openPages();
      const page = opened.routes[2];
      const back = apply(opened, {
        ...action,
        source: page.key,
        target: opened.key,
      });
      expect(back.routes.map((route) => route.name)).toEqual(["Home", "Posts"]);
      expect(getFutureRoutes(back)).toEqual([page]);
      const forward = apply(back, { type: "GO_FORWARD" });
      expect(forward.routes[2].params).toBe(page.params);
      expect(getPageCacheKey(forward.routes[2])).toBe(getPageCacheKey(page));
      expect(forward.routes[2].key === page.key).toBe(false);
      expect(getFutureRoutes(forward)).toEqual([]);
    });
  }

  test("keeps multi-page pops in chronological order", () => {
    const opened = openPages();
    let state = apply(opened, StackActions.popToTop());
    expect(getFutureRoutes(state)).toEqual(opened.routes.slice(1));
    state = apply(state, { type: "GO_FORWARD" });
    expect(state.routes[state.index].name).toBe("Posts");
    expect(getFutureRoutes(state)).toEqual([opened.routes[2]]);
    state = apply(state, { type: "GO_FORWARD" });
    expect(state.routes[state.index].name).toBe("Comments");
  });

  test("keeps repeated back/forward trips attached to the same cache", () => {
    let state = openPages();
    const key = getPageCacheKey(state.routes[2]);
    const nativeKeys = new Set([state.routes[2].key]);
    for (let i = 0; i < 1000; i++) {
      state = apply(state, CommonActions.goBack());
      state = apply(state, { type: "GO_FORWARD" });
      expect(getPageCacheKey(state.routes[2])).toBe(key);
      nativeKeys.add(state.routes[2].key);
    }
    expect(nativeKeys.size).toBe(1001);
    expect(state.routes[2].key.length <= key.length + 13).toBe(true);
  });

  test("preserves remaining forward pages when going back again", () => {
    const opened = openPages();
    let state = apply(opened, CommonActions.goBack());
    state = apply(state, CommonActions.goBack());
    expect(getFutureRoutes(state)).toEqual(opened.routes.slice(1));
    state = apply(state, { type: "GO_FORWARD" });
    state = apply(state, CommonActions.goBack());
    expect(getFutureRoutes(state).map(getPageCacheKey)).toEqual(
      opened.routes.slice(1).map(getPageCacheKey),
    );
  });

  for (const action of [
    StackActions.push("Gallery"),
    StackActions.replace("Gallery"),
    CommonActions.navigate("Gallery"),
    CommonActions.reset({ routes: [{ name: "Home" }] }),
    { type: "CLEAR_FUTURE" },
  ]) {
    test(`${action.type} discards the abandoned forward branch`, () => {
      let state = apply(openPages(), CommonActions.goBack());
      state = apply(state, action);
      expect(getFutureRoutes(state)).toEqual([]);
      expect(apply(state, { type: "GO_FORWARD" })).toBe(state);
    });
  }

  test("a parent account reset cannot revive an old forward branch", () => {
    const accountRoot = {
      ...router.getInitialState(options),
      routes: [{ name: "Home", key: "UserPage-A" }],
    };
    const account = apply(
      apply(
        accountRoot,
        StackActions.push("Comments", { url: "/comments/123" }),
      ),
      CommonActions.goBack(),
    );
    const postsTab = { key: "posts", name: "Posts", state: openPages() };
    let tabs: NavigationState = {
      stale: false,
      type: "tab",
      key: "tabs",
      index: 0,
      routeNames: ["Account", "Posts"],
      routes: [{ key: "account", name: "Account", state: account }, postsTab],
    };

    expect(getFutureRoutes(account).length).toBe(1);
    for (const name of ["B", "A"]) {
      tabs = resetAccountTabState(tabs, {
        name: "Home",
        key: `UserPage-${name}`,
      });
      const partial = tabs.routes[0].state;
      if (!partial) throw new Error("Missing account stack");
      if (partial.stale === false) throw new Error("Expected a fresh stack");
      const reset = router.getRehydratedState(
        { ...partial, type: "stack" },
        options,
      );
      expect(getFutureRoutes(reset)).toEqual([]);
      expect(apply(reset, { type: "GO_FORWARD" })).toBe(reset);
      expect(tabs.routes[1]).toBe(postsTab);
      tabs = {
        ...tabs,
        routes: [{ ...tabs.routes[0], state: reset }, postsTab],
      };
    }
  });

  test("removing a middle route cannot become forward history from a newer page", () => {
    let state = apply(openPages(), StackActions.push("Gallery"));
    state = apply(state, CommonActions.goBack());
    expect(getFutureRoutes(state).map((route) => route.name)).toEqual([
      "Gallery",
    ]);
    const removedPage = state.routes[1];
    const updated = apply(state, {
      ...StackActions.pop(),
      target: state.key,
      source: removedPage.key,
    });
    expect(updated.routes.map((route) => route.name)).toEqual([
      "Home",
      "Comments",
    ]);
    expect(getFutureRoutes(updated)).toEqual([]);
    expect(apply(updated, { type: "GO_FORWARD" })).toBe(updated);
  });

  test("a native multi-page pop retains only the dismissed trailing routes", () => {
    const state = apply(openPages(), StackActions.push("Gallery"));
    const updated = apply(state, {
      ...StackActions.pop(2),
      target: state.key,
      source: state.routes[state.index].key,
    });
    expect(updated.routes.map((route) => route.name)).toEqual([
      "Home",
      "Posts",
    ]);
    expect(getFutureRoutes(updated)).toEqual(state.routes.slice(2));
  });

  test("two visits to the same URL have separate caches", () => {
    let state = openPages();
    const first = state.routes[2];
    state = apply(state, StackActions.push(first.name, first.params));
    expect(getPageCacheKey(state.routes[3]) === getPageCacheKey(first)).toBe(
      false,
    );
  });

  test("navigation in another tab does not change this tab's history", () => {
    const firstTab = apply(openPages(), CommonActions.goBack());
    let secondTab = openPages();
    secondTab = apply(secondTab, StackActions.popToTop());
    secondTab = apply(secondTab, StackActions.push("Gallery"));
    expect(getFutureRoutes(secondTab)).toEqual([]);
    expect(getFutureRoutes(firstTab).map((route) => route.name)).toEqual([
      "Comments",
    ]);
  });

  test("no-op back and invalid navigation leave existing history intact", () => {
    const state = apply(openPages(), StackActions.popToTop());
    expect(apply(state, CommonActions.goBack())).toBe(state);
    expect(apply(state, StackActions.push("Missing"))).toBe(state);
  });

  test("retains cached content and scroll position until the branch is discarded", () => {
    const cache = new PageStateCache();
    let state = openPages();
    const key = getPageCacheKey(state.routes[2]);
    const page = cache.get(key, "comments", () => ({
      expanded: true,
      loadedReplies: ["reply"],
      scrollY: 1250,
    }));
    state = apply(state, CommonActions.goBack());
    cache.retain(
      [...state.routes, ...getFutureRoutes(state)].map(getPageCacheKey),
    );
    state = apply(state, { type: "GO_FORWARD" });
    expect(
      cache.get(getPageCacheKey(state.routes[2]), "comments", () => null),
    ).toBe(page);
    expect(page.getSnapshot().scrollY).toBe(1250);
    state = apply(state, CommonActions.goBack());
    state = apply(state, StackActions.push("Gallery"));
    cache.retain(
      [...state.routes, ...getFutureRoutes(state)].map(getPageCacheKey),
    );
    expect(cache.get(key, "comments", () => null).getSnapshot()).toBe(null);
  });
});
