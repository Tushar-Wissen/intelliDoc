export function formatBytes(content) {
  let bytes = 0;
  if (typeof content === 'number') {
    bytes = content;
  } else if (content) {
    bytes = new Blob([content]).size;
  }
  if (!bytes) return '0 KB';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// Size already expressed in MB (e.g. the API's fileSizeMb), e.g. "0.34 MB", "12.5 MB".
export function formatMegabytes(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const mb = Number(value);
  if (mb > 0 && mb < 0.01) return '< 0.01 MB';
  return `${mb >= 10 ? mb.toFixed(1) : mb.toFixed(2)} MB`;
}

export function estimatePageCount(content) {
  if (!content) return 1;
  return Math.max(1, Math.ceil(content.length / 3000));
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// e.g. "22 Sep 2026, 10:24 AM"
export function formatDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '—';
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${formatDate(value)}, ${time}`;
}
