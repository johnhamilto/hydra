import type {
  NavigationRoute,
  NavigationState,
  ParamListBase,
} from "@react-navigation/routers";

export function resetAccountTabState<Params extends ParamListBase>(
  state: NavigationState<Params>,
  accountRoute: NavigationRoute<ParamListBase, string>,
): NavigationState<Params> {
  return {
    ...state,
    routes: state.routes.map((route) =>
      route.name === "Account"
        ? Object.assign({}, route, {
            state: { index: 0, routes: [accountRoute] },
          })
        : route,
    ),
  };
}
