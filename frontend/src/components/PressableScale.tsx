import React from "react";
import { Platform, Pressable, PressableProps, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  style?: ViewStyle | ViewStyle[];
  haptic?: boolean;
  scale?: number;
  children?: React.ReactNode;
};

/**
 * AnimatedPressable that scales down on press with spring + optional haptic.
 * Drop-in replacement for <Pressable> on interactive elements.
 */
export default function PressableScale({
  style,
  haptic = true,
  scale = 0.96,
  onPress,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: Props) {
  const s = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        s.value = withTiming(scale, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, { damping: 14, stiffness: 200 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic && Platform.OS !== "web") {
          try {
            Haptics.selectionAsync();
          } catch {}
        }
        onPress?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
