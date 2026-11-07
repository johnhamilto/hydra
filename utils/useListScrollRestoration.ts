import type { FlashListRef } from "@shopify/flash-list";
import { useRef } from "react";

import { usePageRef } from "../contexts/PageStateContext";

interface ListPosition {
  index: number;
  viewOffset: number;
}

export function useListScrollRestoration<T>(slot: string, itemCount: number) {
  const position = usePageRef<ListPosition | null>(slot, null);
  const initial = useRef(position.current).current;
  const ref = useRef<FlashListRef<T>>(null);

  const savePosition = () => {
    const list = ref.current;
    if (!list) return;
    const index = list.getFirstVisibleIndex();
    const layout = list.getLayout(index);
    if (!layout) return;
    position.current = {
      index,
      viewOffset:
        list.getAbsoluteLastScrollOffset() -
        list.getFirstItemOffset() -
        layout.y,
    };
  };

  return {
    ref,
    initialScrollIndex:
      initial && initial.index < itemCount ? initial.index : undefined,
    initialScrollIndexParams: initial
      ? { viewOffset: initial.viewOffset }
      : undefined,
    onScroll: savePosition,
  };
}
