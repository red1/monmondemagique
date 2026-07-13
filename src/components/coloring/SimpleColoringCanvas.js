import React, { useState, useRef, forwardRef, useImperativeHandle, useEffect, useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import {
  Canvas,
  Image,
  useImage,
  Path,
  Skia,
  useTouchHandler,
  ImageShader,
  BlendColor,
  useAnimatedImageValue,
  ImageFormat,
  Group,
} from '@shopify/react-native-skia';
import { useSounds } from '../../../contexts/SoundContext';

const GLITTER_SOURCES = {
  glitter: require('../../../assets/sprites/glitter.gif'),
  glitter2: require('../../../assets/sprites/glitter2.gif'),
  glitter3: require('../../../assets/sprites/glitter3.gif'),
  glitter4: require('../../../assets/sprites/glitter4.gif'),
  glitter5: require('../../../assets/sprites/glitter5.gif'),
  glitter6: require('../../../assets/sprites/glitter6.gif'),
};

function getDrawRect(canvasSize, imageRect, imageUri, image) {
  if (image && imageUri !== 'blank' && imageRect.width > 0 && imageRect.height > 0) {
    return imageRect;
  }
  return { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height };
}

function canvasToNorm(cx, cy, drawRect) {
  if (!drawRect.width || !drawRect.height) return { nx: 0, ny: 0 };
  return {
    nx: (cx - drawRect.x) / drawRect.width,
    ny: (cy - drawRect.y) / drawRect.height,
  };
}

function viewTouchToNorm(x, y, zoomScale, zoomOffset, drawRect) {
  const cx = (x - (zoomOffset?.x || 0)) / (zoomScale || 1);
  const cy = (y - (zoomOffset?.y || 0)) / (zoomScale || 1);
  return canvasToNorm(cx, cy, drawRect);
}

function areaToViewBounds(area, zoomScale, zoomOffset) {
  const zs = zoomScale || 1;
  const ox = zoomOffset?.x || 0;
  const oy = zoomOffset?.y || 0;
  return {
    left: area.x * zs + ox,
    top: area.y * zs + oy,
    right: (area.x + area.width) * zs + ox,
    bottom: (area.y + area.height) * zs + oy,
  };
}

function viewToSnapshotBounds(viewBounds, canvasSize, snapshotW, snapshotH) {
  const sx = snapshotW / canvasSize.width;
  const sy = snapshotH / canvasSize.height;
  return {
    minX: Math.max(0, Math.floor(viewBounds.left * sx)),
    maxX: Math.min(snapshotW - 1, Math.ceil(viewBounds.right * sx) - 1),
    minY: Math.max(0, Math.floor(viewBounds.top * sy)),
    maxY: Math.min(snapshotH - 1, Math.ceil(viewBounds.bottom * sy) - 1),
  };
}

const SimpleColoringCanvas = forwardRef(({
  imageUri,
  currentColor,
  tool = 'pen',
  strokeWidth = 20,
  shape = 'none',
  isMagic = false,
  glitterType = 'glitter',
  zoomScale = 1,
  zoomOffset = { x: 0, y: 0 },
  onInteraction = () => {},
  drawingEnabled = true,
}, ref) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const canvasRef = useRef(null);
  const image = useImage(imageUri === 'blank' ? null : imageUri);
  const { playSound } = useSounds();

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const imageRect = useMemo(() => {
    if (image && canvasSize.width > 0 && canvasSize.height > 0) {
      const imgW = image.width();
      const imgH = image.height();
      const canvasW = canvasSize.width;
      const canvasH = canvasSize.height;

      const imgRatio = imgW / imgH;
      const canvasRatio = canvasW / canvasH;

      if (imgRatio > canvasRatio) {
        const displayW = canvasW;
        const displayH = canvasW / imgRatio;
        return { x: 0, y: (canvasH - displayH) / 2, width: displayW, height: displayH };
      }
      const displayH = canvasH;
      const displayW = canvasH * imgRatio;
      return { x: (canvasW - displayW) / 2, y: 0, width: displayW, height: displayH };
    }
    return { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height };
  }, [image, canvasSize]);

  const drawRect = useMemo(
    () => getDrawRect(canvasSize, imageRect, imageUri, image),
    [canvasSize, imageRect, imageUri, image],
  );

  const settingsRef = useRef({
    tool, currentColor, strokeWidth, shape, isMagic, glitterType,
    zoomScale, zoomOffset, image, imageUri, onInteraction, canvasSize, imageRect, drawRect, drawingEnabled,
  });

  useEffect(() => {
    settingsRef.current = {
      tool, currentColor, strokeWidth, shape, isMagic, glitterType,
      zoomScale, zoomOffset, image, imageUri, onInteraction, canvasSize, imageRect, drawRect, drawingEnabled,
    };
  }, [
    tool, currentColor, strokeWidth, shape, isMagic, glitterType,
    zoomScale, zoomOffset, image, imageUri, onInteraction, canvasSize, imageRect, drawRect, drawingEnabled,
  ]);

  const onLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  const g1 = useAnimatedImageValue(GLITTER_SOURCES.glitter);
  const g2 = useAnimatedImageValue(GLITTER_SOURCES.glitter2);
  const g3 = useAnimatedImageValue(GLITTER_SOURCES.glitter3);
  const g4 = useAnimatedImageValue(GLITTER_SOURCES.glitter4);
  const g5 = useAnimatedImageValue(GLITTER_SOURCES.glitter5);
  const g6 = useAnimatedImageValue(GLITTER_SOURCES.glitter6);

  const getAnimatedGlitter = (type) => {
    switch (type) {
      case 'glitter2': return g2;
      case 'glitter3': return g3;
      case 'glitter4': return g4;
      case 'glitter5': return g5;
      case 'glitter6': return g6;
      default: return g1;
    }
  };

  const [paths, setPaths] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const activePathRef = useRef(null);
  const [, setRenderTrigger] = useState(0);

  const _ColorType = Skia.ColorType || {};
  const _AlphaType = Skia.AlphaType || {};
  const CT_RGBA8888 = _ColorType.RGBA_8888 ?? 4;
  const AT_PREMUL = _AlphaType.Premul ?? 1;

  useImperativeHandle(ref, () => ({
    saveCanvas: async () => {
      try {
        if (canvasRef.current) {
          const snapshot = canvasRef.current.makeImageSnapshot();
          if (snapshot) {
            return snapshot.encodeToBase64(ImageFormat.PNG, 100);
          }
        }
      } catch (e) {
        console.error('Snapshot error:', e);
      }
      return null;
    },
    clearCanvas: () => {
      setPaths([]);
      setRedoStack([]);
      activePathRef.current = null;
      setRenderTrigger((t) => t + 1);
    },
    undo: () => {
      if (paths.length > 0) {
        const lastPath = paths[paths.length - 1];
        setRedoStack((old) => [...old, lastPath]);
        setPaths((old) => old.slice(0, -1));
        playSound('pop');
      }
    },
    redo: () => {
      if (redoStack.length > 0) {
        const lastRedo = redoStack[redoStack.length - 1];
        setPaths((old) => [...old, lastRedo]);
        setRedoStack((old) => old.slice(0, -1));
        playSound('pop');
      }
    },
  }));

  const toCanvas = (x, y, scale, offset) => ({
    x: (x - (offset?.x || 0)) / (scale || 1),
    y: (y - (offset?.y || 0)) / (scale || 1),
  });

  const performMagicFill = (viewX, viewY, s) => {
    if (!canvasRef.current || s.canvasSize.width === 0 || !s.drawingEnabled) return;

    try {
      const snapshot = canvasRef.current.makeImageSnapshot();
      const w = Math.floor(snapshot.width());
      const h = Math.floor(snapshot.height());
      if (!w || !h) return;

      const x = Math.floor(viewX * (w / s.canvasSize.width));
      const y = Math.floor(viewY * (h / s.canvasSize.height));

      const pixels = snapshot.readPixels(0, 0, {
        width: w,
        height: h,
        colorType: CT_RGBA8888,
        alphaType: AT_PREMUL,
      });

      if (!pixels) return;

      const area = getDrawRect(s.canvasSize, s.imageRect, s.imageUri, s.image);
      const viewBounds = areaToViewBounds(area, s.zoomScale, s.zoomOffset);
      const {
        minX: fillMinX, maxX: fillMaxX, minY: fillMinY, maxY: fillMaxY,
      } = viewToSnapshotBounds(viewBounds, s.canvasSize, w, h);

      if (fillMinX > fillMaxX || fillMinY > fillMaxY) return;

      if (x < fillMinX || x > fillMaxX || y < fillMinY || y > fillMaxY) return;

      const colorAt = (px, py) => {
        const idx = (py * w + px) * 4;
        return [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
      };

      const luminanceAt = (px, py) => {
        const [r, g, b] = colorAt(px, py);
        return (r + g + b) / 3;
      };

      const colorDistance = (r1, g1, b1, r2, g2, b2) => (
        Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)
      );

      // Traits noirs uniquement — pas les couleurs foncées déjà appliquées
      const isLineWall = (px, py) => {
        if (px < 0 || py < 0 || px >= w || py >= h) return true;
        const [r, g, b] = colorAt(px, py);
        if (r < 100 && g < 100 && b < 100) return true;
        return luminanceAt(px, py) < 70;
      };

      if (isLineWall(x, y)) return;

      let lineNeighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (isLineWall(x + dx, y + dy)) lineNeighbors += 1;
        }
      }
      if (lineNeighbors >= 5) return;

      const [targetR, targetG, targetB] = colorAt(x, y);
      const FILL_TOLERANCE = 72;

      const visited = new Uint8Array(w * h);
      const stack = [[x, y]];
      const fillPath = Skia.Path.Make();

      const matchesFillTarget = (px, py) => {
        if (isLineWall(px, py)) return false;
        const [r, g, b] = colorAt(px, py);
        return colorDistance(r, g, b, targetR, targetG, targetB) <= FILL_TOLERANCE;
      };

      const isFillable = (px, py) => {
        if (px < fillMinX || px > fillMaxX || py < fillMinY || py > fillMaxY) return false;
        if (visited[py * w + px]) return false;
        return matchesFillTarget(px, py);
      };

      const imagePixelCount = (fillMaxX - fillMinX + 1) * (fillMaxY - fillMinY + 1);
      const MAX_FILL_PIXELS = Math.floor(imagePixelCount * 0.38);
      let filledCount = 0;

      const scaleX = s.canvasSize.width / w;
      const scaleY = s.canvasSize.height / h;

      while (stack.length > 0) {
        if (filledCount > MAX_FILL_PIXELS) return;

        const [cX, cY] = stack.pop();
        let lX = cX;
        while (lX > fillMinX && isFillable(lX - 1, cY)) lX -= 1;
        let rX = cX;
        while (rX < fillMaxX && isFillable(rX + 1, cY)) rX += 1;

        const span = rX - lX + 1;
        filledCount += span;
        if (filledCount > MAX_FILL_PIXELS) return;

        const viewLeft = lX * scaleX;
        const viewTop = cY * scaleY;
        const viewRight = (rX + 1) * scaleX;
        const viewBottom = (cY + 1) * scaleY;

        const topLeft = toCanvas(viewLeft, viewTop, s.zoomScale, s.zoomOffset);
        const bottomRight = toCanvas(viewRight, viewBottom, s.zoomScale, s.zoomOffset);
        const tl = canvasToNorm(topLeft.x, topLeft.y, area);
        const br = canvasToNorm(bottomRight.x, bottomRight.y, area);

        fillPath.addRect({
          x: tl.nx,
          y: tl.ny,
          width: br.nx - tl.nx,
          height: br.ny - tl.ny,
        });

        for (let i = lX; i <= rX; i += 1) {
          visited[cY * w + i] = 1;
          if (cY > fillMinY && isFillable(i, cY - 1)) stack.push([i, cY - 1]);
          if (cY < fillMaxY && isFillable(i, cY + 1)) stack.push([i, cY + 1]);
        }
      }

      if (filledCount < 8 || fillPath.isEmpty()) return;

      setPaths((old) => [...old, {
        type: 'magic_fill_path',
        path: fillPath,
        color: s.currentColor,
        isMagic: s.isMagic,
        glitterType: s.glitterType,
        normalized: true,
      }]);
      setRedoStack([]);
      playSound('success');
    } catch (error) {
      console.error('Magic fill error:', error);
    }
  };

  const onTouch = useTouchHandler({
    onStart: ({ x, y }) => {
      const s = settingsRef.current;
      if (!s.drawingEnabled) return;
      s.onInteraction(x, y);
      const area = getDrawRect(s.canvasSize, s.imageRect, s.imageUri, s.image);
      if (!area.width || !area.height) return;

      if (s.tool === 'bucket') {
        performMagicFill(x, y, s);
        return;
      }

      const { nx, ny } = viewTouchToNorm(x, y, s.zoomScale, s.zoomOffset, area);
      const newPath = Skia.Path.Make();
      const normStroke = (s.tool === 'eraser' ? s.strokeWidth * 3 : s.strokeWidth)
        / (s.zoomScale || 1) / area.width;

      if (s.shape !== 'none') {
        const size = (s.strokeWidth * 2) / (s.zoomScale || 1) / area.width;
        if (s.shape === 'circle') newPath.addCircle(nx, ny, size);
        else if (s.shape === 'square') newPath.addRect({ x: nx - size, y: ny - size, width: size * 2, height: size * 2 });
        else if (s.shape === 'star') {
          const r = size;
          for (let i = 0; i < 5; i += 1) {
            const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const px = nx + r * Math.cos(angle);
            const py = ny + r * Math.sin(angle);
            if (i === 0) newPath.moveTo(px, py);
            else newPath.lineTo(px, py);
          }
          newPath.close();
        }
        setPaths((old) => [...old, {
          path: newPath,
          color: s.currentColor,
          type: 'shape',
          isMagic: s.isMagic,
          glitterType: s.glitterType,
          normalized: true,
        }]);
        setRedoStack([]);
      } else {
        newPath.moveTo(nx, ny);
        activePathRef.current = {
          path: newPath,
          color: s.tool === 'eraser' ? '#FFFFFF' : s.currentColor,
          type: s.tool === 'eraser' ? 'eraser' : 'pen',
          strokeWidth: normStroke,
          isMagic: s.tool === 'eraser' ? false : s.isMagic,
          glitterType: s.glitterType,
          normalized: true,
        };
        setRedoStack([]);
        setRenderTrigger((t) => t + 1);
      }
    },
    onActive: ({ x, y }) => {
      const s = settingsRef.current;
      if (!s.drawingEnabled || s.tool === 'bucket' || s.shape !== 'none' || !activePathRef.current) return;

      const area = getDrawRect(s.canvasSize, s.imageRect, s.imageUri, s.image);
      const { nx, ny } = viewTouchToNorm(x, y, s.zoomScale, s.zoomOffset, area);
      activePathRef.current.path.lineTo(nx, ny);
      setRenderTrigger((t) => t + 1);
    },
    onEnd: () => {
      if (activePathRef.current) {
        setPaths((old) => [...old, activePathRef.current]);
        activePathRef.current = null;
        setRenderTrigger((t) => t + 1);
      }
    },
  }, []);

  const unitWhitePath = useMemo(() => Skia.Path.Make().addRect({ x: 0, y: 0, width: 1, height: 1 }), []);

  const areaTransform = drawRect.width > 0 ? [
    { translateX: drawRect.x },
    { translateY: drawRect.y },
    { scaleX: drawRect.width },
    { scaleY: drawRect.height },
  ] : [];

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Canvas
        style={styles.canvas}
        onTouch={drawingEnabled ? onTouch : undefined}
        ref={canvasRef}
      >
        <Group transform={[
          { translateX: zoomOffset.x },
          { translateY: zoomOffset.y },
          { scale: zoomScale },
        ]}
        >
          <Group transform={areaTransform}>
            <Path path={unitWhitePath} color="white" />

            {paths.map((p, index) => (
              <Path
                key={`p-${index}`}
                path={p.path}
                style={p.type === 'pen' || p.type === 'eraser' ? 'stroke' : 'fill'}
                strokeWidth={p.strokeWidth || (strokeWidth / (zoomScale || 1) / (drawRect.width || 1))}
                strokeCap="round"
                strokeJoin="round"
                color={p.isMagic ? undefined : p.color}
              >
                {p.isMagic && getAnimatedGlitter(p.glitterType) && (
                  <ImageShader
                    image={getAnimatedGlitter(p.glitterType)}
                    tx="repeat"
                    ty="repeat"
                    rect={{ x: 0, y: 0, width: 40 / (zoomScale || 1) / (drawRect.width || 1), height: 40 / (zoomScale || 1) / (drawRect.width || 1) }}
                  />
                )}
                {p.isMagic && <BlendColor mode="modulate" color={p.color} />}
              </Path>
            ))}

            {activePathRef.current && (
              <Path
                path={activePathRef.current.path}
                style="stroke"
                strokeWidth={activePathRef.current.strokeWidth}
                strokeCap="round"
                strokeJoin="round"
                color={activePathRef.current.isMagic ? undefined : activePathRef.current.color}
              >
                {activePathRef.current.isMagic && getAnimatedGlitter(activePathRef.current.glitterType) && (
                  <ImageShader
                    image={getAnimatedGlitter(activePathRef.current.glitterType)}
                    tx="repeat"
                    ty="repeat"
                    rect={{ x: 0, y: 0, width: 40 / (zoomScale || 1) / (drawRect.width || 1), height: 40 / (zoomScale || 1) / (drawRect.width || 1) }}
                  />
                )}
                {activePathRef.current.isMagic && <BlendColor mode="modulate" color={activePathRef.current.color} />}
              </Path>
            )}

            {image && imageUri !== 'blank' && (
              <Image
                image={image}
                x={0}
                y={0}
                width={1}
                height={1}
                fit="fill"
                blendMode="multiply"
              />
            )}
          </Group>
        </Group>
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  canvas: { flex: 1 },
});

export default SimpleColoringCanvas;
