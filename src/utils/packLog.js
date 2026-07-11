export function packLog(step, detail) {
  if (!__DEV__) return;
  const time = new Date().toISOString().slice(11, 19);
  if (detail !== undefined) {
    console.log(`[StoryPack ${time}] ${step}`, detail);
  } else {
    console.log(`[StoryPack ${time}] ${step}`);
  }
}

export function formatBytes(n) {
  if (n == null) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
