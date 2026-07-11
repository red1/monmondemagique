import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { megaDownloadAndExtract, cleanupMegaTempFiles, fetchMegaFileSize } from './megaFile';
import { extractMp3CoverArt, extractMp3Tags, saveCoverArt, estimateMp3DurationFromBytes, reconcileDurationMs } from './mp3Metadata';
import {
  audioEntrySuffix,
  collectAudioEntries,
  guessContentTypeFromFileSize,
  resolvePackAudioRelPath,
  resolvePackAudioUri,
} from './luniiStoryParser';
import {
  streamUnzipFromFile,
  yieldToEventLoop,
  setExtractionFastMode,
} from './zipExtract';
import { isNativeZipAvailable, nativeUnzipToDirectory } from './nativeZip';
import catalogData from '../../assets/stories/catalog.json';
import {
  mergeSharedMp3IntoMetaAsync, notifySharedMediaUpdated, scanDownloadsFolder,
} from './sharedMediaService';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

const STORIES_DIR = `${FileSystem.documentDirectory}stories/`;
const LIBRARY_INDEX_PATH = `${STORIES_DIR}library-index.json`;
const STORIES_META_KEY = 'STORIES_META';
const PACKAGES_META_KEY = 'STORIES_PACKAGES_META';
const PROGRESS_KEY = 'STORIES_PROGRESS';
const SAVED_PLAYLISTS_KEY = 'STORIES_SAVED_PLAYLISTS';
const PACK_USAGE_KEY = 'STORIES_PACK_USAGE';
const PACK_SIZES_KEY = 'STORIES_PACK_SIZES';

export const MIN_PLAYABLE_DURATION_MS = 30000;

export function filterAudioTracks(tracks = [], { strict = false } = {}) {
  return tracks.filter((track) => {
    const dur = track?.durationMs || 0;
    if (dur <= 0) return true;
    if (dur >= MIN_PLAYABLE_DURATION_MS) return true;
    return !strict;
  });
}

const libraryListeners = new Set();
const sizeMemoryCache = new Map();

export class DownloadCancelledError extends Error {
  constructor() {
    super('Download cancelled');
    this.name = 'DownloadCancelledError';
  }
}

export function subscribeStoriesLibrary(listener) {
  libraryListeners.add(listener);
  return () => libraryListeners.delete(listener);
}

let libraryNotifyTimer = null;
let libraryBulkUpdateDepth = 0;

export function notifyStoriesLibraryUpdated() {
  if (libraryBulkUpdateDepth > 0) return;
  if (libraryNotifyTimer) clearTimeout(libraryNotifyTimer);
  const debounceMs = activeDownloadCount > 0 ? 5000 : 300;
  libraryNotifyTimer = setTimeout(() => {
    libraryNotifyTimer = null;
    const runListeners = () => {
      libraryListeners.forEach((listener) => {
        try { listener(); } catch (_) { /* ignore */ }
      });
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(runListeners);
    } else {
      runListeners();
    }
  }, debounceMs);
}

function beginBulkLibraryUpdate() {
  libraryBulkUpdateDepth += 1;
}

function endBulkLibraryUpdate() {
  libraryBulkUpdateDepth = Math.max(0, libraryBulkUpdateDepth - 1);
  if (libraryBulkUpdateDepth === 0) notifyStoriesLibraryUpdated();
}

export function createDownloadControl() {
  const control = {
    aborted: false,
    resumable: null,
    phase: 'preparing',
    canPause() {
      return !!this.resumable && this.phase === 'downloading';
    },
    setResumable(resumable) {
      this.resumable = resumable;
    },
    setPhase(phase) {
      this.phase = phase;
    },
    checkAborted() {
      if (this.aborted) throw new DownloadCancelledError();
    },
    async cancel() {
      this.aborted = true;
      if (this.resumable) {
        try { await this.resumable.cancelAsync(); } catch (_) { /* ignore */ }
      }
    },
    async pause() {
      if (!this.canPause()) return false;
      try {
        await this.resumable.pauseAsync();
        this.phase = 'paused';
        return true;
      } catch (_) {
        return false;
      }
    },
    async resume() {
      if (!this.resumable || this.phase !== 'paused') return false;
      try {
        await this.resumable.resumeAsync();
        this.phase = 'downloading';
        return true;
      } catch (_) {
        return false;
      }
    },
  };
  return control;
}

const catalog = catalogData;
const packByIdMap = new Map((catalog.stories || []).map((p) => [p.id, p]));
const sourceByIdMap = new Map((catalog.sources || []).map((s) => [s.id, s]));

let storiesMetaCache = null;
let packagesMetaCache = null;
let libraryIndexUpdatedAt = 0;
let activeDownloadCount = 0;
const LIBRARY_FRESH_MS = 5 * 60 * 1000;

export function getPackById(packId) {
  return packByIdMap.get(packId) || null;
}

export function getSourceById(sourceId) {
  return sourceByIdMap.get(sourceId) || null;
}

export function beginActiveDownload() {
  activeDownloadCount += 1;
  if (activeDownloadCount === 1) setExtractionFastMode(true);
}

export function endActiveDownload() {
  activeDownloadCount = Math.max(0, activeDownloadCount - 1);
  if (activeDownloadCount === 0) {
    setExtractionFastMode(false);
    flushDeferredLibraryIndex().catch(() => {});
  }
}

export function isActiveDownloadInProgress() {
  return activeDownloadCount > 0;
}

function invalidateStoriesMetaCache() {
  storiesMetaCache = null;
}

function invalidatePackagesMetaCache() {
  packagesMetaCache = null;
}

export function getCatalog() {
  return catalog;
}

export function getSources() {
  return catalog.sources || [];
}

export function getAllPackages() {
  return catalog.stories || [];
}

/** @deprecated use getAllPackages */
export function getAllStories() {
  return getAllPackages();
}

async function ensureStoriesDir() {
  const info = await FileSystem.getInfoAsync(STORIES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(STORIES_DIR, { intermediates: true });
  }
}

async function loadLibraryIndex() {
  try {
    const info = await FileSystem.getInfoAsync(LIBRARY_INDEX_PATH);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(LIBRARY_INDEX_PATH);
    const parsed = JSON.parse(raw);
    return parsed?.stories && typeof parsed.stories === 'object' ? parsed.stories : null;
  } catch (_) {
    return null;
  }
}

let libraryIndexDirty = false;

async function saveLibraryIndex(meta) {
  await ensureStoriesDir();
  await FileSystem.writeAsStringAsync(
    LIBRARY_INDEX_PATH,
    JSON.stringify({ version: 1, updatedAt: Date.now(), stories: meta }),
  );
}

async function loadStoriesMeta({ force = false } = {}) {
  if (!force && storiesMetaCache) return storiesMetaCache;

  const fromIndex = await loadLibraryIndex();
  if (fromIndex && Object.keys(fromIndex).length > 0) {
    storiesMetaCache = fromIndex;
    return fromIndex;
  }

  const raw = await AsyncStorage.getItem(STORIES_META_KEY);
  const meta = raw ? JSON.parse(raw) : {};
  if (Object.keys(meta).length > 0) await saveStoriesMeta(meta);
  else storiesMetaCache = meta;
  return meta;
}

async function saveStoriesMeta(meta) {
  storiesMetaCache = meta;
  libraryIndexUpdatedAt = Date.now();
  if (activeDownloadCount > 0) await yieldToEventLoop();
  const serialized = JSON.stringify(meta);
  if (activeDownloadCount > 0) await yieldToEventLoop();
  await AsyncStorage.setItem(STORIES_META_KEY, serialized);
  if (activeDownloadCount > 0) {
    libraryIndexDirty = true;
  } else {
    await saveLibraryIndex(meta);
  }
}

async function flushDeferredLibraryIndex() {
  if (!libraryIndexDirty || !storiesMetaCache) return;
  libraryIndexDirty = false;
  await yieldToEventLoop();
  await saveLibraryIndex(storiesMetaCache);
}

async function loadPackagesMeta() {
  if (packagesMetaCache) return packagesMetaCache;
  const raw = await AsyncStorage.getItem(PACKAGES_META_KEY);
  packagesMetaCache = raw ? JSON.parse(raw) : {};
  return packagesMetaCache;
}

async function savePackagesMeta(meta) {
  packagesMetaCache = meta;
  await AsyncStorage.setItem(PACKAGES_META_KEY, JSON.stringify(meta));
}

let metaWriteQueue = Promise.resolve();

function withMetaLock(task) {
  const run = metaWriteQueue.then(task, task);
  metaWriteQueue = run.catch(() => {});
  return run;
}

export async function getDownloadedStories({ force = false } = {}) {
  const meta = await loadStoriesMeta({ force });
  return mergeSharedMp3IntoMetaAsync(meta, {
    force,
    skipScan: isActiveDownloadInProgress(),
  });
}

export async function getPlayableStories({ syncOnLoad = false } = {}) {
  await migrateLegacyMeta();
  const metaIsFresh = storiesMetaCache && Date.now() - libraryIndexUpdatedAt < LIBRARY_FRESH_MS;
  if (syncOnLoad && !isActiveDownloadInProgress()) {
    await rebuildLibraryFromDisk({ incremental: false });
  } else if (!metaIsFresh) {
    scheduleBackgroundLibrarySync();
  }
  if (!metaIsFresh) {
    scheduleBackgroundMp3Enrich();
  }
  const meta = await mergeSharedMp3IntoMetaAsync(await loadStoriesMeta());
  return Object.values(meta).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

let backgroundSyncTimer = null;
let syncInFlight = false;
let backgroundEnrichTimer = null;
let backgroundEnrichRounds = 0;
const MAX_BACKGROUND_ENRICH_ROUNDS = 20;

function scheduleBackgroundLibrarySync() {
  if (backgroundSyncTimer || syncInFlight) return;
  if (isActiveDownloadInProgress()) return;
  if (storiesMetaCache && Date.now() - libraryIndexUpdatedAt < LIBRARY_FRESH_MS) return;
  backgroundSyncTimer = setTimeout(async () => {
    backgroundSyncTimer = null;
    syncInFlight = true;
    try {
      const synced = await rebuildLibraryFromDisk({ incremental: true });
      if (synced > 0) notifyStoriesLibraryUpdated();
    } catch (_) { /* ignore */ }
    finally {
      syncInFlight = false;
    }
  }, 400);
}

function isRemoteMediaUri(uri) {
  return typeof uri === 'string' && /^https?:\/\//i.test(uri);
}

async function shouldRepairThumbnail(story) {
  if (!story?.localPath || !story?.packId) return false;
  if (!story.thumbnail) return true;
  if (isRemoteMediaUri(story.thumbnail)) return true;
  try {
    const info = await FileSystem.getInfoAsync(story.thumbnail);
    return !info.exists;
  } catch (_) {
    return true;
  }
}

async function repairStoryThumbnails({ limit = 30 } = {}) {
  const meta = await loadStoriesMeta();
  let changed = false;
  let processed = 0;

  for (const [storyId, story] of Object.entries(meta)) {
    if (processed >= limit) break;
    if (!(await shouldRepairThumbnail(story))) continue;

    const pack = getPackById(story.packId);
    if (!pack) continue;

    processed += 1;
    try {
      const thumb = await resolveStoryThumbnail(story, story.localPath, pack);
      if (thumb && thumb !== story.thumbnail) {
        meta[storyId] = { ...story, thumbnail: thumb };
        changed = true;
      }
    } catch (_) { /* ignore */ }
  }

  if (changed) await saveStoriesMeta(meta);
  return { changed };
}

export async function repairStoryThumbnailsForLibrary({ limit = 40 } = {}) {
  if (isActiveDownloadInProgress()) return { changed: false };
  return repairStoryThumbnails({ limit });
}

function scheduleBackgroundMp3Enrich() {
  if (backgroundEnrichTimer) return;
  if (isActiveDownloadInProgress()) return;
  if (backgroundEnrichRounds >= MAX_BACKGROUND_ENRICH_ROUNDS) return;
  backgroundEnrichTimer = setTimeout(async () => {
    backgroundEnrichTimer = null;
    backgroundEnrichRounds += 1;
    try {
      const { changed: thumbsChanged } = await repairStoryThumbnails({ limit: 30 });
      const { durationValuesChanged } = await enrichStoriesDurations({ limit: 30 });
      const { metadataChanged } = await enrichStoriesWithMp3Metadata({ limit: 20 });
      if (thumbsChanged || durationValuesChanged || metadataChanged) notifyStoriesLibraryUpdated();
      if ((durationValuesChanged || metadataChanged) && backgroundEnrichRounds < MAX_BACKGROUND_ENRICH_ROUNDS) {
        scheduleBackgroundMp3Enrich();
      }
    } catch (_) { /* ignore */ }
  }, 1200);
}

/** @deprecated use rebuildLibraryFromDisk */
export async function syncLibraryFromDisk() {
  return rebuildLibraryFromDisk({ incremental: true });
}

export async function rebuildLibraryFromDisk({ incremental = false } = {}) {
  if (isActiveDownloadInProgress()) return 0;
  await ensureStoriesDir();
  if (!incremental) {
    await saveStoriesMeta({});
  }
  let dirs = [];
  try {
    dirs = await FileSystem.readDirectoryAsync(STORIES_DIR);
  } catch (_) {
    return 0;
  }

  const catalogIds = new Set(getAllPackages().map((pack) => pack.id));
  const meta = incremental ? await loadStoriesMeta() : {};
  const packsWithValidStories = new Set();

  if (incremental) {
    for (const story of Object.values(meta)) {
      if (!story.packId) continue;
      if (await isStoryAudioValid(story)) packsWithValidStories.add(story.packId);
    }
  }

  let synced = 0;
  beginBulkLibraryUpdate();
  try {
    for (const packId of dirs) {
      if (!catalogIds.has(packId)) continue;
      if (incremental && packsWithValidStories.has(packId)) continue;

      const pack = getAllPackages().find((p) => p.id === packId);
      if (!pack) continue;

      const packDir = `${STORIES_DIR}${packId}/`;
      const dirInfo = await FileSystem.getInfoAsync(packDir);
      if (!dirInfo.exists) continue;

      const result = await trySavePartialPack(packId, pack, packDir, { partial: false, fast: true });
      if (result?.stories?.length) synced += result.stories.length;
    }

    // Fresh extractions already resolve durations in finalizeExtractedStories.
    if (incremental && synced === 0) {
      await enrichStoriesDurations({ limit: 200 });
    }

    await scanDownloadsFolder({ force: true });
    notifySharedMediaUpdated();
  } finally {
    endBulkLibraryUpdate();
  }

  if (synced > 0) packLog('Library rebuilt from disk', { stories: synced, incremental });
  return synced;
}

/** Concatenated searchable text from title, tags, notes, etc. */
export function buildStoryInfoText(story) {
  return [
    story.title,
    story.packTitle,
    story.artist,
    story.album,
    story.genre,
    story.extraInfo,
    story.contentType === 'song' ? 'chanson song musique' : story.contentType === 'story' ? 'histoire story' : '',
  ].filter(Boolean).join(' ').trim();
}

function applyStoryInfoText(story) {
  return { ...story, infoText: buildStoryInfoText(story) };
}

export async function saveStoryExtraInfo(storyId, extraInfo) {
  const meta = await loadStoriesMeta();
  if (!meta[storyId]) return false;
  meta[storyId] = applyStoryInfoText({
    ...meta[storyId],
    extraInfo: (extraInfo || '').trim(),
  });
  await saveStoriesMeta(meta);
  notifyStoriesLibraryUpdated();
  return true;
}

/** Manual enrichment: MP3 tags, durations, thumbnails, infoText index. */
export async function enrichStoriesLibrary({ limit = 80 } = {}) {
  await enrichStoriesMeta();
  const { durationValuesChanged } = await enrichStoriesDurations({ limit });
  const { metadataChanged } = await enrichStoriesWithMp3Metadata({ limit: Math.min(limit, 60) });

  const meta = await loadStoriesMeta();
  let infoChanged = false;
  let enrichedCount = 0;
  for (const [storyId, story] of Object.entries(meta)) {
    const updated = applyStoryInfoText(story);
    if (updated.infoText !== story.infoText) {
      meta[storyId] = updated;
      infoChanged = true;
    }
    if (story.artist || story.album || story.genre || story.extraInfo || story.durationMs) {
      enrichedCount += 1;
    }
  }
  if (infoChanged) await saveStoriesMeta(meta);

  const changed = durationValuesChanged || metadataChanged || infoChanged;
  if (changed) notifyStoriesLibraryUpdated();
  return { changed, enrichedCount, total: Object.keys(meta).length };
}

export function getStoryFilterOptions(stories = [], packUsageCounts = {}) {
  const artists = new Set();
  const albums = new Set();
  const genres = new Set();
  const packMap = new Map();

  stories.forEach((story) => {
    if (story.artist) artists.add(story.artist);
    if (story.album) albums.add(story.album);
    if (story.genre) genres.add(story.genre);
    if (story.packId) {
      const prev = packMap.get(story.packId);
      if (prev) prev.storyCount += 1;
      else {
        packMap.set(story.packId, {
          packId: story.packId,
          title: story.packTitle || story.packId,
          storyCount: 1,
        });
      }
    }
  });

  const sortAlpha = (a, b) => a.localeCompare(b);
  const packs = [...packMap.values()].sort((a, b) => {
    const usageDiff = (packUsageCounts[b.packId] || 0) - (packUsageCounts[a.packId] || 0);
    if (usageDiff !== 0) return usageDiff;
    return a.title.localeCompare(b.title);
  });

  return {
    artists: [...artists].sort(sortAlpha),
    albums: [...albums].sort(sortAlpha),
    genres: [...genres].sort(sortAlpha),
    packs,
  };
}

export async function getPackUsageCounts() {
  try {
    const raw = await AsyncStorage.getItem(PACK_USAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

export async function recordPackUsage(packId) {
  if (!packId) return;
  const counts = await getPackUsageCounts();
  counts[packId] = (counts[packId] || 0) + 1;
  await AsyncStorage.setItem(PACK_USAGE_KEY, JSON.stringify(counts));
}

export function getStoryDurationMinutes(story) {
  const ms = getStoryDurationMs(story);
  return ms != null ? ms / 60000 : null;
}

export function getStoryDurationMs(story) {
  if (story?.durationMs > 0) return story.durationMs;
  if (story?.durationMinutes > 0) return story.durationMinutes * 60000;
  const fromTracks = (story?.audioTracks || []).reduce((sum, track) => sum + (track.durationMs || 0), 0);
  return fromTracks > 0 ? fromTracks : null;
}

export function formatStoryDurationLabel(story) {
  const ms = getStoryDurationMs(story);
  if (ms == null || ms <= 0) return null;
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))} s`;
  return `${Math.max(1, Math.round(ms / 60000))} min`;
}

function applyStoryDurations(story) {
  const totalMs = (story.audioTracks || []).reduce((sum, track) => sum + (track.durationMs || 0), 0);
  if (totalMs > 0) {
    story.durationMs = totalMs;
    story.durationMinutes = totalMs >= 60000 ? Math.ceil(totalMs / 60000) : null;
  }
  return story;
}

async function resolveTrackDurationMs(track, packDir = null) {
  const uri = track?.uri;
  if (!uri && !packDir) return 0;
  try {
    const file = await resolveAudioFileInfo(track, packDir);
    return quickTrackDurationMs({ ...track, uri: file.uri || uri }, file.size, {
      exists: file.exists,
      context: 'resolveTrackDurationMs',
    });
  } catch (_) { /* ignore */ }
  return track?.durationMs || 0;
}

function quickTrackDurationMs(track, fileSize, logContext = null) {
  const declaredMs = track?.durationMs || 0;
  let finalMs = declaredMs;
  let estimatedMs = 0;
  let reconciledMs = 0;

  if (fileSize > 0) {
    reconciledMs = reconcileDurationMs(declaredMs, fileSize, 0, MIN_PLAYABLE_DURATION_MS);
    estimatedMs = estimateMp3DurationFromBytes(fileSize) || 0;
    if (reconciledMs >= MIN_PLAYABLE_DURATION_MS) finalMs = reconciledMs;
    else if (estimatedMs >= MIN_PLAYABLE_DURATION_MS) finalMs = estimatedMs;
    else if (reconciledMs > 0) finalMs = reconciledMs;
    else if (estimatedMs > 0) finalMs = estimatedMs;
  }

  if (logContext?.log && __DEV__) {
    const payload = {
      storyId: logContext.storyId,
      title: logContext.title,
      durationMs: finalMs,
      declaredMs,
      reconciledMs,
      estimatedMs,
      estimatedSec: estimatedMs ? Math.round(estimatedMs / 1000) : null,
      fileSizeBytes: fileSize,
      fileSize: formatBytes(fileSize),
      exists: logContext.exists ?? fileSize > 0,
      uri: track?.uri?.replace(/^.*\/stories\//, 'stories/'),
      track: track?.name,
      keptInLibrary: true,
    };

    if (finalMs > 0 && finalMs < MIN_PLAYABLE_DURATION_MS) {
      packLog('Skip short audio', payload);
    } else if (!payload.exists) {
      packLog('Audio file missing', payload);
    } else if (fileSize > 500_000 && declaredMs > 0 && declaredMs < MIN_PLAYABLE_DURATION_MS) {
      packLog('Duration reconciled from file size', payload);
    }
  }

  return finalMs;
}

async function resolveAudioFileInfo(track, packDir) {
  const candidates = [];
  if (track?.uri) candidates.push(track.uri);
  const name = track?.name;
  if (name && packDir) {
    if (name.includes('/')) candidates.push(`${packDir}${name.replace(/^\/+/, '')}`);
    candidates.push(`${packDir}assets/${name.replace(/^.*\//, '')}`);
    candidates.push(`${packDir}${resolvePackAudioRelPath(name)}`);
  }
  const seen = new Set();
  for (const uri of candidates) {
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      if (info.exists && info.size > 0) return { uri, exists: true, size: info.size || 0 };
    } catch (_) { /* try next */ }
  }
  return { uri: track?.uri, exists: false, size: 0 };
}

/** Log file sizes + duration resolution for stories (dev console). */
export async function debugLogLibraryFileSizes() {
  if (!__DEV__) return;
  const meta = await loadStoriesMeta();
  packLog('=== Library file size audit ===', { count: Object.keys(meta).length });
  for (const story of Object.values(meta)) {
    const track = story.audioTracks?.[0];
    if (!track) continue;
    const file = await resolveAudioFileInfo(track, story.localPath);
    quickTrackDurationMs(
      { ...track, durationMs: track.durationMs, uri: file.uri },
      file.size,
      { storyId: story.storyId || story.id, title: story.title, exists: file.exists, log: true },
    );
  }
}

async function ensureStoryDurations(story) {
  for (const track of story.audioTracks || []) {
    if (!track?.uri && !story.localPath) continue;
    try {
      const file = await resolveAudioFileInfo(track, story.localPath);
      if (file.uri && file.uri !== track.uri) track.uri = file.uri;
      const dur = quickTrackDurationMs(track, file.size, {
        storyId: story.storyId,
        title: story.title,
        exists: file.exists,
        context: 'ensureStoryDurations',
      });
      if (dur > 0) track.durationMs = dur;
    } catch (_) { /* ignore */ }
  }
  return applyStoryDurations(story);
}

async function enrichStoryDurations(story) {
  return ensureStoryDurations(story);
}

function storyNeedsDurationRepair(story) {
  const tracks = story.audioTracks || [];
  if (!tracks.length || !tracks.some((t) => t.uri)) return false;
  if (story.durationChecked && story.durationMs > 0 && story.durationMs < MIN_PLAYABLE_DURATION_MS) {
    return false;
  }
  const hasPlausibleDuration = story.durationMs >= MIN_PLAYABLE_DURATION_MS
    && tracks.every((t) => !t.durationMs || t.durationMs >= MIN_PLAYABLE_DURATION_MS);
  return !hasPlausibleDuration;
}

async function enrichStoriesDurations({ limit = 40 } = {}) {
  const meta = await loadStoriesMeta();
  let metaChanged = false;
  let durationValuesChanged = false;
  let processed = 0;

  const entries = Object.entries(meta).sort(([, a], [, b]) => {
    const aSusp = storyNeedsDurationRepair(a) ? 0 : 1;
    const bSusp = storyNeedsDurationRepair(b) ? 0 : 1;
    return aSusp - bSusp;
  });

  for (const [storyId, story] of entries) {
    if (processed >= limit) break;
    const tracks = story.audioTracks || [];
    if (!tracks.length || !tracks.some((t) => t.uri)) continue;

    const hasPlausibleDuration = story.durationMs >= MIN_PLAYABLE_DURATION_MS
      && tracks.every((t) => !t.durationMs || t.durationMs >= MIN_PLAYABLE_DURATION_MS);
    if (hasPlausibleDuration) {
      const before = story.durationMs;
      applyStoryDurations(story);
      if (story.durationMs !== before) {
        meta[storyId] = story;
        metaChanged = true;
        durationValuesChanged = true;
      }
      continue;
    }

    if (!storyNeedsDurationRepair(story)) continue;

    processed += 1;
    const beforeMs = story.durationMs;
    const beforeTrackMs = tracks.map((t) => t.durationMs);
    story.storyId = story.storyId || storyId;
    await enrichStoryDurations(story);

    const durationChanged = story.durationMs !== beforeMs
      || tracks.some((t, idx) => t.durationMs !== beforeTrackMs[idx]);
    if (durationChanged) {
      meta[storyId] = story;
      metaChanged = true;
      durationValuesChanged = true;
      continue;
    }

    if (story.durationMs > 0 && story.durationMs < MIN_PLAYABLE_DURATION_MS && !story.durationChecked) {
      story.durationChecked = true;
      meta[storyId] = story;
      metaChanged = true;
    }
  }

  if (metaChanged) await saveStoriesMeta(meta);
  return { changed: metaChanged, durationValuesChanged };
}

async function migrateLegacyMeta() {
  const storiesMeta = await loadStoriesMeta();
  const packagesMeta = await loadPackagesMeta();
  let changed = false;

  for (const [key, entry] of Object.entries({ ...storiesMeta })) {
    if (key.includes('::') || !entry?.localPath) continue;

    const storyJsonPath = `${entry.localPath}story.json`;
    const info = await FileSystem.getInfoAsync(storyJsonPath);
    if (!info.exists) continue;

    const pack = getAllPackages().find((p) => p.id === key);
    if (!pack) continue;

    try {
      const storyJson = JSON.parse(await FileSystem.readAsStringAsync(storyJsonPath));
      const extracted = await extractPlayableStoriesFromPack(storyJson, entry.localPath, pack);
      if (!extracted.length) continue;

      delete storiesMeta[key];
      extracted.forEach((story) => { storiesMeta[story.storyId] = story; });
      packagesMeta[key] = {
        packId: key,
        title: pack.title,
        thumbnail: pack.thumbnail,
        source: pack.source,
        localPath: entry.localPath,
        storyCount: extracted.length,
        downloadedAt: entry.downloadedAt || Date.now(),
      };
      changed = true;
    } catch (_) { /* ignore */ }
  }

  if (changed) {
    await saveStoriesMeta(storiesMeta);
    await savePackagesMeta(packagesMeta);
  }
}

export async function isPackageDownloaded(packId) {
  const packages = await loadPackagesMeta();
  return !!packages[packId]?.localPath;
}

export async function isStoryDownloaded(storyId) {
  const meta = await loadStoriesMeta();
  return !!meta[storyId]?.localPath;
}

export function filterPackages({ name = '', source = '' } = {}) {
  const query = name.trim().toLowerCase();
  return getAllPackages().filter((pack) => {
    if (source && pack.source !== source) return false;
    if (query && !pack.title.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function filterPlayableStories({
  name = '', source = '', contentType = '', artist = '', album = '', genre = '', packId = '',
  maxDurationMinutes = null,
  minDurationSeconds = null,
  maxDurationSeconds = null,
  includeUnknownDuration = true,
  stories = [],
} = {}) {
  const query = name.trim().toLowerCase();
  const artistQuery = artist.trim().toLowerCase();
  return stories.filter((story) => {
    if (packId && story.packId !== packId) return false;
    if (source && story.source !== source) return false;
    if (contentType && story.contentType !== contentType) return false;
    if (genre && story.genre !== genre) return false;
    if (album && story.album !== album) return false;
    if (artistQuery && !(story.artist || '').toLowerCase().includes(artistQuery)) return false;
    if (query) {
      const haystack = (
        story.infoText
        || buildStoryInfoText(story)
      ).toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    const durationMs = getStoryDurationMs(story);
    const durationMin = durationMs != null ? durationMs / 60000 : null;

    if (minDurationSeconds != null && minDurationSeconds > 0) {
      if (durationMs == null || durationMs <= 0) {
        if (!includeUnknownDuration) return false;
      } else if (durationMs < minDurationSeconds * 1000) {
        return false;
      }
    }

    if (maxDurationSeconds != null && maxDurationSeconds > 0) {
      if (durationMs == null || durationMs <= 0) return false;
      if (durationMs >= maxDurationSeconds * 1000) return false;
    }

    if (maxDurationMinutes != null && maxDurationMinutes > 0) {
      if (durationMin == null || durationMin > maxDurationMinutes) return false;
    }
    return true;
  });
}

/** @deprecated use filterPlayableStories */
export function filterStories(opts = {}) {
  return filterPackages(opts);
}

const SONG_STAGE_TYPES = new Set(['music', 'song', 'chanson', 'sound', 'sfx']);
const STORY_STAGE_TYPES = new Set(['story', 'histoire']);

export function classifyStageContentType(stage) {
  const type = (stage.type || '').toLowerCase();
  if (STORY_STAGE_TYPES.has(type) || stage.episode != null) return 'story';
  if (SONG_STAGE_TYPES.has(type)) return 'song';

  const name = (stage.name || '').toLowerCase();
  if (/\b(chanson|chansons|song|musique|music)\b/.test(name)) return 'song';
  if (/\b(histoire|histoires|story|épisode|episode)\b/.test(name)) return 'story';

  const duration = stage.duration || 0;
  const pause = stage.controlSettings?.pause === true;
  const wheel = stage.controlSettings?.wheel === true;

  if (duration > 0 && duration <= 120000 && wheel && !pause) return 'song';
  if (duration > 180000 || (pause && !wheel)) return 'story';
  if (duration > 0 && duration <= 90000) return 'song';
  return 'story';
}

function stageImageUri(stage, basePath) {
  if (!stage?.image) return null;
  return `${basePath}${stage.image}`;
}

async function resolveStoryThumbnail(story, packDir, pack) {
  const stageImage = story.stageImage;
  if (stageImage) {
    const stageInfo = await FileSystem.getInfoAsync(stageImage);
    if (stageInfo.exists) return stageImage;
  }

  const packThumb = `${packDir}thumbnail.png`;
  const packThumbInfo = await FileSystem.getInfoAsync(packThumb);
  if (packThumbInfo.exists) return packThumb;

  const safeId = story.storyId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cachedCover = `${packDir}.covers/${safeId}.jpg`;
  const cachedInfo = await FileSystem.getInfoAsync(cachedCover);
  if (cachedInfo.exists) return cachedCover;

  const audioUri = story.audioTracks?.[0]?.uri;
  if (audioUri) {
    const imageBytes = await extractMp3CoverArt(audioUri);
    if (imageBytes) {
      return saveCoverArt(`${packDir}.covers/`, `${safeId}.jpg`, imageBytes);
    }
  }

  return pack.thumbnail || null;
}

async function enrichStoriesMeta() {
  const meta = await loadStoriesMeta();
  const packIds = [...new Set(Object.values(meta).map((story) => story.packId).filter(Boolean))];
  let changed = false;

  for (const packId of packIds) {
    const packStories = Object.values(meta).filter((story) => story.packId === packId);
    const needsEnrich = packStories.some((story) => !story.contentType);
    if (!needsEnrich) continue;

    const pack = getAllPackages().find((p) => p.id === packId);
    const localPath = packStories[0]?.localPath;
    if (!pack || !localPath) continue;

    const storyJsonPath = `${localPath}story.json`;
    const jsonInfo = await FileSystem.getInfoAsync(storyJsonPath);
    if (!jsonInfo.exists) continue;

    try {
      const storyJson = JSON.parse(await FileSystem.readAsStringAsync(storyJsonPath));
      const extracted = await extractPlayableStoriesFromPack(storyJson, localPath, pack, { fast: true });
      const extractedIds = new Set(extracted.map((item) => item.storyId));

      for (const key of Object.keys(meta)) {
        if (meta[key].packId !== packId) continue;
        if (extractedIds.has(key)) continue;
        if (await isStoryAudioValid(meta[key])) continue;
        delete meta[key];
      }

      for (const item of extracted) {
        const existing = meta[item.storyId];
        const thumbnail = await resolveStoryThumbnail(item, localPath, pack);
        meta[item.storyId] = {
          ...existing,
          ...item,
          thumbnail,
          downloadedAt: existing?.downloadedAt || item.downloadedAt,
        };
        changed = true;
      }
    } catch (_) { /* ignore corrupt pack */ }
  }

  if (changed) await saveStoriesMeta(meta);
}

async function enrichStoriesWithMp3Metadata({ limit = 20 } = {}) {
  const meta = await loadStoriesMeta();
  let metadataChanged = false;
  let processed = 0;

  for (const [storyId, story] of Object.entries(meta)) {
    if (processed >= limit) break;
    const needsTags = !story.thumbnail || isRemoteMediaUri(story.thumbnail) || !story.artist || !story.album || !story.genre
      || !story.durationMs
      || (story.title && /^[a-f0-9]{20,}/i.test(story.title));
    if (!needsTags) continue;

    const audioUri = story.audioTracks?.[0]?.uri;
    if (!audioUri) continue;

    processed += 1;
    try {
      const before = {
        title: story.title,
        artist: story.artist,
        album: story.album,
        genre: story.genre,
        thumbnail: story.thumbnail,
        durationMs: story.durationMs,
        trackDurationMs: story.audioTracks?.[0]?.durationMs,
      };
      const tags = await extractMp3Tags(audioUri);
      const track = story.audioTracks?.[0];
      if (track) {
        const resolvedDur = await resolveTrackDurationMs({ ...track, durationMs: tags?.durationMs || track.durationMs });
        if (resolvedDur > 0) track.durationMs = resolvedDur;
      }

      const updates = {};
      if (tags?.artist && !story.artist) updates.artist = tags.artist;
      if (tags?.album && !story.album) updates.album = tags.album;
      if (tags?.genre && !story.genre) updates.genre = tags.genre;
      if (tags?.durationMs && !story.durationMs) {
        updates.durationMs = tags.durationMs;
        updates.durationMinutes = tags.durationMs >= 60000 ? Math.ceil(tags.durationMs / 60000) : null;
      }
      if (tags?.title && (!story.title || /^[a-f0-9]{20,}/i.test(story.title) || story.title.includes(' — '))) {
        updates.title = tags.title;
      }
      if (await shouldRepairThumbnail(story)) {
        const pack = getPackById(story.packId);
        if (pack) {
          const thumb = await resolveStoryThumbnail(story, story.localPath, pack);
          if (thumb) updates.thumbnail = thumb;
        }
      }
      if (Object.keys(updates).length || !story.durationMs) {
        const merged = { ...story, ...updates, storyId: story.storyId || storyId };
        await enrichStoryDurations(merged);
        const changed = merged.title !== before.title
          || merged.artist !== before.artist
          || merged.album !== before.album
          || merged.genre !== before.genre
          || merged.thumbnail !== before.thumbnail
          || merged.durationMs !== before.durationMs
          || merged.audioTracks?.[0]?.durationMs !== before.trackDurationMs;
        if (changed) {
          meta[storyId] = applyStoryInfoText(merged);
          metadataChanged = true;
        }
      }
    } catch (_) { /* ignore */ }
  }

  if (metadataChanged) await saveStoriesMeta(meta);
  return { changed: metadataChanged, metadataChanged };
}

function parseLuniiStory(storyJson, basePath) {
  const stages = storyJson.stages || [];
  const audioTracks = [];

  const podcastEpisodes = stages
    .filter((s) => s.type === 'story' && s.episode != null)
    .sort((a, b) => a.episode - b.episode);

  if (podcastEpisodes.length > 0) {
    podcastEpisodes.forEach((stage) => {
      if (stage.audio) {
        audioTracks.push({
          name: stage.name || `Épisode ${stage.episode}`,
          uri: resolvePackAudioUri(basePath, stage.audio),
          durationMs: stage.duration || 0,
        });
      }
    });
  } else {
    stages
      .filter((s) => s.audio && (s.type === 'story' || s.duration > 30000 || (s.controlSettings?.pause === true && !s.controlSettings?.wheel)))
      .forEach((stage) => {
        audioTracks.push({
          name: stage.name || storyJson.title || 'Histoire',
          uri: resolvePackAudioUri(basePath, stage.audio),
          durationMs: stage.duration || 0,
        });
      });
  }

  if (audioTracks.length === 0) {
    stages.filter((s) => s.audio).forEach((stage) => {
      audioTracks.push({
        name: stage.name || 'Partie',
        uri: resolvePackAudioUri(basePath, stage.audio),
        durationMs: stage.duration || 0,
      });
    });
  }

  return filterAudioTracks(audioTracks);
}

function buildStoryItem(pack, basePath, suffix, title, stage, tracks, stageImagePath) {
  const playableTracks = filterAudioTracks(tracks);
  if (!playableTracks.length) return null;
  const durationMs = playableTracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
  return {
    storyId: `${pack.id}::${suffix}`,
    packId: pack.id,
    packTitle: pack.title,
    title,
    thumbnail: null,
    stageImage: stageImagePath || (stage ? stageImageUri(stage, basePath) : null),
    contentType: stage ? classifyStageContentType(stage) : 'story',
    source: pack.source,
    localPath: basePath,
    audioTracks: playableTracks,
    durationMs: durationMs > 0 ? durationMs : undefined,
    durationMinutes: durationMs >= 60000 ? Math.ceil(durationMs / 60000) : null,
    downloadedAt: Date.now(),
  };
}

function extractStoriesFromPack(storyJson, basePath, pack) {
  const entries = normalizeAudioEntries(collectAudioEntries(storyJson));
  const stories = [];

  const podcastEpisodes = entries
    .filter((entry) => entry.stage?.type === 'story' && entry.stage?.episode != null)
    .sort((a, b) => (a.stage.episode || 0) - (b.stage.episode || 0));

  if (podcastEpisodes.length > 0) {
    podcastEpisodes.forEach((entry) => {
      const stage = entry.stage;
      const item = buildStoryItem(
        pack,
        basePath,
        `ep${stage.episode}`,
        pickStoryTitle(entry, stage.name || `${pack.title} — Ép. ${stage.episode}`),
        stage,
        [{
          name: stage.name || `Épisode ${stage.episode}`,
          uri: resolvePackAudioUri(basePath, entry.audio),
          durationMs: stage.duration || 0,
        }],
        entry.image ? `${basePath}${entry.image.replace(/^\/+/, '')}` : null,
      );
      if (item) stories.push(item);
    });
    return stories;
  }

  if (entries.length > 1) {
    entries.forEach((entry, idx) => {
      const stage = entry.stage;
      const item = buildStoryItem(
        pack,
        basePath,
        audioEntrySuffix(entry.audio, idx),
        pickStoryTitle(entry, `${pack.title} ${idx + 1}`),
        stage,
        [{
          name: pickStoryTitle(entry, `Partie ${idx + 1}`),
          uri: resolvePackAudioUri(basePath, entry.audio),
          durationMs: stage?.duration || 0,
        }],
        entry.image ? `${basePath}${entry.image.replace(/^\/+/, '')}` : null,
      );
      if (item) stories.push(item);
    });
    return stories;
  }

  if (entries.length === 1) {
    const entry = entries[0];
    const stage = entry.stage;
    const item = buildStoryItem(
      pack,
      basePath,
      '0',
      pickStoryTitle(entry, storyJson.title || pack.title),
      stage,
      [{
        name: pickStoryTitle(entry, storyJson.title || pack.title),
        uri: resolvePackAudioUri(basePath, entry.audio),
        durationMs: stage?.duration || 0,
      }],
      entry.image ? `${basePath}${entry.image.replace(/^\/+/, '')}` : null,
    );
    if (item) stories.push(item);
    return stories;
  }

  const audioTracks = parseLuniiStory(storyJson, basePath);
  if (audioTracks.length > 1) {
    audioTracks.forEach((track, idx) => {
      const item = buildStoryItem(pack, basePath, String(idx), track.name || `${pack.title} ${idx + 1}`, null, [track]);
      if (item) stories.push(item);
    });
  } else if (audioTracks.length === 1) {
    const item = buildStoryItem(pack, basePath, '0', storyJson.title || pack.title, null, audioTracks);
    if (item) stories.push(item);
  }

  return stories;
}

function pickStoryTitle(entry, fallback) {
  const raw = entry?.title || entry?.stage?.name || entry?.stage?.label || fallback;
  return cleanStoryTitle(raw) || fallback;
}

function cleanStoryTitle(title) {
  if (!title || typeof title !== 'string') return title;
  return title
    .replace(/\s+item$/i, '')
    .replace(/\s+stage node$/i, '')
    .replace(/\.mp3$/i, '')
    .trim();
}

function isJunkStoryEntry(entry) {
  const title = (entry.title || entry.stage?.name || entry.stage?.label || '').trim();
  if (!title) return false;
  const lower = title.toLowerCase();
  if (lower === 'cover node' || lower === 'choisis ton histoire') return true;
  if (/\bstage node$/i.test(title)) return true;
  if (/\bitem$/i.test(title) && entry.stage?.episode == null) return true;
  return false;
}

function scoreStoryEntry(entry) {
  let score = 0;
  const title = entry.title || entry.stage?.name || '';
  if (entry.stage?.episode != null) score += 20;
  if (entry.stage?.type === 'story') score += 10;
  if (title.length > 8 && !/\.mp3\b/i.test(title)) score += 5;
  if (/\bstage node|\bitem$/i.test(title)) score -= 15;
  if (/cover node|choisis ton histoire/i.test(title)) score -= 20;
  return score;
}

function normalizeAudioEntries(entries) {
  const byAudio = new Map();
  for (const entry of entries) {
    if (isJunkStoryEntry(entry)) continue;
    const key = resolvePackAudioRelPath(entry.audio).toLowerCase();
    const score = scoreStoryEntry(entry);
    const prev = byAudio.get(key);
    if (!prev || score > prev.score) byAudio.set(key, { entry, score });
  }
  return [...byAudio.values()].map(({ entry }) => entry);
}

async function extractStoriesFromAssets(packDir, pack) {
  const assetsDir = `${packDir}assets/`;
  const info = await FileSystem.getInfoAsync(assetsDir);
  if (!info.exists) return [];

  const files = await FileSystem.readDirectoryAsync(assetsDir);
  const mp3Files = files.filter((file) => file.toLowerCase().endsWith('.mp3'));
  const withSize = [];

  for (let i = 0; i < mp3Files.length; i += 1) {
    const file = mp3Files[i];
    if (i > 0 && i % 12 === 0) await yieldToEventLoop();
    try {
      const uri = `${assetsDir}${file}`;
      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      if (!fileInfo.exists) continue;
      withSize.push({ file, uri, size: fileInfo.size || 0 });
    } catch (_) { /* skip */ }
  }

  withSize.sort((a, b) => b.size - a.size);

  return withSize.map(({ file, uri, size }, idx) => ({
    storyId: `${pack.id}::asset_${audioEntrySuffix(file, idx)}`,
    packId: pack.id,
    packTitle: pack.title,
    title: `${pack.title} — ${idx + 1}`,
    thumbnail: null,
    stageImage: null,
    contentType: guessContentTypeFromFileSize(size),
    source: pack.source,
    localPath: packDir,
    audioTracks: [{ name: file, uri, durationMs: estimateMp3DurationFromBytes(size) || 0 }],
    durationMinutes: null,
    downloadedAt: Date.now(),
  }));
}

async function finalizeExtractedStories(stories, packDir, pack, { fast = false } = {}) {
  const resolved = [];
  let processed = 0;

  for (const story of stories) {
    try {
      if (fast && processed > 0 && processed % 8 === 0) {
        await yieldToEventLoop();
      }
      processed += 1;

      const track = story.audioTracks?.[0];
      if (!track?.uri && !packDir) continue;

      let file;
      if (fast && track?.uri) {
        try {
          const info = await FileSystem.getInfoAsync(track.uri, { size: true });
          file = info.exists && info.size > 0
            ? { uri: track.uri, exists: true, size: info.size || 0 }
            : { uri: track.uri, exists: false, size: 0 };
        } catch (_) {
          file = { uri: track.uri, exists: false, size: 0 };
        }
      } else {
        file = await resolveAudioFileInfo(track, packDir);
      }
      if (!file.exists) {
        quickTrackDurationMs(track, 0, {
          storyId: story.storyId,
          title: story.title,
          exists: false,
        });
        continue;
      }

      if (file.uri !== track.uri) track.uri = file.uri;
      const dur = quickTrackDurationMs(track, file.size, {
        storyId: story.storyId,
        title: story.title,
        exists: true,
        context: 'finalizeExtractedStories',
      });
      if (dur > 0) track.durationMs = dur;

      applyStoryDurations(story);
      if (fast) {
        story.thumbnail = null;
      } else {
        story.thumbnail = await resolveStoryThumbnail(story, packDir, pack);
      }
      resolved.push(story);
    } catch (_) { /* ignore */ }
  }

  return resolved;
}

async function repairMisclassifiedPackFiles(packDir) {
  const assetsDir = `${packDir}assets/`;
  const info = await FileSystem.getInfoAsync(assetsDir);
  if (!info.exists) return;

  const entries = await FileSystem.readDirectoryAsync(assetsDir);
  await Promise.all(entries.map(async (name) => {
    if (!/\.mp3$/i.test(name)) return;
    const path = `${assetsDir}${name}`;
    try {
      const entryInfo = await FileSystem.getInfoAsync(path);
      if (entryInfo.exists && entryInfo.isDirectory) {
        packLog('Remove misclassified mp3 directory', { path });
        await FileSystem.deleteAsync(path, { idempotent: true });
      }
    } catch (_) { /* ignore */ }
  }));
}

async function extractPlayableStoriesFromPack(storyJson, packDir, pack, { fast = false } = {}) {
  let stories = extractStoriesFromPack(storyJson, packDir, pack);
  let resolved = await finalizeExtractedStories(stories, packDir, pack, { fast });

  if (resolved.length === 0) {
    stories = await extractStoriesFromAssets(packDir, pack);
    resolved = await finalizeExtractedStories(stories, packDir, pack, { fast });
  }

  return resolved;
}

const MEGA_DOWNLOAD_TIMEOUT_MS = 25 * 60 * 1000;

function packLog(step, detail) {
  if (!__DEV__) return;
  const time = new Date().toISOString().slice(11, 19);
  if (detail !== undefined) {
    console.log(`[StoryPack ${time}] ${step}`, detail);
  } else {
    console.log(`[StoryPack ${time}] ${step}`);
  }
}

function formatBytes(n) {
  if (n == null) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export { formatBytes };

async function loadPackSizesCache() {
  const raw = await AsyncStorage.getItem(PACK_SIZES_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function savePackSize(packId, sizeBytes) {
  if (!sizeBytes) return;
  sizeMemoryCache.set(packId, sizeBytes);
  const cache = await loadPackSizesCache();
  cache[packId] = sizeBytes;
  await AsyncStorage.setItem(PACK_SIZES_KEY, JSON.stringify(cache));
}

export async function fetchPackageSize(pack) {
  if (!pack) return null;
  if (pack.sizeBytes) return pack.sizeBytes;
  if (sizeMemoryCache.has(pack.id)) return sizeMemoryCache.get(pack.id);

  const cache = await loadPackSizesCache();
  if (cache[pack.id]) {
    sizeMemoryCache.set(pack.id, cache[pack.id]);
    return cache[pack.id];
  }

  if (pack.downloadUrl?.includes('mega.nz')) {
    try {
      const size = await fetchMegaFileSize(pack.downloadUrl);
      if (size) await savePackSize(pack.id, size);
      return size;
    } catch (_) {
      return null;
    }
  }

  return null;
}

export async function fetchPackageSizes(packs) {
  const sizes = {};
  await Promise.all(
    packs.map(async (pack) => {
      try {
        const size = await fetchPackageSize(pack);
        if (size) sizes[pack.id] = size;
      } catch (_) { /* ignore */ }
    }),
  );
  return sizes;
}

function makeReporter(onProgress) {
  if (!onProgress) return null;
  return (progress, status, extra = {}) => {
    onProgress({
      ...(typeof progress === 'number' ? { progress } : {}),
      status,
      ...extra,
    });
  };
}

function createPartialSaver(packId, pack, packDir, report) {
  let extractedCount = 0;

  return async (fileName) => {
    if (!fileName || !/\.mp3$/i.test(fileName)) return;
    extractedCount += 1;
    if (extractedCount % 4 === 0) {
      report?.(null, 'extracting', { extractedCount });
      await yieldToEventLoop();
    }
  };
}

async function downloadFromMega(url, destDir, report, packId, control, onFileExtracted) {
  packLog('MEGA pipeline start', { packId, destDir });
  try {
    await Promise.race([
      megaDownloadAndExtract(url, destDir, { report, packId, control, onFileExtracted }),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Le téléchargement MEGA a pris trop de temps. Vérifie ta connexion Wi-Fi.')),
          MEGA_DOWNLOAD_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (e) {
    if (e.name === 'DownloadCancelledError') throw e;
    packLog('MEGA pipeline error', { packId, message: e.message });
    throw e;
  }
}

async function downloadFile(url, destPath, report, packId, control) {
  if (url.includes('mega.nz')) {
    const destDir = destPath.substring(0, destPath.lastIndexOf('/') + 1);
    await downloadFromMega(url, destDir, report, packId, control);
    return;
  }
  packLog('HTTP download start', { packId, destPath });
  control?.setPhase?.('downloading');
  report?.(0.02, 'downloading');
  let lastLoggedPct = -1;
  const download = FileSystem.createDownloadResumable(
    url,
    destPath,
    {},
    (progress) => {
      if (control?.aborted) return;
      if (progress.totalBytesExpectedToWrite > 0) {
        const pct = Math.floor((progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100);
        if (pct >= lastLoggedPct + 10 || pct === 100) {
          lastLoggedPct = pct;
          packLog('HTTP download progress', {
            pct: `${pct}%`,
            written: formatBytes(progress.totalBytesWritten),
            total: formatBytes(progress.totalBytesExpectedToWrite),
          });
        }
        report?.(0.02 + (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 0.48, control?.phase === 'paused' ? 'paused' : 'downloading', {
          totalBytes: progress.totalBytesExpectedToWrite,
          bytesWritten: progress.totalBytesWritten,
        });
      }
    },
  );
  control?.setResumable?.(download);
  const result = await download.downloadAsync();
  control?.setResumable?.(null);
  control?.checkAborted?.();
  packLog('HTTP download done', { packId, uri: result?.uri });
}

async function unzipToDirectory(zipPath, destDir, packId, report, control, onFileExtracted) {
  packLog('Unzip start', { packId, zipPath, nativeZip: isNativeZipAvailable() });
  const startedAt = Date.now();

  if (isNativeZipAvailable()) {
    report?.(0.55, 'unzipping');
    const result = await nativeUnzipToDirectory(zipPath, destDir, {
      onProgress: (progress) => {
        report?.(0.55 + progress * 0.35, 'extracting');
      },
    });
    if (result.native) {
      packLog('Native unzip done', { packId, elapsedMs: Date.now() - startedAt });
      return;
    }
    packLog('Native unzip unavailable, using JS stream', { packId });
  }

  setExtractionFastMode(false);
  try {
    await streamUnzipFromFile(zipPath, destDir, {
      control,
      onFileExtracted,
      report: (progress, status, extra) => report?.(progress, status, extra),
      formatBytes,
      log: packLog,
      progressStart: 0.55,
      progressSpan: 0.35,
      fastMode: false,
    });
  } finally {
    setExtractionFastMode(true);
  }
  packLog('Stream unzip done', { packId, elapsedMs: Date.now() - startedAt });
}

async function isStoryAudioValid(story) {
  const uri = story.audioTracks?.[0]?.uri;
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    return info.exists && info.size > 0;
  } catch (_) {
    return false;
  }
}

function getRequiredPackRelPaths(storyJson) {
  const paths = new Set(['story.json']);
  collectAudioEntries(storyJson).forEach((entry) => {
    if (entry.audio) paths.add(entry.audio);
  });
  return [...paths];
}

async function findMissingPackFiles(packDir, requiredPaths) {
  const missing = [];
  for (const rel of requiredPaths) {
    if (rel === 'story.json') continue;
    try {
      const info = await FileSystem.getInfoAsync(`${packDir}${rel}`, { size: true });
      if (!info.exists || !info.size) missing.push(rel);
    } catch (_) {
      missing.push(rel);
    }
  }
  return missing;
}

async function assessPackDir(packDir, pack, { fast = false } = {}) {
  const storyJsonPath = `${packDir}story.json`;
  const jsonInfo = await FileSystem.getInfoAsync(storyJsonPath);
  if (!jsonInfo.exists) {
    const assetStories = await extractStoriesFromAssets(packDir, pack);
    const resolved = await finalizeExtractedStories(assetStories, packDir, pack, { fast });
    return {
      filesComplete: false,
      canExtract: resolved.length > 0,
      missing: resolved.length > 0 ? ['story.json'] : ['story.json', 'assets/*.mp3'],
      stories: resolved,
      storyJson: null,
    };
  }

  let storyJson;
  try {
    storyJson = JSON.parse(await FileSystem.readAsStringAsync(storyJsonPath));
  } catch (_) {
    return {
      filesComplete: false,
      canExtract: false,
      missing: ['story.json (invalid)'],
      stories: [],
      storyJson: null,
    };
  }

  const requiredPaths = getRequiredPackRelPaths(storyJson).map(resolvePackAudioRelPath);
  if (!requiredPaths.includes('story.json')) requiredPaths.unshift('story.json');
  let missing = [];
  if (!fast) {
    missing = await findMissingPackFiles(packDir, requiredPaths);
  }

  if (!fast && requiredPaths.length <= 1) {
    const assetsDir = `${packDir}assets/`;
    const assetsInfo = await FileSystem.getInfoAsync(assetsDir);
    if (!assetsInfo.exists) missing = ['assets/'];
    else {
      const files = await FileSystem.readDirectoryAsync(assetsDir);
      if (!files.some((f) => f.toLowerCase().endsWith('.mp3'))) missing = ['assets/*.mp3'];
      else missing = [];
    }
  }

  const stories = await extractPlayableStoriesFromPack(storyJson, packDir, pack, { fast });
  const filesComplete = missing.length === 0;

  return {
    filesComplete,
    canExtract: stories.length > 0,
    missing,
    stories,
    storyJson,
  };
}

async function mergeValidPackStories(packId, newStories, { fast = false } = {}) {
  const storiesMeta = await loadStoriesMeta();
  const merged = new Map();

  for (const story of Object.values(storiesMeta)) {
    if (story.packId !== packId) continue;
    if (fast) {
      merged.set(story.storyId, story);
    } else if (await isStoryAudioValid(story)) {
      merged.set(story.storyId, story);
    }
  }
  for (const story of newStories) {
    if (fast || await isStoryAudioValid(story)) merged.set(story.storyId, story);
  }

  return [...merged.values()];
}

async function savePackMetadata(packId, pack, packDir, stories, { partial = false, fast = false } = {}) {
  if (fast) await yieldToEventLoop();
  const mergedStories = await mergeValidPackStories(packId, stories, { fast });
  if (!mergedStories.length) return null;

  await withMetaLock(async () => {
    const storiesMeta = await loadStoriesMeta();
    const keepIds = new Set(mergedStories.map((story) => story.storyId));

    Object.keys(storiesMeta).forEach((key) => {
      if (storiesMeta[key].packId === packId && !keepIds.has(key)) {
        delete storiesMeta[key];
      }
    });
    mergedStories.forEach((story) => {
      storiesMeta[story.storyId] = { ...story, partialPack: partial };
    });
    await saveStoriesMeta(storiesMeta);

    const packagesMeta = await loadPackagesMeta();
    packagesMeta[packId] = {
      packId,
      title: pack.title,
      thumbnail: pack.thumbnail,
      source: pack.source,
      localPath: packDir,
      storyCount: mergedStories.length,
      storyTypeCount: mergedStories.filter((s) => s.contentType === 'story').length,
      songTypeCount: mergedStories.filter((s) => s.contentType === 'song').length,
      downloadedAt: packagesMeta[packId]?.downloadedAt || Date.now(),
      partial,
    };
    await savePackagesMeta(packagesMeta);
  });

  notifyStoriesLibraryUpdated();
  const packagesMeta = await loadPackagesMeta();
  return { pack: packagesMeta[packId], stories: mergedStories };
}

async function trySavePartialPack(packId, pack, packDir, { partial = true, fast = false } = {}) {
  const assessment = await assessPackDir(packDir, pack, { fast });
  if (!assessment.canExtract) return null;

  const result = await savePackMetadata(packId, pack, packDir, assessment.stories, {
    partial: partial && !assessment.filesComplete,
    fast,
  });
  if (!result) return null;

  return { ...result, partial: !assessment.filesComplete, missing: assessment.missing };
}

export async function getCatalogInstallStates() {
  const packagesMeta = await loadPackagesMeta();
  const states = {};

  Object.entries(packagesMeta).forEach(([packId, entry]) => {
    states[packId] = entry.partial ? 'partial' : 'complete';
  });

  await ensureStoriesDir();
  let dirs = [];
  try {
    dirs = await FileSystem.readDirectoryAsync(STORIES_DIR);
  } catch (_) { /* ignore */ }

  const catalogIds = new Set(getAllPackages().map((pack) => pack.id));
  await Promise.all(
    dirs
      .filter((dirName) => catalogIds.has(dirName) && !states[dirName])
      .map(async (packId) => {
        states[packId] = await getPackInstallState(packId);
      }),
  );

  return states;
}

export async function getPackInstallState(packId) {
  const packagesMeta = await loadPackagesMeta();
  if (packagesMeta[packId]?.localPath && !packagesMeta[packId]?.partial) {
    return 'complete';
  }

  const pack = getAllPackages().find((p) => p.id === packId);
  const packDir = `${STORIES_DIR}${packId}/`;
  const dirInfo = await FileSystem.getInfoAsync(packDir);
  if (!dirInfo.exists || !pack) return 'none';

  const assessment = await assessPackDir(packDir, pack);
  if (assessment.filesComplete && assessment.canExtract) return 'complete';
  if (assessment.canExtract || assessment.missing.length > 0) return 'partial';
  return 'none';
}

export function downloadPackage(packId, onProgress) {
  const control = createDownloadControl();
  const promise = downloadPackageInternal(packId, onProgress, control);
  return {
    promise,
    cancel: () => control.cancel(),
    pause: () => control.pause(),
    resume: () => control.resume(),
    canPause: () => control.canPause(),
  };
}

async function downloadPackageInternal(packId, onProgress, control) {
  const startedAt = Date.now();
  beginActiveDownload();
  try {
  const pack = getPackById(packId) || getAllPackages().find((p) => p.id === packId);
  if (!pack) throw new Error('Pack introuvable');

  const report = makeReporter(onProgress);

  packLog('Download package start', { packId, title: pack.title, source: pack.source });

  await ensureStoriesDir();
  const packDir = `${STORIES_DIR}${packId}/`;
  const zipPath = `${packDir}pack.zip`;

  control.setPhase('preparing');
  report?.(0.01, 'preparing');
  await FileSystem.makeDirectoryAsync(packDir, { intermediates: true });
  await repairMisclassifiedPackFiles(packDir);
  packLog('Pack directory ready', packDir);

  const onPartialSave = createPartialSaver(packId, pack, packDir, report);

  const isMega = pack.downloadUrl.includes('mega.nz');
  const preCheck = await assessPackDir(packDir, pack, { fast: true });
  if (preCheck.filesComplete && preCheck.canExtract) {
    packLog('Pack files already complete, refreshing metadata only', {
      packId,
      stories: preCheck.stories.length,
    });
    report?.(0.92, 'saving');
    const saved = await savePackMetadata(packId, pack, packDir, preCheck.stories, { partial: false });
    report?.(1, 'saving');
    packLog('Download package complete (metadata refresh)', {
      packId,
      stories: saved.stories.length,
      elapsedMs: Date.now() - startedAt,
    });
    if (isMega) await cleanupMegaTempFiles(packDir);
    return saved;
  }

  if (preCheck.canExtract) {
    packLog('Partial pack detected, keeping valid files', {
      packId,
      existingStories: preCheck.stories.length,
      missing: preCheck.missing,
    });
    await trySavePartialPack(packId, pack, packDir, { partial: true, fast: true });
  }

  try {
    if (isMega) {
      packLog('Using MEGA pipeline', { packId });
      await downloadFromMega(pack.downloadUrl, packDir, (progress, status, extra) => {
        report?.(0.02 + progress * 0.88, status, extra);
      }, packId, control, onPartialSave);
    } else {
      packLog('Using HTTP + unzip pipeline', { packId });
      const zipInfo = await FileSystem.getInfoAsync(zipPath, { size: true });
      if (!zipInfo.exists || !zipInfo.size) {
        await downloadFile(pack.downloadUrl, zipPath, report, packId, control);
      } else {
        packLog('Reusing existing pack.zip', { packId, size: formatBytes(zipInfo.size) });
        report?.(0.5, 'unzipping', { totalBytes: zipInfo.size, bytesWritten: zipInfo.size });
      }
      control.setPhase('extracting');
      await unzipToDirectory(zipPath, packDir, packId, report, control, onPartialSave);
    }

    control.checkAborted();
    report?.(0.92, 'saving');

    const storyJsonPath = `${packDir}story.json`;
    const jsonInfo = await FileSystem.getInfoAsync(storyJsonPath);
    if (!jsonInfo.exists) {
      packLog('Missing story.json', storyJsonPath);
      const partial = await trySavePartialPack(packId, pack, packDir, { fast: true });
      if (partial?.stories?.length) {
        throw new Error(`story.json manquant — ${partial.stories.length} fichier(s) audio conservé(s)`);
      }
      throw new Error('Format non reconnu (story.json manquant)');
    }

    packLog('Parsing story.json…');
    const storyJson = JSON.parse(await FileSystem.readAsStringAsync(storyJsonPath));
    let extractedStories = await extractPlayableStoriesFromPack(storyJson, packDir, pack, { fast: true });

    if (extractedStories.length === 0 && preCheck.stories.length > 0) {
      packLog('Keeping previously extracted stories after failed re-parse', {
        packId,
        count: preCheck.stories.length,
      });
      extractedStories = preCheck.stories.filter((story) => story.audioTracks?.[0]?.uri);
    }

    if (extractedStories.length === 0) {
      packLog('No usable audio after story.json + assets scan', { packId });
      const partial = await trySavePartialPack(packId, pack, packDir, { fast: true });
      if (partial?.stories?.length) {
        report?.(1, 'saving');
        if (isMega) await cleanupMegaTempFiles(packDir);
        return partial;
      }
      throw new Error('Aucun fichier audio utilisable dans le pack');
    }

    packLog('Stories extracted', {
      packId,
      count: extractedStories.length,
      stories: extractedStories.filter((s) => s.contentType === 'story').length,
      songs: extractedStories.filter((s) => s.contentType === 'song').length,
      titles: extractedStories.map((s) => s.title).slice(0, 5),
    });

    packLog('Saving metadata…');
    const saved = await savePackMetadata(packId, pack, packDir, extractedStories, { partial: false });

    report?.(1, 'saving');
    packLog('Download package complete', {
      packId,
      stories: saved.stories.length,
      elapsedMs: Date.now() - startedAt,
    });
    if (isMega) await cleanupMegaTempFiles(packDir);
    return saved;
  } catch (e) {
    if (e.name === 'DownloadCancelledError') {
      packLog('Download cancelled', { packId, elapsedMs: Date.now() - startedAt });
      try {
        const partial = await trySavePartialPack(packId, pack, packDir, { fast: true });
        if (partial?.stories?.length) {
          packLog('Partial pack preserved after cancel', {
            packId,
            stories: partial.stories.length,
          });
        }
      } catch (saveErr) {
        packLog('Partial save failed', { packId, message: saveErr.message });
      }
      throw e;
    }

    packLog('Download package failed', { packId, message: e.message, elapsedMs: Date.now() - startedAt });
    try {
      const partial = await trySavePartialPack(packId, pack, packDir, { fast: true });
      if (partial?.stories?.length) {
        packLog('Partial pack preserved', {
          packId,
          stories: partial.stories.length,
          missing: partial.missing,
        });
      }
    } catch (saveErr) {
      packLog('Partial save failed', { packId, message: saveErr.message });
    }
    throw e;
  }
  } finally {
    endActiveDownload();
  }
}

/** @deprecated use downloadPackage */
export const downloadStory = downloadPackage;

export async function deletePackage(packId) {
  const packagesMeta = await loadPackagesMeta();
  const packDir = packagesMeta[packId]?.localPath || `${STORIES_DIR}${packId}/`;
  await cleanupMegaTempFiles(packDir);
  await FileSystem.deleteAsync(packDir, { idempotent: true });
  if (packagesMeta[packId]) {
    delete packagesMeta[packId];
    await savePackagesMeta(packagesMeta);
  }

  const storiesMeta = await loadStoriesMeta();
  Object.keys(storiesMeta).forEach((key) => {
    if (storiesMeta[key].packId === packId) delete storiesMeta[key];
  });
  await saveStoriesMeta(storiesMeta);
}

export async function deleteStory(storyId) {
  const storiesMeta = await loadStoriesMeta();
  delete storiesMeta[storyId];
  await saveStoriesMeta(storiesMeta);
}

export async function savePlaybackProgress({
  playlist, savedPlaylistId, currentStoryIndex, currentTrackIndex, positionMs,
  storyPositions, resetStoryPositions = false,
}) {
  const existing = await loadPlaybackProgress();
  let mergedStoryPositions = resetStoryPositions
    ? {}
    : { ...(existing?.storyPositions || {}) };

  if (storyPositions && typeof storyPositions === 'object') {
    mergedStoryPositions = { ...mergedStoryPositions, ...storyPositions };
  } else if (playlist?.length && currentStoryIndex != null && currentStoryIndex >= 0) {
    const storyId = playlist[currentStoryIndex];
    if (storyId) {
      mergedStoryPositions[storyId] = {
        trackIndex: currentTrackIndex || 0,
        positionMs: positionMs || 0,
      };
    }
  }

  const payload = {
    playlist,
    currentStoryIndex,
    currentTrackIndex,
    positionMs,
    storyPositions: mergedStoryPositions,
    savedAt: Date.now(),
  };
  if (savedPlaylistId) payload.savedPlaylistId = savedPlaylistId;
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(payload));

  if (savedPlaylistId) {
    await updateSavedPlaylistProgress(savedPlaylistId, {
      currentStoryIndex,
      currentTrackIndex,
      positionMs,
      storyPositions: mergedStoryPositions,
    });
  }
}

export async function loadPlaybackProgress() {
  const raw = await AsyncStorage.getItem(PROGRESS_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function getValidPlaybackProgress() {
  const progress = await loadPlaybackProgress();
  if (!progress?.playlist?.length) return null;

  const meta = await loadStoriesMeta();
  const playlist = progress.playlist.filter((id) => {
    const story = meta[id];
    return story && filterAudioTracks(story.audioTracks || []).length > 0;
  });

  if (!playlist.length) {
    await clearPlaybackProgress();
    return null;
  }

  const currentStoryIndex = Math.min(
    progress.currentStoryIndex || 0,
    Math.max(playlist.length - 1, 0),
  );
  const story = meta[playlist[currentStoryIndex]];
  const tracks = filterAudioTracks(story?.audioTracks || []);
  const currentTrackIndex = Math.min(
    progress.currentTrackIndex || 0,
    Math.max(tracks.length - 1, 0),
  );

  const storyPositions = {};
  if (progress.storyPositions && typeof progress.storyPositions === 'object') {
    playlist.forEach((storyId) => {
      if (progress.storyPositions[storyId]) {
        storyPositions[storyId] = progress.storyPositions[storyId];
      }
    });
  }

  const normalized = {
    ...progress,
    playlist,
    currentStoryIndex,
    currentTrackIndex,
    positionMs: progress.positionMs || 0,
    savedPlaylistId: progress.savedPlaylistId || null,
    storyPositions,
  };

  if (
    playlist.length !== progress.playlist.length
    || currentStoryIndex !== progress.currentStoryIndex
    || currentTrackIndex !== progress.currentTrackIndex
  ) {
    await savePlaybackProgress(normalized);
  }

  return normalized;
}

export async function clearPlaybackProgress() {
  await AsyncStorage.removeItem(PROGRESS_KEY);
}

export function playlistsMatch(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

export function getStoryResumePosition(progress, playlist, storyIndex) {
  if (!playlist?.length || storyIndex < 0 || storyIndex >= playlist.length) {
    return { trackIndex: 0, positionMs: 0 };
  }
  const storyId = playlist[storyIndex];
  const fromMap = storyId && progress?.storyPositions?.[storyId];
  if (fromMap) {
    return {
      trackIndex: fromMap.trackIndex || 0,
      positionMs: fromMap.positionMs || 0,
    };
  }
  if (progress && storyIndex === progress.currentStoryIndex) {
    return {
      trackIndex: progress.currentTrackIndex || 0,
      positionMs: progress.positionMs || 0,
    };
  }
  return { trackIndex: 0, positionMs: 0 };
}

function newSavedPlaylistId() {
  return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function loadSavedPlaylistsRaw() {
  const raw = await AsyncStorage.getItem(SAVED_PLAYLISTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeSavedPlaylistsRaw(list) {
  await AsyncStorage.setItem(SAVED_PLAYLISTS_KEY, JSON.stringify(list));
}

function filterValidStoryIds(storyIds, meta) {
  return (storyIds || []).filter((id) => {
    const story = meta[id];
    return story && filterAudioTracks(story.audioTracks || []).length > 0;
  });
}

function normalizeSavedPlaylistEntry(entry, meta) {
  const storyIds = filterValidStoryIds(entry.storyIds, meta);
  if (!storyIds.length) return null;

  let progress = entry.progress || null;
  if (progress) {
    const currentStoryIndex = Math.min(
      progress.currentStoryIndex || 0,
      Math.max(storyIds.length - 1, 0),
    );
    const story = meta[storyIds[currentStoryIndex]];
    const tracks = filterAudioTracks(story?.audioTracks || []);
    const currentTrackIndex = Math.min(
      progress.currentTrackIndex || 0,
      Math.max(tracks.length - 1, 0),
    );
    progress = {
      currentStoryIndex,
      currentTrackIndex,
      positionMs: progress.positionMs || 0,
      storyPositions: progress.storyPositions || {},
      savedAt: progress.savedAt || entry.updatedAt || entry.createdAt,
    };
  }

  return {
    id: entry.id,
    name: entry.name || 'Playlist',
    storyIds,
    createdAt: entry.createdAt || Date.now(),
    updatedAt: entry.updatedAt || entry.createdAt || Date.now(),
    progress,
  };
}

export async function getSavedPlaylists() {
  const [list, meta] = await Promise.all([loadSavedPlaylistsRaw(), loadStoriesMeta()]);
  const normalized = list
    .map((entry) => normalizeSavedPlaylistEntry(entry, meta))
    .filter(Boolean);
  normalized.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (normalized.length !== list.length) {
    await writeSavedPlaylistsRaw(normalized);
  }
  return normalized;
}

export async function getSavedPlaylistById(playlistId) {
  const list = await getSavedPlaylists();
  return list.find((pl) => pl.id === playlistId) || null;
}

export async function saveNamedPlaylist({ name, storyIds }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('EMPTY_NAME');

  const meta = await loadStoriesMeta();
  const validIds = filterValidStoryIds(storyIds, meta);
  if (!validIds.length) throw new Error('EMPTY_PLAYLIST');

  const list = await loadSavedPlaylistsRaw();
  const now = Date.now();
  const entry = {
    id: newSavedPlaylistId(),
    name: trimmed,
    storyIds: validIds,
    createdAt: now,
    updatedAt: now,
    progress: null,
  };
  list.push(entry);
  await writeSavedPlaylistsRaw(list);
  return normalizeSavedPlaylistEntry(entry, meta);
}

export async function deleteSavedPlaylist(playlistId) {
  const list = await loadSavedPlaylistsRaw();
  const next = list.filter((pl) => pl.id !== playlistId);
  await writeSavedPlaylistsRaw(next);

  const progress = await loadPlaybackProgress();
  if (progress?.savedPlaylistId === playlistId) {
    await clearPlaybackProgress();
  }
}

async function updateSavedPlaylistProgress(playlistId, {
  currentStoryIndex, currentTrackIndex, positionMs, storyPositions,
}) {
  const list = await loadSavedPlaylistsRaw();
  const idx = list.findIndex((pl) => pl.id === playlistId);
  if (idx < 0) return;

  const prev = list[idx].progress || {};
  list[idx] = {
    ...list[idx],
    updatedAt: Date.now(),
    progress: {
      ...prev,
      currentStoryIndex,
      currentTrackIndex,
      positionMs,
      storyPositions: storyPositions || prev.storyPositions || {},
      savedAt: Date.now(),
    },
  };
  await writeSavedPlaylistsRaw(list);
}

export async function clearSavedPlaylistProgress(playlistId) {
  const list = await loadSavedPlaylistsRaw();
  const idx = list.findIndex((pl) => pl.id === playlistId);
  if (idx < 0) return;
  list[idx] = { ...list[idx], progress: null, updatedAt: Date.now() };
  await writeSavedPlaylistsRaw(list);

  const progress = await loadPlaybackProgress();
  if (progress?.savedPlaylistId === playlistId) {
    await clearPlaybackProgress();
  }
}

export async function getSavedPlaylistProgress(playlistId) {
  const pl = await getSavedPlaylistById(playlistId);
  if (!pl?.progress) return null;
  return {
    savedPlaylistId: pl.id,
    playlist: pl.storyIds,
    currentStoryIndex: pl.progress.currentStoryIndex,
    currentTrackIndex: pl.progress.currentTrackIndex,
    positionMs: pl.progress.positionMs,
    storyPositions: pl.progress.storyPositions || {},
    savedAt: pl.progress.savedAt,
  };
}

export function getStoryDisplayThumbnail(story) {
  if (!story) return null;
  if (story.thumbnail && !isRemoteMediaUri(story.thumbnail)) return story.thumbnail;
  const pack = story.packId ? getPackById(story.packId) : null;
  if (story.thumbnail) return story.thumbnail;
  return pack?.thumbnail || null;
}

export async function resolveStoryDisplayThumbnail(story) {
  const immediate = getStoryDisplayThumbnail(story);
  if (immediate) return immediate;
  if (!story?.localPath || !story?.packId) return null;
  const pack = getPackById(story.packId);
  if (!pack) return null;
  return resolveStoryThumbnail(story, story.localPath, pack);
}

export function buildPlaylist(storyIds, downloadedMeta) {
  const items = [];
  storyIds.forEach((id) => {
    const meta = downloadedMeta[id];
    if (!meta?.audioTracks?.length) return;
    const tracks = filterAudioTracks(meta.audioTracks);
    if (!tracks.length) return;
    items.push({
      storyId: id,
      title: meta.title,
      thumbnail: getStoryDisplayThumbnail(meta),
      contentType: meta.contentType,
      packId: meta.packId || null,
      tracks,
    });
  });
  return items;
}

export async function refreshSharedDownloads() {
  if (isActiveDownloadInProgress()) return null;
  const result = await scanDownloadsFolder({ force: true });
  notifySharedMediaUpdated();
  notifyStoriesLibraryUpdated();
  return result;
}

export async function getDownloadedStoryIds() {
  const meta = await mergeSharedMp3IntoMetaAsync(await loadStoriesMeta());
  return Object.keys(meta);
}

export async function getPackagesMeta() {
  return loadPackagesMeta();
}
