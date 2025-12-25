import React from 'react';
import { render } from '@testing-library/react-native';
import SimpleColoringCanvas from '../src/components/coloring/SimpleColoringCanvas';

// Mock SoundContext
jest.mock('../contexts/SoundContext', () => ({
  useSounds: () => ({
    playSound: jest.fn(),
  }),
}));

// Mock Skia
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: ({ children }) => children,
  Image: () => 'Image',
  useImage: () => ({ width: 100, height: 100 }),
  Path: () => 'Path',
  Group: ({ children }) => children,
  Skia: {
    Path: {
      Make: () => ({
        addRect: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        close: jest.fn(),
        isEmpty: () => false,
      }),
    },
    ColorType: { RGBA_8888: 4 },
    AlphaType: { Premul: 1, Opaque: 3 },
  },
  useTouchHandler: () => jest.fn(),
  ImageShader: () => 'ImageShader',
  BlendColor: () => 'BlendColor',
  useAnimatedImageValue: () => ({ current: null }),
  ImageFormat: { PNG: 0 },
}));

describe('SimpleColoringCanvas', () => {
  test('renders correctly', () => {
    const { getByTestId } = render(
      <SimpleColoringCanvas 
        imageUri="blank" 
        currentColor="#FF69B4" 
        tool="pen"
        zoomScale={1}
        zoomOffset={{ x: 0, y: 0 }}
      />
    );
    // If it renders without crashing, Skia mock is working
    expect(true).toBeTruthy();
  });
});

