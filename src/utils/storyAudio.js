/** Ensures only one story/song plays at a time across the app. */
let activeStorySound = null;

export async function stopActiveStorySound() {
  if (!activeStorySound) return;
  try {
    await activeStorySound.stopAsync();
    await activeStorySound.unloadAsync();
  } catch (_) { /* ignore */ }
  activeStorySound = null;
}

export function registerStorySound(sound) {
  activeStorySound = sound;
}

export function clearStorySound(sound) {
  if (activeStorySound === sound) activeStorySound = null;
}
