import type {
  NavigationAction,
  NavigationRoute,
  ParamListBase,
  Router,
  StackNavigationState,
} from "@react-navigation/routers";

type PageRoute<Params extends ParamListBase> = NavigationRoute<
  Params,
  keyof Params
> & {
  pageCacheKey?: string;
};

type HistoryState<Params extends ParamListBase> =
  StackNavigationState<Params> & {
    futureRoutes?: PageRoute<Params>[];
    futureAnchor?: string;
  };

export const getPageCacheKey = (route: {
  key: string;
  pageCacheKey?: string;
}) => route.pageCacheKey ?? route.key;

export const getFutureRoutes = <Params extends ParamListBase>(
  state: HistoryState<Params>,
): PageRoute<Params>[] =>
  state.futureAnchor === state.routes[state.index]?.key
    ? (state.futureRoutes ?? [])
    : [];

export function stackHistoryRouter<
  Params extends ParamListBase,
  Action extends NavigationAction,
>(
  original: Router<StackNavigationState<Params>, Action>,
): Partial<Router<StackNavigationState<Params>, Action>> {
  return {
    getStateForAction(state, action, options) {
      const futureRoutes = getFutureRoutes(state);
      if (action.type === "GO_FORWARD") {
        const [next, ...remaining] = futureRoutes;
        if (!next) return state;
        // A dismissed native screen cannot be reused. Its replacement shares
        // the page cache, but needs a fresh native route identity.
        const route = {
          ...next,
          key: `${next.key}-forward`,
          pageCacheKey: getPageCacheKey(next),
        } as PageRoute<Params>;
        return {
          ...state,
          routes: [...state.routes, route],
          index: state.routes.length,
          futureRoutes: remaining,
          futureAnchor: route.key,
        };
      }
      if (action.type === "CLEAR_FUTURE") {
        return { ...state, futureRoutes: [], futureAnchor: undefined };
      }

      const next = original.getStateForAction(state, action, options);
      if (!next || next === state) return next;

      if (
        next.stale === false &&
        ["GO_BACK", "POP", "POP_TO_TOP", "POP_TO"].includes(action.type)
      ) {
        const retained = new Set(next.routes.map((route) => route.key));
        // Only a pop to an existing page belongs in forward history.
        if (
          next.routes.every((route) =>
            state.routes.some((previous) => previous.key === route.key),
          )
        ) {
          return {
            ...next,
            futureRoutes: [
              ...state.routes.filter((route) => !retained.has(route.key)),
              ...futureRoutes,
            ],
            futureAnchor: next.routes[next.index]?.key,
          };
        }
      }

      if (
        ["PUSH", "NAVIGATE", "REPLACE", "RESET", "POP_TO"].includes(action.type)
      ) {
        return { ...next, futureRoutes: [], futureAnchor: undefined };
      }
      return next;
    },
  };
}
