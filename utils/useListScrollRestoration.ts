import type { FlashListRef } from "@shopify/flash-list";
import { useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import { usePageRef } from "../contexts/PageStateContext";

interface ListPosition {
  index: number;
  viewOffset: number;
}

export function useListScrollRestoration<T>(slot: string, itemCount: number) {
  const position = usePageRef<ListPosition | null>(slot, null);
  const initial = useRef(position.current).current;
  const ref = useRef<FlashListRef<T>>(null);
  const session = useRef({
    pending: !!initial,
    loaded: false,
    userScrolled: false,
  }).current;

  const savePosition = (offset: number) => {
    const list = ref.current;
    if (!list) return false;
    const wasPending = session.pending;
    if (session.pending && initial) {
      if (!session.loaded) return false;
      if (initial.index < itemCount) {
        const targetLayout = list.getLayout(initial.index);
        if (!targetLayout) return false;
        const target =
          targetLayout.y + initial.viewOffset + list.getFirstItemOffset();
        if (Math.abs(offset - target) > 1) return false;
      }
      session.pending = false;
    }
    const index = list.getFirstVisibleIndex();
    const layout = list.getLayout(index);
    if (!layout) return false;
    position.current = {
      index,
      viewOffset: offset - list.getFirstItemOffset() - layout.y,
    };
    return session.userScrolled && !wasPending;
  };

  return {
    ref,
    initialScrollIndex:
      initial && initial.index < itemCount ? initial.index : undefined,
    initialScrollIndexParams: initial
      ? { viewOffset: initial.viewOffset }
      : undefined,
    onLoad: () => {
      session.loaded = true;
      const list = ref.current;
      if (list) savePosition(list.getAbsoluteLastScrollOffset());
    },
    onScrollBeginDrag: () => {
      session.pending = false;
      session.userScrolled = true;
    },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      savePosition(event.nativeEvent.contentOffset.y),
  };
}
