import { AlertTriangle, FileAudio, Radio, ScrollText } from "lucide-react";

import { PODCAST_VOICE_PROFILES } from "../../shared/podcast-feed.mjs";
import {
  groupPodcastTracks,
  hasEmbeddedPodcastMetadata,
  hasPodcastEpisodeMetadata,
  podcastEpisodeMetadata,
  podcastEpisodeTitle,
  podcastFeedMetadata,
} from "../podcast";
import type { TrackDraft, TrackMetadata } from "../types";
import {
  CheckField,
  InspectorGroup,
  NumberStepField,
  RangeField,
  SelectField,
  TextArea,
  TextField,
} from "./fields";

export function PodcastInspector({
  selectedTrack,
  tracks,
  onChange,
  onSelectTrack,
}: {
  selectedTrack: TrackDraft | null;
  tracks: TrackDraft[];
  onChange: (patch: Partial<TrackMetadata>) => void;
  onSelectTrack: (trackId: string) => void;
}) {
  const groups = groupPodcastTracks(tracks);
  const metadataCount = tracks.filter(hasPodcastEpisodeMetadata).length;
  const selectedEpisode = selectedTrack
    ? podcastEpisodeMetadata(selectedTrack)
    : null;
  const selectedFeed = selectedTrack
    ? podcastFeedMetadata(selectedTrack)
    : null;
  return (
    <>
      <InspectorGroup title="Podcast" open>
        <div className="podcast-inspector-summary">
          <span>
            <Radio /> {groups.length} feed{groups.length === 1 ? "" : "s"}
          </span>
          <span>
            <FileAudio /> {tracks.length} episódio
            {tracks.length === 1 ? "" : "s"}
          </span>
          <span>
            <ScrollText /> {metadataCount} com metadados
          </span>
        </div>
        <p className="helper-copy">
          A guia Podcast separa identidade do feed e dados do episódio para
          preparar sidecars/feed sem misturar metadados de música.
        </p>
      </InspectorGroup>

      <InspectorGroup title="Feed" open scope="track">
        {selectedTrack ? (
          <>
            {!hasEmbeddedPodcastMetadata(selectedTrack) && (
              <div className="quality-callout warning">
                <AlertTriangle />
                <span>
                  Este arquivo não trouxe tags úteis; preencha os campos abaixo
                  antes de gerar sidecars/feed.
                </span>
              </div>
            )}
            {selectedTrack.audioInfo?.metadataPartial && (
              <p className="helper-copy">
                Leitura rápida de podcast: tags iniciais carregadas sem enviar o
                episódio inteiro. Duração/análise completa entram no
                processamento.
              </p>
            )}
            <TextField
              label="Podcast"
              value={selectedFeed?.title ?? selectedTrack.metadata.album}
              onChange={(album) => onChange({ album })}
            />
            <TextField
              label="Autor do feed"
              value={selectedFeed?.author ?? selectedTrack.metadata.albumArtist}
              onChange={(albumArtist) => onChange({ albumArtist })}
            />
            <TextField
              label="Categoria"
              value={selectedFeed?.category ?? selectedTrack.metadata.genre}
              onChange={(genre) => onChange({ genre })}
            />
          </>
        ) : (
          <p className="helper-copy">
            Selecione um episódio na lista para revisar o feed.
          </p>
        )}
      </InspectorGroup>

      <InspectorGroup title="Episódio" open scope="track">
        {selectedTrack ? (
          <>
            <TextField
              label="Título do episódio"
              value={selectedEpisode?.title ?? selectedTrack.metadata.title}
              onChange={(title) => onChange({ title })}
            />
            <div className="two-columns">
              <NumberStepField
                label="Temporada"
                max={99}
                min={1}
                step={1}
                value={selectedEpisode?.seasonNumber ?? 1}
                onChange={(diskNumber) => onChange({ diskNumber })}
              />
              <NumberStepField
                label="Episódio"
                max={999}
                min={1}
                step={1}
                value={selectedEpisode?.episodeNumber ?? 1}
                onChange={(trackNumber) => onChange({ trackNumber })}
              />
            </div>
            <TextField
              label="Apresentador/convidado"
              value={selectedEpisode?.author ?? selectedTrack.metadata.artist}
              onChange={(artist) => onChange({ artist })}
            />
            <TextField
              label="Data"
              value={selectedEpisode?.publishedAt ?? ""}
              onChange={(recordingDate) => onChange({ recordingDate })}
            />
            <TextField
              label="Página do episódio"
              value={selectedTrack.metadata.podcastEpisodeLink}
              onChange={(podcastEpisodeLink) =>
                onChange({ podcastEpisodeLink })
              }
            />
            <TextField
              label="Capa do episódio"
              value={selectedTrack.metadata.podcastEpisodeArtworkUrl}
              onChange={(podcastEpisodeArtworkUrl) =>
                onChange({ podcastEpisodeArtworkUrl })
              }
            />
            <TextArea
              label="Descrição/notas"
              rows={5}
              value={selectedEpisode?.description ?? ""}
              onChange={(description) => onChange({ description })}
            />
            <TextArea
              label="Links de apoio"
              rows={4}
              value={selectedTrack.metadata.podcastEpisodeLinks}
              onChange={(podcastEpisodeLinks) =>
                onChange({ podcastEpisodeLinks })
              }
            />
            <TextField
              label="Link de doação"
              value={selectedTrack.metadata.podcastDonationUrl}
              onChange={(podcastDonationUrl) =>
                onChange({ podcastDonationUrl })
              }
            />
            <TextArea
              label="Transcrição/letra"
              rows={7}
              value={selectedEpisode?.transcript ?? ""}
              onChange={(lyrics) => onChange({ lyrics })}
            />
          </>
        ) : (
          <p className="helper-copy">
            Selecione um episódio na lista para revisar metadados.
          </p>
        )}
      </InspectorGroup>

      <InspectorGroup title="Acabamento" open scope="track">
        {selectedTrack ? (
          <>
            <SelectField
              label="Perfil de voz"
              value={selectedTrack.metadata.podcastVoiceProfile || "natural"}
              onChange={(podcastVoiceProfile) =>
                onChange({ podcastVoiceProfile })
              }
            >
              {PODCAST_VOICE_PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </SelectField>
            <div className="two-columns">
              <CheckField
                label="Remover silêncio"
                checked={Boolean(selectedTrack.metadata.podcastTrimSilence)}
                onChange={(podcastTrimSilence) =>
                  onChange({ podcastTrimSilence })
                }
              />
              <CheckField
                label="Boost de voz"
                checked={Boolean(selectedTrack.metadata.podcastVoiceBoost)}
                onChange={(podcastVoiceBoost) =>
                  onChange({ podcastVoiceBoost })
                }
              />
            </div>
            <RangeField
              label="Velocidade padrão"
              max={1.2}
              min={0.8}
              step={0.05}
              unit="x"
              value={selectedTrack.metadata.podcastPlaybackSpeed || 1}
              onChange={(podcastPlaybackSpeed) =>
                onChange({ podcastPlaybackSpeed })
              }
            />
            <TextField
              label="Insert de abertura"
              value={selectedTrack.metadata.podcastIntroInsert}
              onChange={(podcastIntroInsert) =>
                onChange({ podcastIntroInsert })
              }
            />
            <TextField
              label="Insert de intervalo"
              value={selectedTrack.metadata.podcastAdInsert}
              onChange={(podcastAdInsert) => onChange({ podcastAdInsert })}
            />
            <TextField
              label="Insert de encerramento"
              value={selectedTrack.metadata.podcastOutroInsert}
              onChange={(podcastOutroInsert) =>
                onChange({ podcastOutroInsert })
              }
            />
          </>
        ) : (
          <p className="helper-copy">
            Selecione um episódio para revisar o acabamento.
          </p>
        )}
      </InspectorGroup>

      {tracks.length > 1 && (
        <InspectorGroup title="Episódios detectados">
          <div className="podcast-inspector-list">
            {tracks.map((track) => (
              <button
                className={track.id === selectedTrack?.id ? "selected" : ""}
                key={track.id}
                type="button"
                onClick={() => onSelectTrack(track.id)}
              >
                <span>{podcastEpisodeTitle(track)}</span>
                <small>{episodeListLabel(podcastEpisodeMetadata(track))}</small>
              </button>
            ))}
          </div>
        </InspectorGroup>
      )}
    </>
  );
}

function episodeListLabel(episode: ReturnType<typeof podcastEpisodeMetadata>) {
  const parts = [
    episode.seasonNumber ? `T${episode.seasonNumber}` : "",
    episode.episodeNumber ? `Ep. ${episode.episodeNumber}` : "",
    episode.hasDescription ? "com descrição" : "sem descrição",
    episode.hasTranscript ? "com transcrição" : "sem transcrição",
  ].filter(Boolean);
  return parts.join(" · ");
}
