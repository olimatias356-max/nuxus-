// Formatting helpers (Spanish, LATAM conventions).
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function formatMoney(minor: number, currency: string, decimals = currency === 'PYG' ? 0 : 2): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const units = Math.floor(abs / 10 ** decimals).toString();
  const cents = decimals > 0 ? ',' + (abs % 10 ** decimals).toString().padStart(decimals, '0') : '';
  const value = `${group(units)}${cents}`;
  const sign = negative ? '−' : '';
  switch (currency) {
    case 'PYG':
      return `${sign}${value} Gs`;
    case 'BRL':
      return `${sign}R$ ${value}`;
    case 'ARS':
      return `${sign}$ ${value}`;
    default:
      return `${sign}${value} ${currency}`;
  }
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.', ',')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace('.', ',')}K`;
  return String(n);
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'ahora';
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)} h`;
  if (diff < 7 * 86400) return `hace ${Math.round(diff / 86400)} d`;
  return formatDate(iso);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

export function formatDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function initials(name: string): string {
  const parts = name.replace(/[._]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}
