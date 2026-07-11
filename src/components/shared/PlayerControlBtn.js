import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PINK = '#FF69B4';
export const CONTROL_HEIGHT = 48;

export default function PlayerControlBtn({
  icon,
  label,
  onPress,
  disabled,
  primary,
  flip,
  color = PINK,
  variant = 'default',
}) {
  const isOverlay = variant === 'overlay';
  const accent = color;

  const iconColor = disabled
    ? (isOverlay ? 'rgba(255,255,255,0.3)' : `${accent}55`)
    : (primary && !isOverlay ? 'white' : isOverlay ? 'white' : accent);

  const labelColor = disabled
    ? (isOverlay ? 'rgba(255,255,255,0.3)' : `${accent}55`)
    : (isOverlay ? 'rgba(255,255,255,0.9)' : accent);

  let backgroundColor = 'rgba(255,255,255,0.92)';
  let borderColor = accent;

  if (isOverlay) {
    if (primary) {
      backgroundColor = 'rgba(255,255,255,0.22)';
      borderColor = 'rgba(255,255,255,0.45)';
    } else if (disabled) {
      backgroundColor = 'rgba(255,255,255,0.08)';
      borderColor = 'rgba(255,255,255,0.12)';
    } else {
      backgroundColor = 'rgba(0,0,0,0.55)';
      borderColor = 'rgba(255,255,255,0.28)';
    }
  } else if (primary) {
    backgroundColor = accent;
    borderColor = accent;
  } else if (disabled) {
    backgroundColor = 'rgba(255,255,255,0.45)';
    borderColor = `${accent}55`;
  }

  return (
    <TouchableOpacity
      style={[
        styles.ctrlBtn,
        primary && styles.ctrlBtnPrimary,
        { backgroundColor, borderColor },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <Ionicons
        name={icon}
        size={primary ? 26 : 20}
        color={iconColor}
        style={flip ? { transform: [{ scaleX: -1 }] } : undefined}
      />
      {label ? (
        <Text style={[styles.ctrlLabel, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export const playerControlStyles = StyleSheet.create({
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    width: '100%',
    flexWrap: 'wrap',
  },
  ctrlBtn: {
    height: CONTROL_HEIGHT,
    minWidth: CONTROL_HEIGHT,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ctrlBtnPrimary: {
    minWidth: 52,
    paddingHorizontal: 12,
  },
  ctrlLabel: {
    fontSize: 9,
    fontFamily: 'Fredoka-SemiBold',
    marginTop: 2,
    textAlign: 'center',
  },
});

const styles = playerControlStyles;
