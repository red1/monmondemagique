import React, { createContext, useState, useContext, useEffect, useRef, useCallback, useMemo } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';

const SoundContext = createContext();

export const useSounds = () => useContext(SoundContext);

export const SoundProvider = ({ children }) => {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [bgmSound, setBgmSound] = useState(null);
  const storyPlaybackRef = useRef(false);
  const bgmWasPlayingRef = useRef(false);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);

  // Load and play background music
  useEffect(() => {
    let soundObject;
    const loadMusic = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
           require('../assets/music/music.ai.mp3'),
           { isLooping: true, volume: 0.3 },
        );
        soundObject = sound;
        setBgmSound(sound);
        if (musicEnabled && !storyPlaybackRef.current) await sound.playAsync();
      } catch (error) {
        console.log("Error loading music:", error);
      }
    };

    loadMusic();

    return () => {
      if (soundObject) soundObject.unloadAsync();
    };
  }, []);

  // Toggle Music Playback
  useEffect(() => {
    const toggleMusic = async () => {
      if (bgmSound && !storyPlaybackRef.current) {
        if (musicEnabled) {
          await bgmSound.playAsync();
        } else {
          await bgmSound.pauseAsync();
        }
      }
    };
    toggleMusic();
  }, [musicEnabled, bgmSound]);

  const pauseBackgroundMusic = useCallback(async () => {
    if (!bgmSound) return;
    try {
      const status = await bgmSound.getStatusAsync();
      bgmWasPlayingRef.current = status.isLoaded && status.isPlaying;
      if (bgmWasPlayingRef.current) await bgmSound.pauseAsync();
    } catch (_) { /* ignore */ }
  }, [bgmSound]);

  const resumeBackgroundMusic = useCallback(async () => {
    if (!bgmSound || !musicEnabled || !bgmWasPlayingRef.current) return;
    try {
      await bgmSound.playAsync();
    } catch (_) { /* ignore */ }
    bgmWasPlayingRef.current = false;
  }, [bgmSound, musicEnabled]);

  const beginStoryPlayback = useCallback(async () => {
    storyPlaybackRef.current = true;
    await pauseBackgroundMusic();
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: false,
    });
  }, [pauseBackgroundMusic]);

  const endStoryPlayback = useCallback(async () => {
    storyPlaybackRef.current = false;
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
    });
    await resumeBackgroundMusic();
  }, [resumeBackgroundMusic]);

  const playSound = useCallback(async (type) => {
    if (!soundEnabled || storyPlaybackRef.current) return;

    try {
      let soundFile;
      switch (type) {
        case 'success':
          try {
            soundFile = require('../assets/sounds/success.mp3');
          } catch {
            console.log('⚠️ success.mp3 non trouvé - voir assets/sounds/README.md');
          }
          break;
        case 'wrong':
          try {
            soundFile = require('../assets/sounds/wrong.mp3');
          } catch {
            console.log('⚠️ wrong.mp3 non trouvé - voir assets/sounds/README.md');
          }
          break;
        case 'pop':
          try {
            soundFile = require('../assets/sounds/click.mp3');
          } catch {
            console.log('⚠️ click.mp3 non trouvé - voir assets/sounds/README.md');
          }
          break;
        case 'win':
          try {
            soundFile = require('../assets/sounds/win.mp3');
          } catch {
            console.log('⚠️ win.mp3 non trouvé - voir assets/sounds/README.md');
          }
          break;
        default:
          return;
      }

      if (soundFile) {
        const { sound } = await Audio.Sound.createAsync(soundFile);
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate(async (status) => {
          if (status.didJustFinish) {
            await sound.unloadAsync();
          }
        });
      }
    } catch (error) {
      console.log('Sound error:', error.message);
    }
  }, [soundEnabled]);

  const contextValue = useMemo(() => ({
    soundEnabled,
    setSoundEnabled,
    musicEnabled,
    setMusicEnabled,
    playSound,
    beginStoryPlayback,
    endStoryPlayback,
    pauseBackgroundMusic,
    resumeBackgroundMusic,
  }), [
    soundEnabled, musicEnabled, playSound,
    beginStoryPlayback, endStoryPlayback, pauseBackgroundMusic, resumeBackgroundMusic,
  ]);

  return (
    <SoundContext.Provider value={contextValue}>
      {children}
    </SoundContext.Provider>
  );
};
