export interface ScrollPosition {
  x: number;
  y: number;
}

export interface ScrollLayout {
  contentHeight: number;
  viewportHeight: number;
  insetTop: number;
  insetBottom: number;
}

const OFFSET_TOLERANCE = 1;

export class ScrollRestoration {
  readonly initialOffset: ScrollPosition | undefined;
  private pending: boolean;

  constructor(position: ScrollPosition | undefined) {
    this.initialOffset = position ? { ...position } : undefined;
    this.pending = position !== undefined;
  }

  getTarget(layout: ScrollLayout, contentReady: boolean) {
    if (
      !this.pending ||
      !this.initialOffset ||
      !contentReady ||
      layout.viewportHeight <= 0 ||
      layout.contentHeight <= 0
    )
      return undefined;

    const y = Math.max(this.initialOffset.y, -layout.insetTop);
    const maximumY = Math.max(
      -layout.insetTop,
      layout.contentHeight - layout.viewportHeight + layout.insetBottom,
    );
    // Native scrollTo clamps to the current content bounds. A short first
    // layout must not consume a target belonging to the full comment tree.
    if (y > maximumY + OFFSET_TOLERANCE) return undefined;
    return { ...this.initialOffset, y };
  }

  observe(
    position: ScrollPosition,
    layout: ScrollLayout,
    contentReady: boolean,
  ) {
    if (!this.pending) return true;
    const target = this.getTarget(layout, contentReady);
    if (
      !target ||
      Math.abs(position.x - target.x) > OFFSET_TOLERANCE ||
      Math.abs(position.y - target.y) > OFFSET_TOLERANCE
    )
      return false;
    this.pending = false;
    return true;
  }

  cancel() {
    this.pending = false;
  }
}
