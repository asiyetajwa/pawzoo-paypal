import React from 'react';
import { Composition } from 'remotion';
import { FPS } from './components/Film';
import { pawzooFilm } from './pawzoo/PawzooFilm';

export const Root: React.FC = () => (
  <>
    <Composition
      id="PawzooLandscape"
      component={pawzooFilm.Component}
      durationInFrames={pawzooFilm.durationInFrames}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={pawzooFilm.defaultProps}
      calculateMetadata={pawzooFilm.calculateMetadata}
    />
  </>
);
