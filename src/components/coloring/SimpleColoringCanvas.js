import React, { useState, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CANVAS_HEIGHT = SCREEN_HEIGHT * 0.65;

const GLITTER_SOURCES = {
  glitter: require('../../../assets/sprites/glitter.gif'),
  glitter2: require('../../../assets/sprites/glitter2.gif'),
  glitter3: require('../../../assets/sprites/glitter3.gif'),
  glitter4: require('../../../assets/sprites/glitter4.gif'),
  glitter5: require('../../../assets/sprites/glitter5.gif'),
  glitter6: require('../../../assets/sprites/glitter6.gif'),
};

/**
 * 🎨 MON MONDE MAGIQUE - CORE CANVAS COMPONENT
 * ---------------------------------------------------------
 * CRITICAL FEATURES REGISTRY (See FEATURES_CHECKLIST.md):
 * 1. Glitter Effect: Animated gif sprite + modulate blend.
 * 2. Magic Wand: Instant Flood Fill via Path.addRect (High compatibility).
 * 3. Layering: White Bg -> Fills -> Lines (Multiply).
 * 4. Shapes: Circle, Square, Star.
 * 5. Magic Toggle: Global isMagic state per path.
 * 6. Undo/Redo: Capability to revert/restore drawing actions.
 * 7. Multi-Glitter: Support for different glitter sprites persisted per path.
 */

const SimpleColoringCanvas = forwardRef(({ 
  imageUri, 
  currentColor, 
  tool = 'pen', 
  strokeWidth = 20, 
  shape = 'none', 
  isMagic = false,
  glitterType = 'glitter',
  zoomScale = 1, // Number
  zoomOffset = { x: 0, y: 0 }, // Object with numbers
  onInteraction = () => {}
}, ref) => {
  const canvasRef = useRef(null);
  const image = useImage(imageUri === 'blank' ? null : imageUri);
  const { playSound } = useSounds();
  
  // PERFORMANCE: Use a ref for settings to avoid re-creating touch handler
  const settingsRef = useRef({ tool, currentColor, strokeWidth, shape, isMagic, glitterType, zoomScale, zoomOffset, image, onInteraction });
  
  useEffect(() => {
    settingsRef.current = { tool, currentColor, strokeWidth, shape, isMagic, glitterType, zoomScale, zoomOffset, image, onInteraction };
  }, [tool, currentColor, strokeWidth, shape, isMagic, glitterType, zoomScale, zoomOffset, image, onInteraction]);

  // Transform a touch coordinate (screen) to a canvas coordinate
  const toCanvas = (x, y, scale, offset) => {
    return {
      x: (x - (offset?.x || 0)) / (scale || 1),
      y: (y - (offset?.y || 0)) / (scale || 1),
    };
  };

  // Load all available animated glitters manually (Hooks must be top-level and fixed)
  const g1 = useAnimatedImageValue(GLITTER_SOURCES.glitter);
  const g2 = useAnimatedImageValue(GLITTER_SOURCES.glitter2);
  const g3 = useAnimatedImageValue(GLITTER_SOURCES.glitter3);
  const g4 = useAnimatedImageValue(GLITTER_SOURCES.glitter4);
  const g5 = useAnimatedImageValue(GLITTER_SOURCES.glitter5);
  const g6 = useAnimatedImageValue(GLITTER_SOURCES.glitter6);
  
  const getAnimatedGlitter = (type) => {
    switch(type) {
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

  // SAFE ACCESS TO SKIA ENUMS (Handle different versions of react-native-skia)
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
        console.error("Snapshot error:", e);
      }
      return null;
    },
    clearCanvas: () => {
      setPaths([]);
      setRedoStack([]);
      activePathRef.current = null;
      setRenderTrigger(t => t + 1);
    },
    undo: () => {
      if (paths.length > 0) {
        const lastPath = paths[paths.length - 1];
        setRedoStack(old => [...old, lastPath]);
        setPaths(old => old.slice(0, -1));
        playSound('pop');
      }
    },
    redo: () => {
      if (redoStack.length > 0) {
        const lastRedo = redoStack[redoStack.length - 1];
        setPaths(old => [...old, lastRedo]);
        setRedoStack(old => old.slice(0, -1));
        playSound('pop');
      }
    }
  }));

  const performMagicFill = (screenX, screenY, s) => {
    if (!canvasRef.current) return;

    try {
        const snapshot = canvasRef.current.makeImageSnapshot();
        const w = Math.floor(snapshot.width());
        const h = Math.floor(snapshot.height());
        
        const x = Math.floor(screenX * (w / SCREEN_WIDTH));
        const y = Math.floor(screenY * (h / CANVAS_HEIGHT));

        const pixels = snapshot.readPixels(0, 0, {
            width: w,
            height: h,
            colorType: CT_RGBA8888,
            alphaType: AT_PREMUL,
        });

        if (!pixels) return;

        const visited = new Uint8Array(w * h);
        const stack = [[x, y]];
        const fillPath = Skia.Path.Make();
        
        const isWhite = (px, py) => {
            const idx = (py * w + px) * 4;
            const r = pixels[idx];
            const g = pixels[idx+1];
            const b = pixels[idx+2];
            return (r + g + b) / 3 > 200 && visited[py * w + px] === 0;
        };

        if (!isWhite(x, y)) return;

        const scaleX = SCREEN_WIDTH / w;
        const scaleY = CANVAS_HEIGHT / h;

        while (stack.length > 0) {
            let [cX, cY] = stack.pop();
            let lX = cX;
            while (lX > 0 && isWhite(lX - 1, cY)) lX--;
            let rX = cX;
            while (rX < w - 1 && isWhite(rX + 1, cY)) rX++;
            
            const leftX = lX * scaleX;
            const rightX = (rX + 1) * scaleX;
            const topY = cY * scaleY;
            
            const startCanvas = toCanvas(leftX, topY, s.zoomScale, s.zoomOffset);
            const endCanvas = toCanvas(rightX, topY, s.zoomScale, s.zoomOffset);

            fillPath.addRect({
                x: startCanvas.x, 
                y: startCanvas.y, 
                width: endCanvas.x - startCanvas.x, 
                height: (scaleY + 0.2) / s.zoomScale
            });

            for (let i = lX; i <= rX; i++) {
                visited[cY * w + i] = 1;
                if (cY > 0 && isWhite(i, cY - 1)) stack.push([i, cY - 1]);
                if (cY < h - 1 && isWhite(i, cY + 1)) stack.push([i, cY + 1]);
            }
        }

        if (!fillPath.isEmpty()) {
            setPaths(old => [...old, { 
                type: 'magic_fill_path', 
                path: fillPath, 
                color: s.currentColor, 
                isMagic: s.isMagic,
                glitterType: s.glitterType
            }]);
            setRedoStack([]);
            playSound('success');
        }
    } catch (error) {
        console.error("Magic fill error:", error);
    }
  };

  const onTouch = useTouchHandler({
    onStart: ({ x, y }) => {
      const s = settingsRef.current;
      s.onInteraction(x, y);
      if (s.tool === 'bucket') {
        performMagicFill(x, y, s);
        return;
      }

      const { x: cx, y: cy } = toCanvas(x, y, s.zoomScale, s.zoomOffset);
      const newPath = Skia.Path.Make();
      
      if (s.shape !== 'none') {
        const size = (s.strokeWidth * 2) / s.zoomScale;
        if (s.shape === 'circle') newPath.addCircle(cx, cy, size);
        else if (s.shape === 'square') newPath.addRect({x: cx-size, y: cy-size, width: size*2, height: size*2});
        else if (s.shape === 'star') {
          const r = size;
          for (let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const px = cx + r * Math.cos(angle);
            const py = cy + r * Math.sin(angle);
            if (i === 0) newPath.moveTo(px, py);
            else newPath.lineTo(px, py);
          }
          newPath.close();
        }
        setPaths((old) => [...old, { path: newPath, color: s.currentColor, type: 'shape', isMagic: s.isMagic, glitterType: s.glitterType }]);
        setRedoStack([]);
      } else {
        newPath.moveTo(cx, cy);
        activePathRef.current = { 
          path: newPath, 
          color: s.tool === 'eraser' ? '#FFFFFF' : s.currentColor, 
          type: s.tool === 'eraser' ? 'eraser' : 'pen',
          strokeWidth: (s.tool === 'eraser' ? s.strokeWidth * 3 : s.strokeWidth) / s.zoomScale,
          isMagic: s.tool === 'eraser' ? false : s.isMagic,
          glitterType: s.glitterType
        };
        setRedoStack([]);
        setRenderTrigger(t => t + 1);
      }
    },
    onActive: ({ x, y }) => {
      const s = settingsRef.current;
      if (s.tool === 'bucket' || s.shape !== 'none' || !activePathRef.current) return;
      
      const { x: cx, y: cy } = toCanvas(x, y, s.zoomScale, s.zoomOffset);
      activePathRef.current.path.lineTo(cx, cy);
      setRenderTrigger(t => t + 1);
    },
    onEnd: () => {
      if (activePathRef.current) {
        setPaths(old => [...old, activePathRef.current]);
        activePathRef.current = null;
        setRenderTrigger(t => t + 1);
      }
    }
  }, []); // PERFORMANCE: Empty dependency array means this handler is never re-created!

  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas} onTouch={onTouch} ref={canvasRef}>
        {/* White Background Layer (Always full screen) */}
        <Path path={Skia.Path.Make().addRect({x:0,y:0,width:SCREEN_WIDTH,height:CANVAS_HEIGHT})} color="white" />

        <Group transform={[
          { translateX: zoomOffset.x },
          { translateY: zoomOffset.y },
          { scale: zoomScale },
        ]}>
          {/* Layer 2: Committed Drawings and Magic Fills */}
          {paths.map((p, index) => (
            <Path 
              key={`p-${index}`} 
              path={p.path} 
              style={p.type === 'pen' || p.type === 'eraser' ? "stroke" : "fill"} 
              strokeWidth={p.strokeWidth || (strokeWidth / (zoomScale || 1))} 
              strokeCap="round" 
              strokeJoin="round" 
              color={p.isMagic ? undefined : p.color}
            >
              {p.isMagic && getAnimatedGlitter(p.glitterType) && (
                <ImageShader 
                  image={getAnimatedGlitter(p.glitterType)} 
                  tx="repeat" 
                  ty="repeat" 
                  rect={{ x: 0, y: 0, width: 40 / (zoomScale || 1), height: 40 / (zoomScale || 1) }} 
                />
              )}
              {p.isMagic && <BlendColor mode="modulate" color={p.color} />}
            </Path>
          ))}

          {/* Layer 2.5: Active Drawing Path (More fluid) */}
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
                  rect={{ x: 0, y: 0, width: 40 / (zoomScale || 1), height: 40 / (zoomScale || 1) }} 
                />
              )}
              {activePathRef.current.isMagic && <BlendColor mode="modulate" color={activePathRef.current.color} />}
            </Path>
          )}

          {/* Layer 3: Line Art (Multiply) */}
          {image && imageUri !== 'blank' && (
            <Image image={image} x={0} y={0} width={SCREEN_WIDTH} height={CANVAS_HEIGHT} fit="contain" blendMode="multiply" />
          )}
        </Group>
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: '100%', height: CANVAS_HEIGHT, backgroundColor: '#fff' },
  canvas: { flex: 1 },
});

export default SimpleColoringCanvas;
