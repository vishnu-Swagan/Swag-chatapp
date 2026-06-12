import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, R, SP } from "@/src/theme";

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string) => {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { message, show };
}

export function Toast({ message }: { message: string | null }) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: message ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [message, opacity]);

  if (!message) return null;
  return (
    <Animated.View
      testID="toast-message"
      pointerEvents="none"
      style={[styles.toast, { bottom: insets.bottom + 90, opacity }]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: SP.xl,
    right: SP.xl,
    backgroundColor: C.inverse,
    borderRadius: R.md,
    paddingVertical: SP.md,
    paddingHorizontal: SP.lg,
    alignItems: "center",
    zIndex: 1000,
  },
  text: {
    color: C.onInverse,
    fontSize: 14,
    fontWeight: "500",
  },
});
