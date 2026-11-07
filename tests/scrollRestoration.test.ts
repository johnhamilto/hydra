import { describe, expect, test } from "bun:test";

import { ScrollLayout, ScrollRestoration } from "../utils/scrollRestoration";

const fullLayout: ScrollLayout = {
  contentHeight: 5000,
  viewportHeight: 800,
  insetTop: 100,
  insetBottom: 80,
};

describe("comment scroll restoration", () => {
  test("does not scroll or suppress events on a new page", () => {
    const restoration = new ScrollRestoration(undefined);
    expect(restoration.getTarget(fullLayout, true)).toBeUndefined();
    expect(restoration.observe({ x: 0, y: 50 }, fullLayout, true)).toBe(true);
  });

  test("waits for current comments and usable measurements", () => {
    const restoration = new ScrollRestoration({ x: 0, y: 3000 });
    expect(restoration.getTarget(fullLayout, false)).toBeUndefined();
    expect(
      restoration.getTarget({ ...fullLayout, viewportHeight: 0 }, true),
    ).toBeUndefined();
    expect(
      restoration.getTarget({ ...fullLayout, contentHeight: 0 }, true),
    ).toBeUndefined();
    expect(restoration.observe({ x: 0, y: 3000 }, fullLayout, false)).toBe(
      false,
    );
    expect(restoration.getTarget(fullLayout, true)).toEqual({ x: 0, y: 3000 });
  });

  test("short intermediate content cannot consume the saved target", () => {
    const restoration = new ScrollRestoration({ x: 0, y: 3000 });
    const shortLayout = { ...fullLayout, contentHeight: 1000 };
    expect(restoration.getTarget(shortLayout, true)).toBeUndefined();
    expect(restoration.observe({ x: 0, y: 280 }, shortLayout, true)).toBe(
      false,
    );
    expect(restoration.getTarget(fullLayout, true)).toEqual({ x: 0, y: 3000 });
    expect(restoration.observe({ x: 0, y: 3000 }, fullLayout, true)).toBe(true);
    expect(restoration.getTarget(fullLayout, true)).toBeUndefined();
  });

  test("a scroll command does not complete restoration until native confirmation", () => {
    const restoration = new ScrollRestoration({ x: 0, y: 3000 });
    expect(restoration.getTarget(fullLayout, true)).toEqual({ x: 0, y: 3000 });
    expect(restoration.observe({ x: 0, y: 0 }, fullLayout, true)).toBe(false);
    expect(restoration.getTarget(fullLayout, true)).toEqual({ x: 0, y: 3000 });
    expect(restoration.observe({ x: 0, y: 2999.5 }, fullLayout, true)).toBe(
      true,
    );
    expect(restoration.observe({ x: 0, y: 3100 }, fullLayout, true)).toBe(true);
  });

  test("bottom inset counts toward the reachable range", () => {
    const restoration = new ScrollRestoration({ x: 0, y: 4280 });
    expect(restoration.getTarget(fullLayout, true)).toEqual({ x: 0, y: 4280 });
    expect(
      restoration.getTarget({ ...fullLayout, insetBottom: 0 }, true),
    ).toBeUndefined();
  });

  test("top inset is preserved but transient pull-to-refresh overscroll is clamped", () => {
    const restoration = new ScrollRestoration({ x: 0, y: -180 });
    expect(restoration.getTarget(fullLayout, true)).toEqual({ x: 0, y: -100 });
    expect(restoration.observe({ x: 0, y: -100 }, fullLayout, true)).toBe(true);
  });

  test("user drag cancels restoration even if the original position is unreachable", () => {
    const restoration = new ScrollRestoration({ x: 0, y: 3000 });
    const shortLayout = { ...fullLayout, contentHeight: 1000 };
    restoration.cancel();
    expect(restoration.observe({ x: 0, y: 100 }, shortLayout, false)).toBe(
      true,
    );
    expect(restoration.getTarget(fullLayout, true)).toBeUndefined();
  });

  test("the target does not change when its source object is modified", () => {
    const saved = { x: 0, y: 3000 };
    const restoration = new ScrollRestoration(saved);
    saved.y = 0;
    expect(restoration.getTarget(fullLayout, true)).toEqual({ x: 0, y: 3000 });
  });
});
