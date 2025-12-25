import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * GlossyButton - Bouton brillant réutilisable avec animation bounce
 * Utilisé dans le menu principal
 */
const GlossyButton = ({ 
  title, 
  subtitle, 
  icon, 
  color, 
  darkColor, 
  onPress, 
  fullWidth = false 
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      friction: 3,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    // Animation bounce subtile au montage
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.05,
        friction: 2,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[
      fullWidth ? styles.containerFull : styles.container,
      { transform: [{ scale: scaleAnim }] }
    ]}>
      <TouchableOpacity
        style={[
          fullWidth ? styles.buttonFull : styles.button,
          { backgroundColor: color, borderBottomColor: darkColor }
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
      >
        {/* Effet brillant (shine) */}
        <LinearGradient
          colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.2)', 'transparent']}
          style={styles.shine}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        {/* Contenu */}
        <View style={fullWidth ? styles.contentRow : styles.contentColumn}>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          
          <View style={styles.textContainer}>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            <Text style={styles.title}>{title}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    margin: 8,
  },
  containerFull: {
    width: '100%',
    marginVertical: 8,
    marginHorizontal: 16,
  },
  button: {
    borderRadius: 40,
    padding: 20,
    borderBottomWidth: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    overflow: 'hidden',
    minHeight: 140,
    justifyContent: 'center',
  },
  buttonFull: {
    borderRadius: 40,
    padding: 20,
    borderBottomWidth: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    overflow: 'hidden',
    minHeight: 100,
    justifyContent: 'center',
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  contentColumn: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Fredoka-SemiBold',
    color: 'white',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Fredoka-SemiBold',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 4,
  },
});

export default GlossyButton;

