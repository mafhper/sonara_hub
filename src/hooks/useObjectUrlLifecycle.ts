import { useEffect, useRef } from "react";
import { collectActiveObjectUrls } from "../../shared/object-url-lifecycle.mjs";
import type { MediaLayerV2, TrackDraft } from "../types";
import { revokeObjectUrl } from "../app/objectUrls";

export function useObjectUrlLifecycle(
  tracks: TrackDraft[],
  cover: { src: string } | null,
  layersUndo: { layers: MediaLayerV2[] } | null,
) {
  const activeObjectUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    const nextUrls = collectActiveObjectUrls(tracks, cover, layersUndo);
    for (const url of activeObjectUrlsRef.current) {
      if (!nextUrls.has(url)) revokeObjectUrl(url);
    }
    activeObjectUrlsRef.current = nextUrls;
  }, [cover, layersUndo, tracks]);

  useEffect(
    () => () => {
      for (const url of activeObjectUrlsRef.current) revokeObjectUrl(url);
      activeObjectUrlsRef.current.clear();
    },
    [],
  );
}
