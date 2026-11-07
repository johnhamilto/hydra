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

export function usePageState<T>(slot: string, initial: () => T) {
  const cache = useContext(CacheContext);
  const page = useContext(PageStateContext);
  const entry = useMemo(
    () =>
      cache && page ? cache.get(page, slot, initial) : new PageState(initial),
    [cache, page, slot],
  );
  const value = useSyncExternalStore(
    entry.subscribe,
    entry.getSnapshot,
    entry.getSnapshot,
  );
  return [value, entry.set] as const;
}

export function usePageRef<T>(slot: string, initial: T) {
  const [ref] = usePageState(slot, () => ({ current: initial }));
  return ref;
}
