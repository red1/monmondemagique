import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { estimateMp3DurationFromBytes } from './mp3Metadata';
import { parseSubtitleContent } from '../utils/subtitles';

export const SHARED_PACK_ID = 'shared_downloads';

/** User-facing label for the system downloads location (not an app-internal path). */
export const SYSTEM_DOWNLOADS_LABEL = Platform.select({
  ios: 'Fichiers › Téléchargements',
  android: 'Téléchargements (Chrome, navigateur…)',
  default: 'Downloads folder',
});

const MP3_EXT = /\.mp3$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|webm)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i;
const SUBTITLE_EXT = /\.(vtt|srt)$/i;

const ANDROID_PUBLIC_DOWNLOAD_DIRS = [
  'file:///storage/emulated/0/Download/',
  'file:///storage/emulated/0/Downloads/',
  'file:///sdcard/Download/',
  'file:///sdcard/Downloads/',
];

const mediaListeners = new Set();
let videosCache = null;
let videosCacheAt = 0;
const CACHE_TTL_MS = 30_000;

export function isSharedMediaCacheFresh() {
  return !!(videosCache && Date.now() - videosCacheAt < CACHE_TTL_MS);
}

export function getCachedSharedScan() {
  return isSharedMediaCacheFresh() ? videosCache : null;
}

export function subscribeSharedMedia(listener) {
  mediaListeners.add(listener);
  return () => mediaListeners.delete(listener);
}

export function notifySharedMediaUpdated() {
  videosCache = null;
  mediaListeners.forEach((listener) => {
    try { listener(); } catch (_) { /* ignore */ }
  });
}

export async function requestDownloadsAccess() {
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.granted || current.accessPrivileges === 'limited') {
    return current;
  }
  return MediaLibrary.requestPermissionsAsync();
}

function basenameNoExt(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

function basenameFromUri(uri) {
  if (!uri) return '';
  const clean = uri.split('?')[0];
  return clean.split('/').pop() || '';
}

function humanizeFilename(filename) {
  return basenameNoExt(filename)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInDownloadsPath(uri) {
  if (!uri) return false;
  const lower = decodeURIComponent(uri).toLowerCase();
  return lower.includes('/download/') || lower.includes('/downloads/');
}

function dirFromUri(uri) {
  if (!uri) return null;
  const idx = uri.lastIndexOf('/');
  return idx >= 0 ? uri.slice(0, idx + 1) : null;
}

function makeSharedStoryId(uri) {
  const key = uri.replace(/[^a-zA-Z0-9]/g, '_').slice(-120);
  return `${SHARED_PACK_ID}::${key}`;
}

function makeVideoId(uri) {
  const key = uri.replace(/[^a-zA-Z0-9]/g, '_').slice(-120);
  return `video::${key}`;
}

function makeImageId(uri) {
  const key = uri.replace(/[^a-zA-Z0-9]/g, '_').slice(-120);
  return `coloring::${key}`;
}

async function readSubtitleFile(uri) {
  try {
    const content = await FileSystem.readAsStringAsync(uri);
    const cues = parseSubtitleContent(content);
    if (!cues.length) return null;
    return { uri, cues };
  } catch (_) {
    return null;
  }
}

async function findSubtitleForMedia(uri, filename) {
  const base = basenameNoExt(filename || basenameFromUri(uri));
  const dir = dirFromUri(uri);
  if (!dir) return null;

  for (const ext of ['vtt', 'srt', 'VTT', 'SRT']) {
    const subUri = `${dir}${base}.${ext}`;
    try {
      const info = await FileSystem.getInfoAsync(subUri);
      if (info.exists && !info.isDirectory) {
        const parsed = await readSubtitleFile(subUri);
        if (parsed) return parsed;
      }
    } catch (_) { /* ignore */ }
  }
  return null;
}

function makeMp3Story({ uri, filename, size = 0, modifiedAt = Date.now() }) {
  const title = humanizeFilename(filename);
  return {
    storyId: makeSharedStoryId(uri),
    packId: SHARED_PACK_ID,
    packTitle: 'Downloads',
    title,
    thumbnail: null,
    stageImage: null,
    contentType: 'song',
    source: 'shared',
    localPath: dirFromUri(uri),
    audioTracks: [{
      name: filename,
      uri,
      durationMs: estimateMp3DurationFromBytes(size) || 0,
    }],
    durationMs: estimateMp3DurationFromBytes(size) || 0,
    durationMinutes: null,
    downloadedAt: modifiedAt,
    infoText: `${title} downloads mp3`,
    isShared: true,
  };
}

async function makeVideoEntry({ uri, filename, size = 0, modifiedAt = Date.now() }) {
  const subtitle = await findSubtitleForMedia(uri, filename);
  return {
    videoId: makeVideoId(uri),
    title: humanizeFilename(filename),
    filename,
    uri,
    size,
    subtitleUri: subtitle?.uri || null,
    subtitleCues: subtitle?.cues || [],
    hasSubtitles: !!(subtitle?.cues?.length),
    modifiedAt,
  };
}

function makeImageEntry({ uri, filename, size = 0, modifiedAt = Date.now() }) {
  return {
    imageId: makeImageId(uri),
    title: humanizeFilename(filename),
    filename,
    uri,
    size,
    modifiedAt,
    isDownload: true,
  };
}

function makeDedupeKey(filename) {
  return (filename || '').toLowerCase();
}

async function ingestFileUri(uri, filename, seenUris, seenKeys, mp3Stories, videos, images, meta = {}) {
  if (!uri) return;
  const name = filename || basenameFromUri(uri);
  const lower = name.toLowerCase();
  if (!MP3_EXT.test(lower) && !VIDEO_EXT.test(lower) && !IMAGE_EXT.test(lower)) return;

  let size = meta.size || 0;
  let modifiedAt = meta.modifiedAt || Date.now();

  if (uri.startsWith('file://')) {
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      if (!info.exists || info.isDirectory) return;
      size = info.size || size;
      modifiedAt = info.modificationTime ? info.modificationTime * 1000 : modifiedAt;
    } catch (_) {
      return;
    }
  }

  const dedupeKey = makeDedupeKey(name);
  if (seenKeys.has(dedupeKey)) return;
  if (seenUris.has(uri)) return;

  seenUris.add(uri);
  seenKeys.add(dedupeKey);

  if (MP3_EXT.test(lower)) {
    mp3Stories.push(makeMp3Story({ uri, filename: name, size, modifiedAt }));
    return;
  }

  if (VIDEO_EXT.test(lower)) {
    videos.push(await makeVideoEntry({ uri, filename: name, size, modifiedAt }));
    return;
  }

  if (IMAGE_EXT.test(lower)) {
    images.push(makeImageEntry({ uri, filename: name, size, modifiedAt }));
  }
}

async function scanDirectoryUri(dirUri, seenUris, seenKeys, mp3Stories, videos, images) {
  let entries = [];
  try {
    const info = await FileSystem.getInfoAsync(dirUri);
    if (!info.exists || !info.isDirectory) return;
    entries = await FileSystem.readDirectoryAsync(dirUri);
  } catch (_) {
    return;
  }

  for (const entry of entries) {
    const uri = entry.startsWith('file://') ? entry : `${dirUri}${entry}`;
    await ingestFileUri(uri, entry, seenUris, seenKeys, mp3Stories, videos, images);
  }
}

async function scanAndroidPublicDownloads(seenUris, seenKeys, mp3Stories, videos, images) {
  if (Platform.OS !== 'android') return;
  for (const dir of ANDROID_PUBLIC_DOWNLOAD_DIRS) {
    await scanDirectoryUri(dir, seenUris, seenKeys, mp3Stories, videos, images);
  }
}

async function resolveAssetUri(asset) {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(asset);
    return info.localUri || info.uri || asset.uri;
  } catch (_) {
    return asset.uri;
  }
}


async function scanMediaLibraryDownloads(seenUris, seenKeys, mp3Stories, videos, images) {
  const permission = await requestDownloadsAccess();
  if (!permission.granted && permission.accessPrivileges !== 'limited') {
    return false;
  }

  const mediaTypes = [
    MediaLibrary.MediaType.audio,
    MediaLibrary.MediaType.video,
    MediaLibrary.MediaType.photo,
  ];

  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  const downloadAlbums = albums.filter((album) => /download/i.test(album.title || ''));

  const ingestAlbum = async (album) => {
    let after;
    let hasNext = true;
    while (hasNext) {
      const page = await MediaLibrary.getAssetsAsync({
        album,
        mediaType: mediaTypes,
        first: 250,
        after,
      });
      for (const asset of page.assets) {
        const uri = await resolveAssetUri(asset);
        const filename = asset.filename || basenameFromUri(uri);
        await ingestFileUri(uri, filename, seenUris, seenKeys, mp3Stories, videos, images, {
          modifiedAt: (asset.modificationTime || asset.creationTime || Date.now() / 1000) * 1000,
        });
      }
      hasNext = page.hasNextPage;
      after = page.endCursor;
    }
  };

  for (const album of downloadAlbums) {
    await ingestAlbum(album);
  }

  // Fallback: paginate media and keep items stored under a Downloads path.
  let after;
  let hasNext = true;
  let pages = 0;
  const MAX_PAGES = 12;
  while (hasNext && pages < MAX_PAGES) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: mediaTypes,
      first: 300,
      after,
      sortBy: [MediaLibrary.SortBy.modificationTime],
    });
    for (const asset of page.assets) {
      const uri = await resolveAssetUri(asset);
      if (!isInDownloadsPath(uri)) continue;
      const filename = asset.filename || basenameFromUri(uri);
      await ingestFileUri(uri, filename, seenUris, seenKeys, mp3Stories, videos, images, {
        modifiedAt: (asset.modificationTime || asset.creationTime || Date.now() / 1000) * 1000,
      });
    }
    hasNext = page.hasNextPage;
    after = page.endCursor;
    pages += 1;
  }

  return true;
}

export async function scanDownloadsFolder({ force = false } = {}) {
  if (!force && videosCache && Date.now() - videosCacheAt < CACHE_TTL_MS) {
    return videosCache;
  }

  const seenUris = new Set();
  const seenKeys = new Set();
  const mp3Stories = [];
  const videos = [];
  const images = [];

  await scanAndroidPublicDownloads(seenUris, seenKeys, mp3Stories, videos, images);
  const hasMediaAccess = await scanMediaLibraryDownloads(seenUris, seenKeys, mp3Stories, videos, images);

  mp3Stories.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  videos.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  images.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  const result = { mp3Stories, videos, images, hasMediaAccess };
  videosCache = result;
  videosCacheAt = Date.now();
  return result;
}

export async function getSharedMp3Stories({ force = false } = {}) {
  const { mp3Stories } = await scanDownloadsFolder({ force });
  return mp3Stories;
}

export async function getSharedVideos({ force = false } = {}) {
  const { videos } = await scanDownloadsFolder({ force });
  return videos;
}

export async function getSharedImages({ force = false } = {}) {
  const { images } = await scanDownloadsFolder({ force });
  return images;
}

export async function getVideoById(videoId, { force = false } = {}) {
  const videos = await getSharedVideos({ force });
  return videos.find((video) => video.videoId === videoId) || null;
}

export async function mergeSharedMp3IntoMetaAsync(meta = {}, { force = false, skipScan = false } = {}) {
  if (skipScan) return meta;

  let sharedStories;
  if (!force && isSharedMediaCacheFresh()) {
    sharedStories = videosCache.mp3Stories;
  } else {
    sharedStories = await getSharedMp3Stories({ force });
  }

  const merged = { ...meta };
  Object.keys(merged).forEach((id) => {
    if (id.startsWith(`${SHARED_PACK_ID}::`)) delete merged[id];
  });
  sharedStories.forEach((story) => {
    merged[story.storyId] = story;
  });
  return merged;
}

export async function getSharedVideoIds({ force = false } = {}) {
  const videos = await getSharedVideos({ force });
  return videos.map((video) => video.videoId);
}

/** @deprecated App-internal folder is no longer used — kept for compatibility. */
export const DOWNLOADS_DIR = SYSTEM_DOWNLOADS_LABEL;
