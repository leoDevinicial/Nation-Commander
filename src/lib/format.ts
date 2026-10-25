export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const nf = (digits: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** US$ compacto: "US$ 2,28 tri", "US$ 950 bi", "US$ 3,9 bi". */
export function formatUsd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return `US$ ${nf(2).format(v / 1e12)} tri`;
  if (a >= 1e9) return `US$ ${nf(a >= 1e11 ? 0 : 1).format(v / 1e9)} bi`;
  if (a >= 1e6) return `US$ ${nf(1).format(v / 1e6)} mi`;
  return `US$ ${nf(0).format(v)}`;
}

/** Inteiro compacto: "212,8 mi", "1,46 bi", "762 mil". */
export function formatCount(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf(2).format(v / 1e9)} bi`;
  if (a >= 1e6) return `${nf(1).format(v / 1e6)} mi`;
  if (a >= 1e3) return `${nf(0).format(v / 1e3)} mil`;
  return nf(0).format(v);
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${nf(digits).format(v)}%`;
}

export function formatSigned(v: number, digits = 1, suffix = ''): string {
  const s = nf(digits).format(Math.abs(v));
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${s}${suffix}`;
}

export function formatNumber(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return nf(digits).format(v);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
