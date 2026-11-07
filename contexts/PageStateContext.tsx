import type {
  ParamListBase,
  StackNavigationState,
} from "@react-navigation/native";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { PageState, PageStateCache } from "../utils/PageStateCache";
import { getFutureRoutes, getPageCacheKey } from "../utils/stackHistory";

const CacheContext = createContext<PageStateCache | null>(null);
export const PageStateContext = createContext<string | null>(null);

export function PageStateCacheProvider({
  state,
  children,
}: PropsWithChildren<{ state: StackNavigationState<ParamListBase> }>) {
  const [cache] = useState(() => new PageStateCache());
  useEffect(() => {
    cache.retain(
      [...state.routes, ...getFutureRoutes(state)].map(getPageCacheKey),
    );
  }, [cache, state]);
  return (
    <CacheContext.Provider value={cache}>{children}</CacheContext.Provider>
  );
}

export function usePageState<T>(
  slot: string,
  initial: () => T,
  scope?: string,
) {
  const cache = useContext(CacheContext);
  const page = useContext(PageStateContext);
  const entry = useMemo(
    () =>
      cache && page
        ? cache.get(page, slot, initial, scope)
        : new PageState(initial),
    [cache, page, slot, scope],
  );
  // Retire other URL variants only after this render commits. A suspended
  // render must not evict the page that is still on screen.
  useEffect(() => {
    if (cache && page) cache.retainScope(page, slot, scope);
  });
  const value = useSyncExternalStore(
    entry.subscribe,
    entry.getSnapshot,
    entry.getSnapshot,
  );
  return [value, entry.set] as const;
}

export function usePageRef<T>(slot: string, initial: T, scope?: string) {
  const [ref] = usePageState(slot, () => ({ current: initial }), scope);
  return ref;
}
