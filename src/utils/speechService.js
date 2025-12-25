import * as Speech from 'expo-speech';
import { Strings } from '../../constants/Strings';

export const speak = (text, language = 'fr') => {
  const voice = Strings[language]?.voice || 'fr-FR';
  
  Speech.stop();
  Speech.speak(text, {
    language: voice,
    pitch: 1.2, // Slightly higher pitch for child-friendly voice
    rate: 0.9,  // Slightly slower for better comprehension
  });
};

export const stopSpeech = () => {
  Speech.stop();
};

