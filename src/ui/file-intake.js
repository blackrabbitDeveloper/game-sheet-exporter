export const MAX_FILE_SIZE = 25 * 1024 * 1024;

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

export function deriveOutputName(filename) {
  const base = String(filename || 'output').replace(/\.[^.]+$/, '').trim() || 'output';
  return `${base}-processed`;
}

export function validateFile(file, { accept = '', maxSize = MAX_FILE_SIZE } = {}) {
  if (!file) return { ok: false, message: '파일을 선택해 주세요.' };
  if (file.size > maxSize) return { ok: false, message: `파일 크기는 ${formatBytes(maxSize)} 이하여야 합니다.` };
  const accepted = accept.split(',').map((value) => value.trim()).filter(Boolean);
  if (accepted.length && !accepted.some((rule) => matchesAccept(file, rule))) {
    return { ok: false, message: '지원하지 않는 파일 형식입니다.' };
  }
  return { ok: true, message: '' };
}

function matchesAccept(file, rule) {
  if (rule.startsWith('.')) return file.name.toLowerCase().endsWith(rule.toLowerCase());
  if (rule.endsWith('/*')) return file.type.startsWith(rule.slice(0, -1));
  return file.type === rule;
}
