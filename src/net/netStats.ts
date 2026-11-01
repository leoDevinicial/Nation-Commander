/**
 * KNPS — medições de rede no cliente, só a partir do que o jogo já troca (o ping de vida a cada 2,5 s e os snapshots).
 * Não faz teste de velocidade nem manda tráfego extra.
 *
 * - Ping (RTT): ida e volta da mensagem `ping` até o `pong` (o servidor responde na hora, fora do tick).
 * - Jitter: média da variação entre RTTs seguidos (RFC 3550, sem a suavização).
 * - Pings sem resposta: no WebSocket (TCP) não existe perda visível para o jogo; um ping sem resposta em 5 s indica
 *   atraso grande ou conexão caindo. Não é "packet loss" de UDP e não é chamado assim na tela.
 * - Cadência dos snapshots: intervalo entre chegadas (mediana e p95); o servidor manda 10/s, mais os extras de ordem.
 * - Dados recebidos: tamanho das mensagens já descomprimidas (o navegador não expõe o tamanho comprimido).
 */
export interface NetSummary {
  /** Ping de rede medido pelo servidor (ping de protocolo; sem o tempo da página). */
  netP50: number | null;
  netP95: number | null;
  netJitter: number | null;
  /** Região do servidor conectado (vazia sem configuração). */
  region: string;
  rttP50: number | null;
  rttP95: number | null;
  jitter: number | null;
  /** Fração dos pings recentes sem resposta (0..1). */
  unanswered: number;
  snapshotsPerSec: number;
  gapP50: number | null;
  gapP95: number | null;
  /** kbit/s recebidos (descomprimidos) nos últimos ~10 s. */
  kbps: number;
  quality: 'boa' | 'instável' | 'ruim' | 'medindo';
  reasons: string[];
}

const pct = (a: number[], p: number): number | null => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
};

export class NetStats {
  private rtts: number[] = [];
  private net: number[] = [];
  private region = '';
  private pings: { at: number; answered: boolean }[] = [];
  private arrivals: number[] = [];
  private bytes: { at: number; n: number }[] = [];

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Ping de rede informado pelo servidor (mensagem `net`, a cada 5 s). */
  network(rtt: number, region: string): void {
    if (!(rtt >= 0 && rtt < 60_000)) return;
    this.net.push(rtt);
    if (this.net.length > 24) this.net.shift();
    this.region = region;
  }

  pingSent(): void {
    this.pings.push({ at: this.now(), answered: false });
    if (this.pings.length > 24) this.pings.shift();
  }

  pong(rtt: number): void {
    if (!(rtt >= 0 && rtt < 60_000)) return;
    this.rtts.push(rtt);
    if (this.rtts.length > 40) this.rtts.shift();
    // marca o ping mais antigo ainda sem resposta
    const p = this.pings.find((x) => !x.answered);
    if (p) p.answered = true;
  }

  message(bytes: number, snapshot: boolean): void {
    const t = this.now();
    this.bytes.push({ at: t, n: bytes });
    while (this.bytes.length && t - this.bytes[0]!.at > 10_000) this.bytes.shift();
    if (snapshot) {
      this.arrivals.push(t);
      if (this.arrivals.length > 101) this.arrivals.shift();
    }
  }

  /** Esquece tudo (nova conexão): números de uma conexão antiga não descrevem a atual. */
  reset(): void {
    this.rtts = [];
    this.net = [];
    this.region = '';
    this.pings = [];
    this.arrivals = [];
    this.bytes = [];
  }

  summary(): NetSummary {
    const t = this.now();
    const jitterOf = (a: number[]) => (a.length > 1 ? a.slice(1).reduce((x, r, i) => x + Math.abs(r - a[i]!), 0) / (a.length - 1) : null);
    const jit = jitterOf(this.rtts);
    const netJit = jitterOf(this.net);
    // só conta como sem resposta o ping com mais de 5 s
    const old = this.pings.filter((p) => t - p.at > 5000);
    const unanswered = old.length ? old.filter((p) => !p.answered).length / old.length : 0;
    const recent = this.arrivals.filter((a) => t - a <= 5000);
    const gaps = this.arrivals.slice(1).map((a, i) => a - this.arrivals[i]!);
    const span = this.bytes.length ? Math.max(1000, t - this.bytes[0]!.at) : 1000;
    const kbps = Math.round((this.bytes.reduce((a, b) => a + b.n, 0) * 8) / span);
    const s: NetSummary = {
      netP50: pct(this.net, 0.5),
      netP95: pct(this.net, 0.95),
      netJitter: netJit === null ? null : Math.round(netJit),
      region: this.region,
      rttP50: pct(this.rtts, 0.5),
      rttP95: pct(this.rtts, 0.95),
      jitter: jit === null ? null : Math.round(jit),
      unanswered,
      snapshotsPerSec: Math.round((recent.length / 5) * 10) / 10,
      gapP50: pct(gaps, 0.5),
      gapP95: pct(gaps, 0.95),
      kbps,
      quality: 'medindo',
      reasons: [],
    };
    // com 3+ medidas do servidor, a classificação usa o ping de rede (sem o tempo da página); senão, o da página
    const useNet = this.net.length >= 3;
    if (!useNet && this.rtts.length < 3) return s;
    const p95 = (useNet ? s.netP95 : s.rttP95) ?? 0;
    const jitter = (useNet ? s.netJitter : s.jitter) ?? 0;
    // critérios documentados em docs/knps/KNPS_README.md (não é nota científica; mostra o motivo)
    const bad: string[] = [];
    const shaky: string[] = [];
    if (p95 > 250) bad.push('ping alto');
    if (unanswered > 0.1) bad.push('pings sem resposta');
    if (jitter > 40) shaky.push('ping oscilando');
    if ((s.gapP95 ?? 0) > 300) shaky.push('snapshots chegando em rajadas');
    if (p95 > 150 && !bad.length) shaky.push('ping médio');
    s.quality = bad.length ? 'ruim' : shaky.length ? 'instável' : 'boa';
    s.reasons = [...bad, ...shaky];
    return s;
  }
}
