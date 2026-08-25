export function formatTimeLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const m = date.getMinutes().toString().padStart(2, "0");
  const s = date.getSeconds().toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function formatPercentage(val: number): string {
  return `${Math.round(val)}%`;
}
