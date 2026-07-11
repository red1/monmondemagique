function parseTimestamp(raw) {
  const normalized = String(raw).trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length < 2) return 0;
  let hours = 0;
  let minutes;
  let seconds;
  if (parts.length >= 3) {
    hours = Number(parts[0]) || 0;
    minutes = Number(parts[1]) || 0;
    seconds = Number(parts[2]) || 0;
  } else {
    minutes = Number(parts[0]) || 0;
    seconds = Number(parts[1]) || 0;
  }
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

function parseCueBlock(block) {
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;

  let timeLineIdx = 0;
  if (/^\d+$/.test(lines[0]) && lines.length > 1) timeLineIdx = 1;

  const timeLine = lines[timeLineIdx];
  const match = timeLine?.match(
    /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}|\d{1,2}:\d{2}(?::\d{2})?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}|\d{1,2}:\d{2}(?::\d{2})?)/,
  );
  if (!match) return null;

  const startMs = parseTimestamp(match[1]);
  const endMs = parseTimestamp(match[2]);
  const text = lines.slice(timeLineIdx + 1).join('\n').trim();
  if (!text) return null;

  return { startMs, endMs, text };
}

export function parseSubtitleContent(content) {
  if (!content) return [];
  const normalized = String(content)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/^WEBVTT[^\n]*\n/i, '');

  const blocks = normalized.split(/\n{2,}/);
  const cues = [];
  blocks.forEach((block) => {
    const cue = parseCueBlock(block);
    if (cue) cues.push(cue);
  });

  return cues.sort((a, b) => a.startMs - b.startMs);
}

export function getActiveSubtitle(cues, positionMs) {
  if (!cues?.length || positionMs == null) return null;
  return cues.find((cue) => positionMs >= cue.startMs && positionMs < cue.endMs) || null;
}
