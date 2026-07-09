import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';

const MAX_HEADER_BYTES = 512 * 1024;

function readSyncsafeInt(bytes, offset) {
  return ((bytes[offset] & 0x7f) << 21)
    | ((bytes[offset + 1] & 0x7f) << 14)
    | ((bytes[offset + 2] & 0x7f) << 7)
    | (bytes[offset + 3] & 0x7f);
}

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3];
}

function findNullTerminator(bytes, start) {
  for (let i = start; i < bytes.length; i += 1) {
    if (bytes[i] === 0) return i;
  }
  return -1;
}

function decodeId3Text(body) {
  if (!body?.length) return '';
  const encoding = body[0];
  const textBytes = body.subarray(1);

  if (encoding === 0) {
    const end = findNullTerminator(textBytes, 0);
    return Buffer.from(textBytes.subarray(0, end >= 0 ? end : textBytes.length)).toString('latin1').trim();
  }
  if (encoding === 3) {
    const end = findNullTerminator(textBytes, 0);
    return Buffer.from(textBytes.subarray(0, end >= 0 ? end : textBytes.length)).toString('utf8').trim();
  }
  if (encoding === 1 || encoding === 2) {
    try {
      return Buffer.from(textBytes).toString('utf16le').replace(/\0/g, '').trim();
    } catch (_) {
      return '';
    }
  }
  return Buffer.from(textBytes).toString('utf8').replace(/\0/g, '').trim();
}

function parseId3v2Frames(bytes) {
  const frames = {};
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return { frames, tagEnd: 0 };
  }

  const versionMajor = bytes[3];
  const tagSize = readSyncsafeInt(bytes, 6);
  let offset = 10;
  const tagEnd = Math.min(bytes.length, 10 + tagSize);

  while (offset + 10 <= tagEnd) {
    const frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

    const frameSize = versionMajor === 4
      ? readSyncsafeInt(bytes, offset + 4)
      : readUint32(bytes, offset + 4);

    const frameStart = offset + 10;
    const frameEnd = frameStart + frameSize;
    if (frameEnd > bytes.length) break;

    frames[frameId] = bytes.subarray(frameStart, frameEnd);
    offset = frameEnd;
  }

  return { frames, tagEnd };
}

function parseId3v2Cover(bytes) {
  const { frames } = parseId3v2Frames(bytes);
  const apic = frames.APIC || frames['PIC '];
  if (!apic) return null;

  const mimeStart = 1;
  const mimeEnd = findNullTerminator(apic, mimeStart);
  if (mimeEnd < 0) return null;

  const pictureTypeOffset = mimeEnd + 1;
  if (pictureTypeOffset >= apic.length) return null;

  const descStart = pictureTypeOffset + 1;
  const descEnd = findNullTerminator(apic, descStart);
  if (descEnd < 0) return null;

  const imageData = apic.subarray(descEnd + 1);
  return imageData.length > 0 ? imageData : null;
}

function estimateMp3DurationMs(fileSize, id3TagEnd) {
  const audioBytes = Math.max(0, fileSize - (id3TagEnd || 0));
  if (audioBytes <= 0) return null;
  const bitrateKbps = 128;
  return Math.round((audioBytes * 8 * 1000) / (bitrateKbps * 1000));
}

export function estimateMp3DurationFromBytes(fileSize, id3TagEnd = 0) {
  return estimateMp3DurationMs(fileSize, id3TagEnd);
}

/** Prefer file-size estimate when JSON/ID3 duration is implausible for the file. */
export function reconcileDurationMs(declaredMs, fileSizeBytes, id3TagEnd = 0, minPlausibleMs = 30000) {
  const estimatedMs = fileSizeBytes > 0 ? (estimateMp3DurationMs(fileSizeBytes, id3TagEnd) || 0) : 0;
  if (!estimatedMs) return declaredMs > 0 ? declaredMs : 0;
  if (!declaredMs || declaredMs <= 0) return estimatedMs;

  if (estimatedMs >= minPlausibleMs && declaredMs < minPlausibleMs) {
    const asSecondsMs = declaredMs * 1000;
    if (asSecondsMs >= minPlausibleMs) {
      const errMs = Math.abs(declaredMs - estimatedMs);
      const errSec = Math.abs(asSecondsMs - estimatedMs);
      if (errSec < errMs) return asSecondsMs;
    }
    return estimatedMs;
  }

  return declaredMs;
}

export async function readMp3HeaderBytes(mp3Uri) {
  const info = await FileSystem.getInfoAsync(mp3Uri, { size: true });
  if (!info.exists || !info.size) return null;

  const length = Math.min(MAX_HEADER_BYTES, info.size);
  const base64 = await FileSystem.readAsStringAsync(mp3Uri, {
    encoding: FileSystem.EncodingType.Base64,
    position: 0,
    length,
  });
  return { bytes: new Uint8Array(Buffer.from(base64, 'base64')), fileSize: info.size };
}

export async function extractMp3Tags(mp3Uri) {
  try {
    const header = await readMp3HeaderBytes(mp3Uri);
    if (!header) return null;

    const { bytes, fileSize } = header;
    const { frames, tagEnd } = parseId3v2Frames(bytes);

    const title = frames.TIT2 ? decodeId3Text(frames.TIT2) : '';
    const artist = frames.TPE1 ? decodeId3Text(frames.TPE1) : '';
    const album = frames.TALB ? decodeId3Text(frames.TALB) : '';
    const genre = frames.TCON ? decodeId3Text(frames.TCON) : '';

    let durationMs = null;
    if (frames.TLEN) {
      const tlen = parseInt(decodeId3Text(frames.TLEN), 10);
      if (Number.isFinite(tlen) && tlen > 0) durationMs = tlen;
    }
    const estimatedMs = estimateMp3DurationMs(fileSize, tagEnd);
    durationMs = reconcileDurationMs(durationMs || 0, fileSize, tagEnd) || estimatedMs || null;

    return {
      title: title || null,
      artist: artist || null,
      album: album || null,
      genre: genre || null,
      durationMs: durationMs || null,
    };
  } catch (_) {
    return null;
  }
}

export async function extractMp3CoverArt(mp3Uri) {
  try {
    const header = await readMp3HeaderBytes(mp3Uri);
    if (!header) return null;
    return parseId3v2Cover(header.bytes);
  } catch (_) {
    return null;
  }
}

export async function saveCoverArt(coverDir, fileName, imageBytes) {
  await FileSystem.makeDirectoryAsync(coverDir, { intermediates: true });
  const coverPath = `${coverDir}${fileName}`;
  await FileSystem.writeAsStringAsync(coverPath, Buffer.from(imageBytes).toString('base64'), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return coverPath;
}
