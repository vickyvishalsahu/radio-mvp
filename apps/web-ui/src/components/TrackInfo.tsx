import { cn } from "@/lib/cn";

type TTrackInfoProps = {
  title: string;
  artist: string;
  isTransitioning: boolean;
};

export default function TrackInfo({ title, artist, isTransitioning }: TTrackInfoProps) {
  return (
    <div
      className={cn(
        "mt-8 text-center transition-opacity duration-500 ease-in-out",
        isTransitioning ? "opacity-0" : "opacity-100"
      )}
    >
      <p className="font-body text-xl font-medium text-white/90 md:text-2xl">{title}</p>
      <p className="mt-1 font-body text-base text-white/50 md:text-lg">{artist}</p>
    </div>
  );
}
