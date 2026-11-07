import { useNavigation, useNavigationState } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { createContext, PropsWithChildren, useEffect, useRef } from "react";
import { useVerticalBarEdgeIOS } from "expo-status-bar";
import { Animated, Dimensions } from "react-native";

import { StackParamsList } from "../app/stack";
import { getFutureRoutes } from "../utils/stackHistory";

export const StackFutureContext = createContext({
  clearFuture: () => {},
});

export function StackFutureProvider({ children }: PropsWithChildren) {
  const navigation =
    useNavigation<NativeStackNavigationProp<StackParamsList>>();

  const windowWidth = useRef(Dimensions.get("window").width);
  const gestureStart = useRef<{ x: number; y: number } | null>(null);
  const hasFuture = useNavigationState(
    (state) =>
      getFutureRoutes(state as ReturnType<typeof navigation.getState>).length >
      0,
  );

  const goForward = () => {
    if (
      !navigation.isFocused() ||
      !getFutureRoutes(navigation.getState()).length
    )
      return false;
    navigation.dispatch({
      type: "GO_FORWARD",
      target: navigation.getState().key,
    });
    return true;
  };

  /**
   * The iPhone Duo's vertical bar covers the screen edge the forward swipe
   * starts from, but it does host native header items next to the back button.
   */
  const verticalBarEdge = useVerticalBarEdgeIOS();
  useEffect(() => {
    const updateForwardButton = () => {
      const showForward = !!verticalBarEdge && hasFuture;
      navigation.setOptions({
        headerBackVisible: showForward || undefined,
        unstable_headerLeftItems: showForward
          ? () => [
              {
                type: "button",
                label: "Forward",
                icon: { type: "sfSymbol", name: "chevron.forward" },
                onPress: goForward,
              },
            ]
          : undefined,
      });
    };
    updateForwardButton();
    return navigation.addListener("focus", updateForwardButton);
  }, [navigation, verticalBarEdge, hasFuture]);

  useEffect(() => {
    const subscription = Dimensions.addEventListener(
      "change",
      (event: { window: { width: number } }) =>
        (windowWidth.current = event.window.width),
    );
    return () => subscription.remove();
  }, []);

  return (
    <StackFutureContext.Provider
      value={{
        clearFuture: () =>
          navigation.dispatch({
            type: "CLEAR_FUTURE",
            target: navigation.getState().key,
          }),
      }}
    >
      <Animated.View
        style={{
          width: "100%",
          height: "100%",
        }}
        onStartShouldSetResponderCapture={(e) => {
          gestureStart.current = {
            x: e.nativeEvent.pageX,
            y: e.nativeEvent.pageY,
          };
          return false;
        }}
        onMoveShouldSetResponder={() =>
          !!gestureStart.current &&
          windowWidth.current - gestureStart.current.x < 30 &&
          hasFuture
        }
        onResponderMove={(e) => {
          if (!gestureStart.current) return false;
          const deltaX = gestureStart.current.x - e.nativeEvent.pageX;
          const deltaY = e.nativeEvent.pageY - gestureStart.current.y;
          const angleDegrees = Math.abs(
            Math.atan2(deltaY, deltaX) * (180 / Math.PI),
          );
          if (angleDegrees > 15 && deltaY > 30) {
            gestureStart.current = null;
            return false;
          }
          if (deltaX > 15 && angleDegrees < 15) {
            if (!goForward()) return false;
            gestureStart.current = null;
            return true;
          }
          return false;
        }}
      >
        {children}
      </Animated.View>
    </StackFutureContext.Provider>
  );
}
