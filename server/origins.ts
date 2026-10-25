/**
 * Verifica a origem de uma conexão contra a lista de ALLOWED_ORIGINS. Cada item pode conter `*`
 * como curinga (ex.: `https://nation-commander-*.vercel.app` para os previews da Vercel).
 * Lista vazia aceita qualquer origem.
 */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return false;
  const o = origin.replace(/\/+$/, '').toLowerCase();
  return allowed.some((pattern) => {
    const p = pattern.replace(/\/+$/, '').toLowerCase();
    if (!p.includes('*')) return p === o;
    const re = new RegExp(`^${p.split('*').map(escapeRegex).join('[a-z0-9-]*')}$`);
    return re.test(o);
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
