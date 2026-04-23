"use client";

import { useState, useEffect, useRef } from "react";
import type { Track } from "@/lib/types";
import {
  SPOTIFY_SDK_URL,
  SPOTIFY_SDK_SCRIPT_SELECTOR,
  SPOTIFY_PLAYER_NAME,
} from "@/lib/constants";
import { getCookieValue } from "@/utils/cookies";

type TPlayerState = {
  track: Track | null;
  position: number;
  duration: number;
  paused: boolean;
  isLoading: boolean;
  error: string | null;
};

const INITIAL_STATE: TPlayerState = {
  track: null,
  position: 0,
  duration: 0,
  paused: true,
  isLoading: true,
  error: null,
};

const spotifyTrackToTrack = (sdkTrack: Spotify.Track): Track => ({
  id: sdkTrack.id,
  title: sdkTrack.name,
  artist: sdkTrack.artists.map((artist) => artist.name).join(", "),
  albumArtUrl: sdkTrack.album.images[0]?.url ?? "",
  durationMs: sdkTrack.duration_ms,
});

const loadSdkScript = (): void => {
  if (document.querySelector(SPOTIFY_SDK_SCRIPT_SELECTOR)) return;
  const script = document.createElement("script");
  script.src = SPOTIFY_SDK_URL;
  document.body.appendChild(script);
};

export const useSpotifyPlayer = () => {
  const [state, setState] = useState<TPlayerState>(INITIAL_STATE);
  const playerRef = useRef<Spotify.Player | null>(null);

  useEffect(() => {
    const token = getCookieValue("spotify_access_token");
    if (!token) return;

    const initPlayer = () => {
      const player = new window.Spotify.Player({
        name: SPOTIFY_PLAYER_NAME,
        getOAuthToken: (cb) => cb(token!),
        volume: 0.8,
      });

      playerRef.current = player;

      player.addListener("initialization_error", ({ message }) => {
        setState((s) => ({ ...s, isLoading: false, error: message }));
      });

      player.addListener("authentication_error", ({ message }) => {
        setState((s) => ({ ...s, isLoading: false, error: message }));
      });

      player.addListener("account_error", ({ message }) => {
        setState((s) => ({ ...s, isLoading: false, error: message }));
      });

      player.addListener("ready", ({ device_id }) => {
        fetch("/api/spotify/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id }),
        })
          .then((res) => {
            if (!res.ok) {
              return res.json().then((body) => {
                setState((s) => ({
                  ...s,
                  isLoading: false,
                  error: body?.error ?? "playback_start_failed",
                }));
              });
            }
          })
          .catch(() => {
            setState((s) => ({
              ...s,
              isLoading: false,
              error: "playback_start_failed",
            }));
          });
      });

      player.addListener("player_state_changed", (sdkState) => {
        if (!sdkState) return;
        setState({
          track: spotifyTrackToTrack(sdkState.track_window.current_track),
          position: sdkState.position,
          duration: sdkState.duration,
          paused: sdkState.paused,
          isLoading: false,
          error: null,
        });
      });

      player.connect();
    };

    window.onSpotifyWebPlaybackSDKReady = initPlayer;

    if (window.Spotify) {
      initPlayer();
    } else {
      loadSdkScript();
    }
  }, []);

  const next = () => playerRef.current?.nextTrack();
  const togglePlay = () => playerRef.current?.togglePlay();

  return { ...state, next, togglePlay };
};
