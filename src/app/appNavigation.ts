import type { ProjectSnapshot } from "../types";
import type {
  ActiveStep,
  AudioStageView,
  VisualStageView,
  WorkspaceMode,
} from "./appTypes";

export function stepLabel(step: ActiveStep) {
  return {
    music: "Música",
    visual: "Visual",
    text: "Texto",
    export: "Exportar",
  }[step];
}

export function visualStageLabel(
  visualStageView: VisualStageView,
  activeStep: ActiveStep,
) {
  if (visualStageView === "promotion") return "Divulgação";
  if (visualStageView === "review") return "Visualizar";
  if (visualStageView === "publication-export") return "Exportar Divulgação";
  return stepLabel(activeStep);
}

export function normalizeSnapshotNavigation(snapshot: ProjectSnapshot): {
  workspaceMode: WorkspaceMode;
  audioStageView: AudioStageView;
  visualStageView: VisualStageView;
  activeStep: ActiveStep;
} {
  const legacyAudioStageView = snapshot.audioStageView;
  const legacyVisualStageView = snapshot.visualStageView;
  let workspaceMode: WorkspaceMode =
    snapshot.workspaceMode === "audio" ? "audio" : "visual";
  let audioStageView: AudioStageView =
    legacyAudioStageView === "artwork" ||
    (legacyAudioStageView === "podcast" && snapshot.podcastEnabled === true) ||
    legacyAudioStageView === "catalog" ||
    legacyAudioStageView === "audio-export"
      ? legacyAudioStageView
      : "edit";
  let visualStageView: VisualStageView =
    legacyVisualStageView === "review" || legacyVisualStageView === "videos"
      ? "review"
      : legacyVisualStageView === "promotion"
        ? "promotion"
        : legacyVisualStageView === "publication-export" ||
            legacyVisualStageView === "queue"
          ? "publication-export"
          : "editor";
  let activeStep: ActiveStep =
    snapshot.activeStep === "text" ||
    snapshot.activeStep === "visual" ||
    snapshot.activeStep === "export"
      ? snapshot.activeStep
      : "visual";

  if (legacyAudioStageView === "videos") {
    workspaceMode = "visual";
    audioStageView = "edit";
    visualStageView = "review";
    activeStep = "visual";
  }
  if (
    visualStageView === "publication-export" ||
    visualStageView === "promotion"
  ) {
    activeStep = "export";
  }
  return { workspaceMode, audioStageView, visualStageView, activeStep };
}
