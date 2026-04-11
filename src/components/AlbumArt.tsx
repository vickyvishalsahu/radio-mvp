import Image from "next/image";
import { cn } from "@/lib/cn";

type TAlbumArtProps = {
  src: string;
  alt: string;
  isTransitioning: boolean;
};

export default function AlbumArt({ src, alt, isTransitioning }: TAlbumArtProps) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Image
          src={src}
          alt=""
          fill
          className={cn(
            "scale-110 object-cover blur-[60px] transition-opacity duration-1000 ease-in-out",
            isTransitioning ? "opacity-0" : "opacity-40"
          )}
          sizes="100vw"
        />
      </div>

      <div
        className={cn(
          "relative h-56 w-56 overflow-hidden rounded-lg shadow-2xl shadow-black/50 transition-opacity duration-500 ease-in-out md:h-80 md:w-80",
          isTransitioning ? "opacity-0" : "opacity-100"
        )}
      >
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 224px, 320px"
          priority
        />
      </div>
    </>
  );
}
