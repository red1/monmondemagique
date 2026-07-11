import React from 'react';
import { Modal } from 'react-native';
import { usePathname } from 'expo-router';
import { useParentalControl } from '../../../contexts/ParentalControlContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getStrings } from '../../../constants/Strings';
import WarningBanner from './WarningBanner';
import ParentalLockScreen from './ParentalLockScreen';

const WARNING_MS = 30 * 1000;

export default function ParentalLockOverlay() {
  const pathname = usePathname();
  const {
    isLocked, showWarning, remainingMs, session, dismissWarning,
    getStoriesRemaining,
  } = useParentalControl();
  const { language } = useLanguage();
  const t = getStrings(language);

  const formatRemaining = (ms) => {
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  };

  const warningMessage = session?.mode === 'timer'
    ? t.parentalWarningTimer(formatRemaining(remainingMs || WARNING_MS))
    : t.parentalWarningStories(String(getStoriesRemaining() || 1));

  const showGlobalLock = isLocked && pathname !== '/story_player' && pathname !== '/video_player';

  return (
    <>
      <WarningBanner
        visible={showWarning && !isLocked}
        title={t.parentalWarningTitle}
        message={warningMessage}
        onDismiss={dismissWarning}
      />

      <Modal visible={showGlobalLock} animationType="fade">
        <ParentalLockScreen
          title={t.parentalLockTitle}
          message={t.parentalLockDetail}
          hint={t.storiesBedtimeHint}
        />
      </Modal>
    </>
  );
}
