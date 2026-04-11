"use client";

const getTimeIcon = (): string => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return "☀️";
  if (hour >= 12 && hour < 17) return "🌤";
  if (hour >= 17 && hour < 21) return "🌅";
  return "🌙";
}

export default function ContextBadge() {
  return (
    <div
      className="fixed right-4 top-4 select-none text-base opacity-20"
      suppressHydrationWarning
    >
      {getTimeIcon()}
    </div>
  );
}
