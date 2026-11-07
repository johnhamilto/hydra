import { RefObject, useEffect, useRef } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewInstance,
} from "react-native";

import { usePageRef } from "../contexts/PageStateContext";
import { ScrollPosition, ScrollRestoration } from "./scrollRestoration";

export function usePostScrollRestoration(
  url: string,
  scrollView: RefObject<ScrollViewInstance | null>,
  contentReady: boolean,
) {
  const savedPosition = usePageRef<ScrollPosition | undefined>(
    "post-scroll",
    undefined,
    url,
  );
  const sessionRef = useRef(createSession(savedPosition));
  if (sessionRef.current.savedPosition !== savedPosition) {
    sessionRef.current = createSession(savedPosition);
  }
  const session = sessionRef.current;

  const restore = () => {
    const target = session.restoration.getTarget(session.layout, contentReady);
    if (target) scrollView.current?.scrollTo({ ...target, animated: false });
  };

  useEffect(() => {
    restore();
  }, [contentReady, url]);

  return {
    contentOffset: session.restoration.initialOffset,
    onLayout: (event: LayoutChangeEvent) => {
      session.layout.viewportHeight = event.nativeEvent.layout.height;
      restore();
    },
    onContentSizeChange: (_width: number, height: number) => {
      session.layout.contentHeight = height;
      restore();
    },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement, contentInset } =
        event.nativeEvent;
      session.lastPosition = { ...contentOffset };
      session.layout = {
        contentHeight: contentSize.height,
        viewportHeight: layoutMeasurement.height,
        insetTop: contentInset.top,
        insetBottom: contentInset.bottom,
      };
      if (
        session.restoration.observe(contentOffset, session.layout, contentReady)
      ) {
        savedPosition.current = { ...contentOffset };
      } else {
        restore();
      }
    },
    onScrollBeginDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      session.restoration.cancel();
      savedPosition.current = { ...event.nativeEvent.contentOffset };
    },
    onTouchStart: () => {
      session.restoration.cancel();
      if (session.lastPosition) savedPosition.current = session.lastPosition;
    },
  };
}

function createSession(savedPosition: { current: ScrollPosition | undefined }) {
  return {
    savedPosition,
    restoration: new ScrollRestoration(savedPosition.current),
    lastPosition: undefined as ScrollPosition | undefined,
    layout: {
      contentHeight: 0,
      viewportHeight: 0,
      insetTop: 0,
      insetBottom: 0,
    },
  };
}
