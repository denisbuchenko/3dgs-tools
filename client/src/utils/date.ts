export function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function formatElapsedTime(startedAt: string, nowMs: number) {
  const startedMs = Date.parse(startedAt);

  if (!Number.isFinite(startedMs)) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} сек`;
  }

  return `${minutes} мин ${seconds.toString().padStart(2, "0")} сек`;
}
