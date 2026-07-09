import React, { useEffect, useRef } from 'react';
import { StyleSheet, Dimensions, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const TwinklingStar = ({ style }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Opacity animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800 + Math.random() * 1200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800 + Math.random() * 1200, useNativeDriver: true }),
      ])
    ).start();

    // Floating animation
    const move = () => {
      Animated.sequence([
        Animated.timing(translateY, { 
          toValue: -20 + Math.random() * 40, 
          duration: 2000 + Math.random() * 2000, 
          useNativeDriver: true 
        }),
        Animated.timing(translateX, { 
          toValue: -20 + Math.random() * 40, 
          duration: 2000 + Math.random() * 2000, 
          useNativeDriver: true 
        }),
        Animated.timing(translateY, { toValue: 0, duration: 2000, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ]).start(() => move());
    };
    move();
  }, []);

  return (
    <Animated.Text style={[
      style, 
      { 
        opacity, 
        transform: [{ translateY }, { translateX }],
        position: 'absolute',
        color: '#FFFACD'
      }
    ]}>
      ⭐
    </Animated.Text>
  );
};

const AnimatedBubble = ({ delay = 0 }) => {
  const pos = useRef(new Animated.Value(height + 100)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;
  const size = 15 + Math.random() * 60;
  const left = (Math.random() * 100) + '%';
  
  useEffect(() => {
    const startAnim = () => {
      pos.setValue(height + 100);
      opacity.setValue(0.6);
      
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(pos, {
            toValue: -150,
            duration: 8000 + Math.random() * 8000,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(6000 + Math.random() * 4000),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 2000,
              useNativeDriver: true,
            })
          ])
        ])
      ]).start(() => startAnim());
    };
    startAnim();
  }, []);

  return (
    <Animated.View style={[
      styles.bubble, 
      { 
        left,
        width: size, 
        height: size, 
        borderRadius: size / 2,
        opacity,
        transform: [{ translateY: pos }] 
      }
    ]} />
  );
};

const AnimatedBackground = ({ colors = ['#FFDAB9', '#FFE4E1', '#FFB6C1'] }) => {
  return (
    <LinearGradient colors={colors} style={styles.background} pointerEvents="none">
      {[...Array(15)].map((_, i) => (
        <AnimatedBubble key={i} delay={i * 800} />
      ))}
      
      <TwinklingStar style={{ top: 100, left: 30, fontSize: 30 }} />
      <TwinklingStar style={{ top: 180, right: 40, fontSize: 25 }} />
      <TwinklingStar style={{ bottom: 150, left: 60, fontSize: 40 }} />
      <TwinklingStar style={{ bottom: 250, right: 20, fontSize: 20 }} />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  background: { ...StyleSheet.absoluteFillObject },
  bubble: { 
    position: 'absolute', 
    backgroundColor: 'rgba(255, 255, 255, 0.3)', 
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.5)' 
  },
});

export default AnimatedBackground;

