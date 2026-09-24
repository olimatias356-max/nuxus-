import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Heart } from 'lucide-react-native';

import { colors } from '@/ui';

export type HeartBurstHandle = { play: () => void };

/** Big heart that pops over the media on double tap. */
export const HeartBurst = forwardRef<HeartBurstHandle>(function HeartBurst(_, ref) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useImperativeHandle(ref, () => ({
    play: () => {
      scale.setValue(0.3);
      opacity.setValue(1);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
        Animated.sequence([Animated.delay(450), Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true })]),
      ]).start();
    },
  }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { opacity, transform: [{ scale }] }]}>
      <Heart size={96} color={colors.white} fill={colors.like} strokeWidth={1.5} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
