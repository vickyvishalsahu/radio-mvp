type TProgressBarProps = {
  progress: number;
};

export default function ProgressBar({ progress }: TProgressBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-0.5 bg-white/10">
      <div
        className="h-full bg-white/30 transition-[width] duration-1000 ease-linear"
        style={{ width: `${Math.min(progress * 100, 100)}%` }}
      />
    </div>
  );
}
