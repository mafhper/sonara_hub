import { useState } from "react";
import { AlertTriangle, Download, FileAudio, Radio, Send } from "lucide-react";

import { BatchJobBoard } from "../jobs/BatchJobBoard";
import {
  buildPodcastFeedSidecar,
  buildPodcastRssXml,
  podcastFeedFileStem,
} from "../../shared/podcast-feed.mjs";
import type { PodcastFeedSidecar } from "../../shared/podcast-feed.mjs";
import {
  groupPodcastTracks,
  hasPodcastEpisodeMetadata,
  podcastEpisodeMetadata,
  podcastEpisodeTitle,
} from "../podcast";
import type { PodcastFeedGroup } from "../podcast";
import type { RenderJob, TrackDraft } from "../types";

type PodcastPublicationSettings = {
  audioBaseUrl: string;
  feedLink: string;
  artworkUrl: string;
  ownerName: string;
  ownerEmail: string;
};

const DEFAULT_PODCAST_PUBLICATION_SETTINGS: PodcastPublicationSettings = {
  audioBaseUrl: "",
  feedLink: "",
  artworkUrl: "",
  ownerName: "",
  ownerEmail: "",
};

export function PodcastWorkspace({
  jobs,
  projectName,
  queuePaused,
  selectedTrackId,
  tracks,
  onCancelAllJobs,
  onCancelJob,
  onClearTerminalJobs,
  onCreateFeed,
  onPauseQueue,
  onResumeQueue,
  onSelectTrack,
}: {
  jobs: RenderJob[];
  projectName: string;
  queuePaused: boolean;
  selectedTrackId: string;
  tracks: TrackDraft[];
  onCancelAllJobs: () => void;
  onCancelJob: (id: string) => void;
  onClearTerminalJobs: () => void;
  onCreateFeed: (sidecar: PodcastFeedSidecar) => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
  onSelectTrack: (trackId: string) => void;
}) {
  const [publicationSettings, setPublicationSettings] =
    useState<PodcastPublicationSettings>(DEFAULT_PODCAST_PUBLICATION_SETTINGS);
  const groups = groupPodcastTracks(tracks);
  const metadataCount = tracks.filter(hasPodcastEpisodeMetadata).length;
  const descriptionCount = groups.reduce(
    (total, group) => total + group.descriptionCount,
    0,
  );
  const transcriptCount = groups.reduce(
    (total, group) => total + group.transcriptCount,
    0,
  );
  return (
    <div className="review-stage podcast-stage">
      <header className="review-stage-header">
        <div>
          <span className="overline">Podcast</span>
          <h1>Podcast</h1>
          <p>
            Episódios e feeds detectados a partir dos metadados dos arquivos.
          </p>
        </div>
        <div className="stage-header-actions">
          <span className="status-chip">
            <Radio /> {groups.length} feed{groups.length === 1 ? "" : "s"}
          </span>
          <span className="status-chip">
            <FileAudio /> {tracks.length} episódio
            {tracks.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>
      <section className="stage-surface export-overview">
        <div>
          <span className="overline">Projeto</span>
          <strong>{projectName}</strong>
          <small>Identidade de podcast e metadados por episódio.</small>
        </div>
        <div>
          <span className="overline">Metadados</span>
          <strong>
            {metadataCount}/{tracks.length} episódio
            {tracks.length === 1 ? "" : "s"}
          </strong>
          <small>
            {descriptionCount} com descrição, {transcriptCount} com transcrição.
          </small>
        </div>
      </section>
      <section
        aria-labelledby="podcast-publication-title"
        className="stage-surface podcast-publication-settings"
      >
        <div className="podcast-publication-head">
          <div>
            <span className="overline">Publicação</span>
            <h2 id="podcast-publication-title">URLs públicas</h2>
          </div>
          <small>Aplicado ao RSS, JSON e jobs de feed.</small>
        </div>
        <div className="podcast-publication-grid">
          <label className="podcast-publication-field">
            <span>Base pública dos áudios</span>
            <input
              placeholder="https://cdn.exemplo.com/podcast"
              type="url"
              value={publicationSettings.audioBaseUrl}
              onChange={(event) =>
                setPublicationSettings((current) => ({
                  ...current,
                  audioBaseUrl: event.target.value,
                }))
              }
            />
          </label>
          <label className="podcast-publication-field">
            <span>URL do site/feed</span>
            <input
              placeholder="https://exemplo.com/podcast"
              type="url"
              value={publicationSettings.feedLink}
              onChange={(event) =>
                setPublicationSettings((current) => ({
                  ...current,
                  feedLink: event.target.value,
                }))
              }
            />
          </label>
          <label className="podcast-publication-field">
            <span>Capa pública</span>
            <input
              placeholder="https://exemplo.com/capa.jpg"
              type="url"
              value={publicationSettings.artworkUrl}
              onChange={(event) =>
                setPublicationSettings((current) => ({
                  ...current,
                  artworkUrl: event.target.value,
                }))
              }
            />
          </label>
          <label className="podcast-publication-field">
            <span>Responsável</span>
            <input
              value={publicationSettings.ownerName}
              onChange={(event) =>
                setPublicationSettings((current) => ({
                  ...current,
                  ownerName: event.target.value,
                }))
              }
            />
          </label>
          <label className="podcast-publication-field">
            <span>E-mail do responsável</span>
            <input
              type="email"
              value={publicationSettings.ownerEmail}
              onChange={(event) =>
                setPublicationSettings((current) => ({
                  ...current,
                  ownerEmail: event.target.value,
                }))
              }
            />
          </label>
        </div>
      </section>
      {groups.length === 0 ? (
        <section className="stage-surface podcast-empty">
          <AlertTriangle />
          <div>
            <strong>Nenhum episódio carregado</strong>
            <small>
              Abra um projeto com arquivos de áudio ou mantenha os podcasts em
              `input/` para leitura local sem upload pesado.
            </small>
          </div>
        </section>
      ) : (
        <section className="podcast-feed-list">
          {groups.map((group) => (
            <article
              className="stage-surface podcast-feed-panel"
              key={group.id}
            >
              <header>
                <div>
                  <span className="overline">Feed</span>
                  <h2>{group.name}</h2>
                  <small className="podcast-feed-meta">
                    {group.author || "Autor não informado"}
                    {group.latestPublishedAt
                      ? ` · atualizado em ${group.latestPublishedAt}`
                      : ""}
                  </small>
                </div>
                <div className="podcast-feed-actions">
                  <span className="status-chip">
                    {group.metadataCount}/{group.episodeCount} com metadados
                  </span>
                  <button
                    title={`Gerar job de feed para ${group.name}`}
                    type="button"
                    onClick={() =>
                      onCreateFeed(
                        podcastSidecarForGroup(
                          group,
                          projectName,
                          publicationSettings,
                        ),
                      )
                    }
                  >
                    <Send /> Gerar job
                  </button>
                  <button
                    title={`Baixar RSS de ${group.name}`}
                    type="button"
                    onClick={() =>
                      downloadPodcastRss(
                        group,
                        projectName,
                        publicationSettings,
                      )
                    }
                  >
                    <Download /> RSS
                  </button>
                  <button
                    title={`Baixar JSON de ${group.name}`}
                    type="button"
                    onClick={() =>
                      downloadPodcastSidecar(
                        group,
                        projectName,
                        publicationSettings,
                      )
                    }
                  >
                    <Download /> JSON
                  </button>
                </div>
              </header>
              <div className="podcast-episode-list">
                {group.tracks.map((track) => {
                  const episode = podcastEpisodeMetadata(track);
                  return (
                    <button
                      className={`podcast-episode-row ${
                        track.id === selectedTrackId ? "selected" : ""
                      }`}
                      key={track.id}
                      type="button"
                      onClick={() => onSelectTrack(track.id)}
                    >
                      <span>
                        <strong>{podcastEpisodeTitle(track)}</strong>
                        <small>{episodeSubtitle(episode)}</small>
                      </span>
                      <span className="podcast-episode-badges">
                        <small>
                          {episode.hasDescription
                            ? "descrição"
                            : "sem descrição"}
                        </small>
                        <small>
                          {episode.hasTranscript
                            ? "transcrição"
                            : "sem transcrição"}
                        </small>
                      </span>
                      <em>{formatEpisodeDuration(episode.durationSeconds)}</em>
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      )}
      <BatchJobBoard
        emptyCopy="Ao gerar feeds, cada RSS aparece aqui com histórico, mensagens e links finais."
        jobs={jobs}
        kind="podcast-feed"
        queuePaused={queuePaused}
        title="Publicação de podcast"
        onCancelAll={onCancelAllJobs}
        onCancelJob={onCancelJob}
        onClearTerminal={onClearTerminalJobs}
        onPause={onPauseQueue}
        onResume={onResumeQueue}
      />
    </div>
  );
}

function episodeSubtitle({
  episodeNumber,
  publishedAt,
  seasonNumber,
}: ReturnType<typeof podcastEpisodeMetadata>) {
  const parts = [
    seasonNumber ? `T${seasonNumber}` : "",
    episodeNumber ? `Ep. ${episodeNumber}` : "",
    publishedAt || "sem data",
  ].filter(Boolean);
  return parts.join(" · ");
}

function formatEpisodeDuration(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const safe = Math.max(0, Math.round(Number(seconds)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function downloadPodcastRss(
  group: PodcastFeedGroup<TrackDraft>,
  projectName: string,
  publicationSettings: PodcastPublicationSettings,
) {
  const sidecar = podcastSidecarForGroup(
    group,
    projectName,
    publicationSettings,
  );
  downloadTextFile(
    sidecar.rss.fileName,
    "application/rss+xml;charset=utf-8",
    buildPodcastRssXml(sidecar),
  );
}

function downloadPodcastSidecar(
  group: PodcastFeedGroup<TrackDraft>,
  projectName: string,
  publicationSettings: PodcastPublicationSettings,
) {
  const sidecar = podcastSidecarForGroup(
    group,
    projectName,
    publicationSettings,
  );
  downloadTextFile(
    `${podcastFeedFileStem(group)}.podcast.json`,
    "application/json;charset=utf-8",
    JSON.stringify(sidecar, null, 2),
  );
}

function podcastSidecarForGroup(
  group: PodcastFeedGroup<TrackDraft>,
  projectName: string,
  publicationSettings: PodcastPublicationSettings,
) {
  return buildPodcastFeedSidecar(
    group,
    podcastExportOptions(group, projectName, publicationSettings),
  );
}

function podcastExportOptions(
  group: PodcastFeedGroup<TrackDraft>,
  projectName: string,
  publicationSettings: PodcastPublicationSettings,
) {
  const audioBaseUrl = textValue(publicationSettings.audioBaseUrl);
  const feedLink = textValue(publicationSettings.feedLink);
  return {
    audioBaseUrl: audioBaseUrl || ".",
    artworkUrl: textValue(publicationSettings.artworkUrl),
    feedDescription: podcastFeedDescription(group, projectName),
    feedLink,
    guidBaseUrl: feedLink || audioBaseUrl,
    ownerEmail: textValue(publicationSettings.ownerEmail),
    ownerName: textValue(publicationSettings.ownerName),
  };
}

function textValue(value: string) {
  return value.trim();
}

function podcastFeedDescription(
  group: PodcastFeedGroup<TrackDraft>,
  projectName: string,
) {
  const firstEpisodeDescription = group.tracks
    .map((track) => podcastEpisodeMetadata(track).description)
    .find(Boolean);
  return (
    firstEpisodeDescription ||
    `${group.name} - ${group.episodeCount} episódio${group.episodeCount === 1 ? "" : "s"} em ${projectName}.`
  );
}

function downloadTextFile(fileName: string, mimeType: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
