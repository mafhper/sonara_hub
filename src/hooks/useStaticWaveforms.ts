import { useEffect, useRef, useState } from "react";
import type { TrackDraft } from "../types";
import { decodeStaticWaveform } from "../features/audio/audioPlayback";

export function useStaticWaveforms(selectedTrack?: TrackDraft) {
  const [staticWaveforms, setStaticWaveforms] = useState<
    Record<string, number[]>
  >({});
  const requestsRef = useRef(new Set<string>());

  // Decode a static waveform for the selected track (once) so the technical
  // preview shows the shape without playback.
  useEffect(() => {
    if (!selectedTrack) return;
    if (staticWaveforms[selectedTrack.id]) return;
    if (requestsRef.current.has(selectedTrack.id)) return;
    requestsRef.current.add(selectedTrack.id);
    void decodeStaticWaveform(selectedTrack)
      .then((waveform) => {
        if (!waveform) return;
        setStaticWaveforms((current) => ({
          ...current,
          [selectedTrack.id]: waveform,
        }));
      })
      .catch(() => {
        // A static waveform is a nice-to-have; ignore decode failures.
      })
      .finally(() => {
        requestsRef.current.delete(selectedTrack.id);
      });
  }, [selectedTrack, staticWaveforms]);

  return staticWaveforms;
}
