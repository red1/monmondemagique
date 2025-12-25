import React, { useState, useMemo, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, Dimensions, Text } from 'react-native';
import {
  Canvas,
  Image,
  useImage,
  Path,
  Skia,
  useTouchHandler,
  ImageFormat,
} from '@shopify/react-native-skia';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CANVAS_HEIGHT = SCREEN_HEIGHT * 0.70; 

const SketchCanvas = forwardRef(({ imageUri, currentTool, clearTrigger }, ref) => {
  const canvasRef = useRef(null);
  const image = useImage(imageUri);
  const [paths, setPaths] = useState([]);
  
  useImperativeHandle(ref, () => ({
    save: async () => {
        if (canvasRef.current) {
            const image = canvasRef.current.makeImageSnapshot();
            if (image) {
                return image.encodeToBase64(ImageFormat.PNG, 100);
            }
        }
        return null;
    }
  }));

  useEffect(() => {
    if (clearTrigger > 0) {
      setPaths([]);
    }
  }, [clearTrigger]);

  const onDrawing = useTouchHandler({
    onStart: ({ x, y }) => {
      const newPath = Skia.Path.Make();
      if (currentTool.type === 'bucket') {
          newPath.addRect({x: 0, y: 0, width: SCREEN_WIDTH, height: CANVAS_HEIGHT});
          setPaths((old) => [...old, { 
            path: newPath, 
            color: currentTool.color, 
            strokeWidth: 0,
            type: 'fill' 
          }]);
      } else {
          newPath.moveTo(x, y);
          setPaths((old) => [...old, { 
            path: newPath, 
            color: currentTool.type === 'eraser' ? '#FFFFFF' : currentTool.color, 
            strokeWidth: currentTool.type === 'eraser' ? 60 : 40,
            type: currentTool.type 
          }]);
      }
    },
    onActive: ({ x, y }) => {
      if (currentTool.type === 'bucket') return;
      setPaths((currentPaths) => {
        const lastPathObj = currentPaths[currentPaths.length - 1];
        if (!lastPathObj || lastPathObj.type === 'fill') return currentPaths;
        lastPathObj.path.lineTo(x, y);
        return [...currentPaths.slice(0, -1), lastPathObj];
      });
    },
  }, [currentTool]);

  if (!image && imageUri !== 'blank') {
    return <View style={styles.placeholder}><Text>Chargement...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas} onTouch={onDrawing} ref={canvasRef}>
        <Path path={Skia.Path.Make().addRect({x:0,y:0,width:SCREEN_WIDTH,height:CANVAS_HEIGHT})} color="white" />
        
        {paths.map((p, index) => (
          <Path
            key={index}
            path={p.path}
            color={p.color}
            style={p.type === 'fill' ? "fill" : "stroke"}
            strokeWidth={p.strokeWidth}
            strokeCap="round"
            strokeJoin="round"
          />
        ))}

        {image && imageUri !== 'blank' && (
            <Image
                image={image}
                x={0}
                y={0}
                width={SCREEN_WIDTH}
                height={CANVAS_HEIGHT}
                fit="contain"
                blendMode="multiply" 
            />
        )}
      </Canvas>
    </View>
  );
});

export default SketchCanvas;

const styles = StyleSheet.create({
  container: { width: '100%', height: CANVAS_HEIGHT, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  canvas: { width: SCREEN_WIDTH, height: CANVAS_HEIGHT, backgroundColor: 'transparent' },
  placeholder: { height: CANVAS_HEIGHT, justifyContent: 'center', alignItems: 'center' }
});
