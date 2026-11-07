import { describe, expect, test } from "bun:test";

import { PageStateCache } from "../utils/PageStateCache";

describe("page state cache", () => {
  test("keeps pagination and loaded data together without reinitializing", () => {
    const cache = new PageStateCache();
    let initializations = 0;
    const initial = () => {
      initializations++;
      return { posts: ["one", "two"], cursor: "next", fullyLoaded: false };
    };
    const before = cache.get("page", "feed", initial);
    const after = cache.get("page", "feed", initial);
    expect(after).toBe(before);
    expect(initializations).toBe(1);
    after.set((previous) => ({
      ...previous,
      posts: [...previous.posts, "three"],
      cursor: "last",
    }));
    expect(before.getSnapshot().posts).toEqual(["one", "two", "three"]);
    expect(before.getSnapshot().cursor).toBe("last");
  });

  test("an in-flight request can finish while the page is unmounted", async () => {
    const cache = new PageStateCache();
    const data = cache.get<string[]>("page", "feed", () => []);
    let notifications = 0;
    const unsubscribe = data.subscribe(() => notifications++);
    const request = Promise.resolve(["loaded"]).then(data.set);
    unsubscribe();
    await request;
    expect(notifications).toBe(0);
    const restored = cache.get<string[]>("page", "feed", () => []);
    expect(restored.getSnapshot()).toEqual(["loaded"]);
    const stop = restored.subscribe(() => notifications++);
    restored.set((posts) => [...posts, "next page"]);
    expect(notifications).toBe(1);
    stop();
  });

  test("clearing history isolates late responses from new pages", async () => {
    const cache = new PageStateCache();
    const old = cache.get<string[]>("page", "feed", () => []);
    const request = Promise.resolve(["old response"]).then(old.set);
    cache.retain([]);
    const fresh = cache.get<string[]>("page", "feed", () => []);
    await request;
    expect(old.getSnapshot()).toEqual(["old response"]);
    expect(fresh.getSnapshot()).toEqual([]);
  });

  test("pages and slots do not share state", () => {
    const cache = new PageStateCache();
    cache.get("one", "scroll", () => 0).set(200);
    expect(cache.get("two", "scroll", () => 0).getSnapshot()).toBe(0);
    expect(cache.get("one", "comments", () => []).getSnapshot()).toEqual([]);
  });
});
