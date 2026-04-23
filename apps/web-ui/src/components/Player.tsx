"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { strings } from "@/lib/strings";
import type { Track, Quote, DominantColor } from "@/lib/types";
import { extractDominantColor } from "@/lib/colors";
import { DEFAULT_DOMINANT_COLOR } from "@/lib/constants";
import AlbumArt from "./AlbumArt";
import TrackInfo from "./TrackInfo";
import QuoteRotator from "./QuoteRotator";
import ProgressBar from "./ProgressBar";
import ContextBadge from "./ContextBadge";
import SpotifyAttribution from "./SpotifyAttribution";

type TPlayerProps = {
  track: Track | null;
  quotes: Quote[];
  progress?: number;
  paused?: boolean;
  onTogglePlay?: () => void;
  onNext?: () => void;
};

export default function Player({
  track,
  quotes,
  progress = 0,
  paused = false,
  onTogglePlay,
  onNext,
}: TPlayerProps) {
  const [dominantColor, setDominantColor] = useState<DominantColor>(DEFAULT_DOMINANT_COLOR);

  const albumArtUrl = track?.albumArtUrl;
  useEffect(() => {
    if (!albumArtUrl) return;
    extractDominantColor(albumArtUrl).then(setDominantColor);
  }, [albumArtUrl]);

  if (!track) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-surface">
        <p className="font-display text-xl font-light text-white/40">
          {strings.radio.tuningIn}
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-surface">
      <a
        href="/api/auth/signout"
        className="absolute left-4 top-4 text-white/40 transition-colors hover:text-white/90"
        aria-label="Sign out"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
        </svg>
      </a>
      <div
        className="pointer-events-none absolute inset-0 transition-colors duration-[3000ms] ease-in-out"
        style={{
          backgroundColor: `rgb(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b})`,
          mixBlendMode: "soft-light",
          opacity: 0.2,
        }}
      />

      <AlbumArt
        src={track.albumArtUrl}
        alt={`${track.title} by ${track.artist}`}
        isTransitioning={false}
      />

      <TrackInfo
        title={track.title}
        artist={track.artist}
        isTransitioning={false}
      />

      <div className="mt-8 flex items-center gap-8">
        <button
          onClick={onTogglePlay}
          className="text-white/60 transition-colors hover:text-white/90"
          aria-label={paused ? "Play" : "Pause"}
        >
          {paused ? (
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          )}
        </button>

        <button
          onClick={onNext}
          className="text-white/60 transition-colors hover:text-white/90"
          aria-label="Next track"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z" />
          </svg>
        </button>
      </div>

      <div className={cn("absolute bottom-24 left-0 right-0 flex justify-center")}>
        <QuoteRotator quotes={quotes} />
      </div>

      <ContextBadge />
      <SpotifyAttribution />
      <ProgressBar progress={progress} />
    </div>
  );
}
