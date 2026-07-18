/** Grid layout for the stories library — tuned for tablet-first browsing. */
export function getStoriesGridConfig(width) {
  if (width >= 900) {
    return { numColumns: 7, pageRows: 14 };
  }
  if (width >= 768) {
    return { numColumns: 7, pageRows: 12 };
  }
  if (width >= 480) {
    return { numColumns: 3, pageRows: 10 };
  }
  return { numColumns: 2, pageRows: 8 };
}

export function getStoryCardMetrics(width, numColumns) {
  const horizontalPadding = 16;
  const gap = numColumns >= 5 ? 6 : 8;
  const cardWidth = (width - horizontalPadding * 2 - gap * (numColumns - 1)) / numColumns;
  const thumbnailHeight = numColumns >= 7 ? 72 : numColumns >= 5 ? 84 : numColumns >= 3 ? 96 : 120;
  return { cardWidth, gap, thumbnailHeight, horizontalPadding };
}
