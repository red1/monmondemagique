import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

const MIN_VOLUME = 0;
const MAX_VOLUME = 1;

function volumeIcon(level) {
  if (level <= 0.01) return 'volume-mute';
  if (level < 0.45) return 'volume-low';
  return 'volume-high';
}

export default function VolumeControls({
  volume,
  onVolumeChange,
  accentColor = '#FF69B4',
  iconColor,
  style,
  sliderTrackColor,
  variant = 'inline',
}) {
  const [open, setOpen] = useState(false);
  const resolvedIconColor = iconColor || accentColor;
  const trackColor = sliderTrackColor || accentColor;

  const clampVolume = useCallback((value) => (
    Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, value))
  ), []);

  const setVolume = useCallback((next) => {
    onVolumeChange(clampVolume(next));
  }, [clampVolume, onVolumeChange]);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const volumePercent = Math.round(volume * 100);
  const isOverlay = variant === 'overlay';

  return (
    <View style={[styles.wrap, isOverlay && styles.wrapOverlay, style]}>
      {open && (
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
      )}
      {open && (
        <View style={[styles.sliderPopup, isOverlay && styles.sliderPopupOverlay]}>
          <Text style={[styles.volumeLabel, isOverlay && styles.volumeLabelOverlay]}>
            {volumePercent}%
          </Text>
          <View style={styles.verticalSliderWrap}>
            <Slider
              style={styles.verticalSlider}
              minimumValue={MIN_VOLUME}
              maximumValue={MAX_VOLUME}
              value={volume}
              onValueChange={setVolume}
              minimumTrackTintColor={trackColor}
              maximumTrackTintColor={isOverlay ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.12)'}
              thumbTintColor={trackColor}
            />
          </View>
        </View>
      )}
      <TouchableOpacity
        style={[
          styles.volumeBtn,
          isOverlay && styles.volumeBtnOverlay,
          open && (isOverlay ? styles.volumeBtnOverlayActive : styles.volumeBtnActive),
        ]}
        onPress={toggleOpen}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Volume ${volumePercent}%`}
      >
        <Ionicons
          name={volumeIcon(volume)}
          size={isOverlay ? 24 : 22}
          color={resolvedIconColor}
        />
      </TouchableOpacity>
    </View>
  );
}

export function FullscreenTouchHint({
  visible, onExit, label, style,
}) {
  if (!visible) return null;
  return (
    <TouchableOpacity style={[styles.fullscreenHint, style]} onPress={onExit} activeOpacity={0.85}>
      <Ionicons name="contract" size={22} color="white" />
      <Text style={styles.fullscreenHintText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    zIndex: 30,
  },
  wrapOverlay: {
    marginRight: 4,
  },
  backdrop: {
    position: 'absolute',
    top: -400,
    right: -200,
    bottom: -200,
    left: -400,
    zIndex: 1,
  },
  sliderPopup: {
    position: 'absolute',
    bottom: 52,
    right: 0,
    width: 52,
    height: 156,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  sliderPopupOverlay: {
    backgroundColor: 'rgba(40,40,40,0.92)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  volumeLabel: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 11,
    color: '#555',
    marginBottom: 4,
  },
  volumeLabelOverlay: {
    color: 'rgba(255,255,255,0.9)',
  },
  verticalSliderWrap: {
    width: 36,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalSlider: {
    width: 110,
    height: 36,
    transform: [{ rotate: '-90deg' }],
  },
  volumeBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  volumeBtnActive: {
    borderColor: 'rgba(255,105,180,0.45)',
    backgroundColor: '#fff5fa',
  },
  volumeBtnOverlay: {
    backgroundColor: 'rgba(60,60,60,0.75)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  volumeBtnOverlayActive: {
    backgroundColor: 'rgba(80,80,80,0.9)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  fullscreenHint: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 20,
  },
  fullscreenHintText: {
    color: 'white',
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 13,
  },
});
