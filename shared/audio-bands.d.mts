export type PreviewAudioBands = {
  energy: number;
  bass: number;
  mid: number;
  high: number;
  centroid: number;
  flux: number;
  onset: number;
  beat: number;
  beatPhase: number;
  samples: number[];
  spectrum: number[];
};

export declare const PREVIEW_BAND_HZ: {
  bass: [number, number];
  mid: [number, number];
  high: [number, number];
};

export declare function computeAudioBands(
  frequency: Uint8Array | number[],
  waveform: Uint8Array | number[],
  sampleRate: number,
  fftSize: number,
): PreviewAudioBands;
