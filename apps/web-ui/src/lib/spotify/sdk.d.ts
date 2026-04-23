// Ambient types for the Spotify Web Playback SDK
// https://developer.spotify.com/documentation/web-playback-sdk/reference

declare namespace Spotify {
  interface Player {
    connect(): Promise<boolean>;
    disconnect(): void;
    addListener(event: "ready", cb: (data: { device_id: string }) => void): void;
    addListener(event: "not_ready", cb: (data: { device_id: string }) => void): void;
    addListener(event: "player_state_changed", cb: (state: PlaybackState | null) => void): void;
    addListener(event: "initialization_error", cb: (data: { message: string }) => void): void;
    addListener(event: "authentication_error", cb: (data: { message: string }) => void): void;
    addListener(event: "account_error", cb: (data: { message: string }) => void): void;
    removeListener(event: string, cb?: (...args: unknown[]) => void): void;
    getCurrentState(): Promise<PlaybackState | null>;
    setVolume(volume: number): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    togglePlay(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    previousTrack(): Promise<void>;
    nextTrack(): Promise<void>;
  }

  interface PlayerConstructorOptions {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Player: new (options: PlayerConstructorOptions) => Player;

  interface PlaybackState {
    context: { uri: string | null; metadata: Record<string, unknown> };
    disallows: Record<string, boolean>;
    duration: number;
    paused: boolean;
    position: number;
    repeat_mode: 0 | 1 | 2;
    shuffle: boolean;
    track_window: {
      current_track: Track;
      previous_tracks: Track[];
      next_tracks: Track[];
    };
  }

  interface Track {
    id: string;
    uri: string;
    name: string;
    duration_ms: number;
    artists: Array<{ name: string; uri: string }>;
    album: {
      name: string;
      uri: string;
      images: Array<{ url: string; height: number; width: number }>;
    };
  }
}

interface Window {
  onSpotifyWebPlaybackSDKReady: () => void;
  Spotify: typeof Spotify;
}
