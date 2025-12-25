import React, { createContext, useState, useContext, useEffect } from 'react';
import { Audio } from 'expo-av';

const SoundContext = createContext();

export const useSounds = () => useContext(SoundContext);

export const SoundProvider = ({ children }) => {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [bgmSound, setBgmSound] = useState(null);

  // Load and play background music
  useEffect(() => {
    let soundObject;
    const loadMusic = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
           require('../assets/music/music.ai.mp3'),
           { isLooping: true, volume: 0.3 }
        );
        soundObject = sound;
        setBgmSound(sound);
        if (musicEnabled) await sound.playAsync();
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
      if (bgmSound) {
        if (musicEnabled) {
          await bgmSound.playAsync();
        } else {
          await bgmSound.pauseAsync();
        }
      }
    };
    toggleMusic();
  }, [musicEnabled, bgmSound]);

  const playSound = async (type) => {
    if (!soundEnabled) return;

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
            // Utiliser click.mp3 (nom du fichier fourni par l'utilisateur)
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
          // Unload after playback to free resources
          sound.setOnPlaybackStatusUpdate(async (status) => {
              if (status.didJustFinish) {
                  await sound.unloadAsync();
              }
          });
      }
    } catch (error) {
      // Fail silently if files are missing
      console.log("Sound error:", error.message);
    }
  };

  return (
    <SoundContext.Provider value={{ 
        soundEnabled, 
        setSoundEnabled, 
        musicEnabled, 
        setMusicEnabled,
        playSound 
    }}>
      {children}
    </SoundContext.Provider>
  );
};
