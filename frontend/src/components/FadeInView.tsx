import React from "react";
import { ViewProps } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";

type Direction = "up" | "down" | "none";

type Props = ViewProps & {
  delay?: number;
  duration?: number;
  from?: Direction;
  children?: React.ReactNode;
};

/**
 * Fade-in entrance wrapper for any view. Uses reanimated layout animations
 * so it runs on the UI thread.
 */
export default function FadeInView({
  delay = 0,
  duration = 320,
  from = "up",
  children,
  ...rest
}: Props) {
  const entering =
    from === "none"
      ? FadeIn.duration(duration).delay(delay)
      : from === "up"
        ? FadeInUp.duration(duration).delay(delay)
        : FadeInDown.duration(duration).delay(delay);
  return (
    <Animated.View entering={entering} {...rest}>
      {children}
    </Animated.View>
  );
}
