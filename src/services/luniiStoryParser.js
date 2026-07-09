function normalizeAudioPath(path) {
  if (!path || typeof path !== 'string') return null;
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!/\.(mp3|ogg|wav|m4a)$/i.test(normalized)) return null;
  return normalized;
}

function pickTitle(source, fallback) {
  if (typeof source === 'string' && source.trim()) return source.trim();
  return fallback;
}

function extractAudioFromObject(obj, addEntry) {
  if (!obj || typeof obj !== 'object') return;

  const audio = obj.audio ?? obj.sound ?? obj.media ?? obj.audioFile ?? obj.soundFile;
  if (typeof audio === 'string') {
    addEntry(audio, {
      title: obj.name || obj.label || obj.title,
      type: obj.type,
      stage: obj,
      image: obj.image || obj.picture || obj.thumbnail,
    });
  } else if (audio && typeof audio === 'object') {
    const file = audio.file || audio.path || audio.url || audio.src || audio.name;
    if (file) {
      addEntry(file, {
        title: obj.name || obj.label || obj.title || audio.name || audio.label,
        type: obj.type || audio.type,
        stage: obj,
        image: obj.image || obj.picture || obj.thumbnail || audio.image,
      });
    }
  }
}

function walkValue(value, addEntry, seenObjects = new WeakSet()) {
  if (value == null) return;

  if (typeof value === 'string') {
    const normalized = normalizeAudioPath(value);
    if (normalized) addEntry(normalized, {});
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => walkValue(item, addEntry, seenObjects));
    return;
  }

  if (typeof value !== 'object') return;
  if (seenObjects.has(value)) return;
  seenObjects.add(value);

  extractAudioFromObject(value, addEntry);
  Object.values(value).forEach((child) => walkValue(child, addEntry, seenObjects));
}

/**
 * Collect playable audio entries from any Lunii / STUdio story.json shape.
 * Deduplicates by normalized audio path.
 */
export function collectAudioEntries(storyJson) {
  const entries = [];
  const seen = new Set();

  const addEntry = (audioPath, meta = {}) => {
    const bare = normalizeAudioPath(audioPath);
    if (!bare) return;
    const normalized = resolvePackAudioRelPath(bare).replace(/^\/+/, '');
    if (seen.has(normalized)) return;
    seen.add(normalized);
    entries.push({
      audio: normalized,
      title: meta.title || null,
      type: meta.type || null,
      stage: meta.stage || null,
      image: meta.image || null,
    });
  };

  if (!storyJson || typeof storyJson !== 'object') return entries;

  const stages = storyJson.stages;
  if (Array.isArray(stages)) {
    stages.forEach((stage) => extractAudioFromObject(stage, addEntry));
  } else if (stages && typeof stages === 'object') {
    Object.values(stages).forEach((stage) => extractAudioFromObject(stage, addEntry));
  }

  const nodes = storyJson.nodes;
  if (Array.isArray(nodes)) {
    nodes.forEach((node) => extractAudioFromObject(node, addEntry));
  } else if (nodes && typeof nodes === 'object') {
    Object.values(nodes).forEach((node) => extractAudioFromObject(node, addEntry));
  }

  if (entries.length === 0) {
    walkValue(storyJson, addEntry);
  }

  return entries;
}

export function audioEntrySuffix(audioPath, index) {
  const base = audioPath.split('/').pop()?.replace(/\.[^.]+$/, '') || String(index);
  const safe = base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return safe || String(index);
}

export function resolvePackAudioRelPath(audioRef) {
  const rel = (audioRef || '').replace(/^\/+/, '');
  if (!rel) return rel;
  if (rel.startsWith('assets/')) return rel;
  return `assets/${rel}`;
}

export function resolvePackAudioUri(basePath, audioRef) {
  return `${basePath}${resolvePackAudioRelPath(audioRef)}`;
}

export function guessContentTypeFromFileSize(bytes) {
  if (bytes > 2 * 1024 * 1024) return 'story';
  if (bytes > 0 && bytes <= 120000) return 'song';
  return 'story';
}
