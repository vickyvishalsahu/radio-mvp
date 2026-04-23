import SpotifyAuthButton from "@/components/SpotifyAuthButton";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[600px] w-[600px] rounded-full bg-white/[0.02] blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <h1 className="font-display text-5xl font-light tracking-tight text-white/90 md:text-7xl">
            Radio
          </h1>
          <p className="max-w-xs font-body text-lg font-light text-white/40 md:text-xl">
            One channel. No choices. Just listen.
          </p>
        </div>

        <SpotifyAuthButton />
      </div>
    </main>
  );
}
