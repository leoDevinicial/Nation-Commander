import { LanguagePicker } from '../components/LanguagePicker.tsx';
import { ArrowRight, BookOpen, Bot, Check, FileDown, Flag, FlaskConical, Globe, GraduationCap, Info, LogOut, Megaphone, MessagesSquare, Play, Settings, Users, type LucideIcon } from 'lucide-react';
import { markTutorial, tutorialSeen } from '../../state/useTutorialStore.ts';
import { useState } from 'react';
import { gameClient } from '../../net/client.ts';
import { localAdvisorStore, type Advice } from '../../game/perf/advisor.ts';
import { PRESET_LABELS } from '../../lib/graphics.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
import { preferredCountry, signOut } from '../../app/session.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { countryName } from '../../../shared/data/countries.ts';
import { GAME_TITLE } from '../../../shared/version.ts';
import { ConnectionBadge } from '../components/ConnectionBadge.tsx';
import { RegionPicker } from '../components/RegionPicker.tsx';
import { prepareJoin, prepareNewRoom } from '../../net/regionFlow.ts';
import { Frame } from '../components/Frame.tsx';
import { NationBadge } from '../components/NationBadge.tsx';
import { CHANGELOG } from '../changelog.ts';
import { guideUrl } from '../manual.ts';
import { useLangStore } from '../../i18n/index.ts';
import { ChangelogPopup, playerKeys } from '../components/ChangelogPopup.tsx';
import { autoFullscreen, FullscreenButton } from '../components/FullscreenButton.tsx';

/**
 * Menu inicial (16/11, maquete aprovada em `docs/ui_maquete/9–11`): o globo de fundo vira o cenário da tela inteira, com
 * o título grande por cima, uma ação principal (Jogar contra a IA) e Multijogador ao lado; os modos em cartões embaixo;
 * as novidades à vista com o link para o changelog; atalhos, idioma, servidor e perfil numa barra discreta em cima.
 */
export function MenuScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const status = useAppStore((s) => s.connStatus);
  const user = useAppStore((s) => s.serverUser);
  const profile = useAppStore((s) => s.profile);
  const guest = useAppStore((s) => s.guest);
  const [code, setCode] = useState('');
  const online = status === 'connected';
  const offlineHint = online ? undefined : 'Aguardando conexão com o servidor de jogo';
  const name = user?.name ?? profile?.display_name ?? guest?.name ?? '—';
  const country = preferredCountry();

  // primeira visita (07/11): convite para o tutorial, até jogar ou dispensar
  const [invite, setInvite] = useState(() => !tutorialSeen());
  const create = async (mode: 'pvp' | 'vs_ai' | 'sandbox' | 'tutorial') => {
    autoFullscreen();
    // KNPS-08: a sala nasce na região de menor ping (com várias regiões configuradas)
    if (!(await prepareNewRoom())) return;
    gameClient.send({ t: 'create_room', mode, countryId: country });
  };
  const join = async () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 5) return;
    autoFullscreen();
    if (!(await prepareJoin(c))) return;
    gameClient.send({ t: 'join_room', code: c, countryId: country });
  };
  const latest = CHANGELOG[0];
  const sinceLast = CHANGELOG.slice(
    0,
    Math.max(
      1,
      CHANGELOG.findIndex((v) => v.version === '1.2'),
    ),
  ).reduce((a, v) => a + v.items.length, 0);

  return (
    <div className="menu relative z-10 h-full w-full overflow-y-auto">
      {/* novidades: uma vez por jogador a cada versão (16/11) */}
      {/* a chave vem do login no aparelho: aparece mesmo com o servidor de jogo fora do ar ou reiniciando (20/11) */}
      <ChangelogPopup players={playerKeys(profile, guest, user)} onOpenAll={() => setScreen('feedback')} />
      {/* o globo fica à direita (GlobeBackdrop "hero"); o degradê deixa o texto legível por cima */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,var(--color-ink-950)_14%,rgb(5_8_12/0.72)_45%,transparent_72%),linear-gradient(0deg,rgb(5_8_12/0.9),transparent_38%)]"
      />
      <div className="relative mx-auto flex min-h-full max-w-[1600px] flex-col gap-4 px-4 py-3 sm:px-8 sm:py-5 xl:px-11 [@media(max-height:520px)]:gap-2 [@media(max-height:520px)]:py-2">
        {/* barra de cima */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-7 w-7 place-items-center bg-gradient-to-b from-[#f0c766] to-brass-400 text-ink-950"
              style={{
                clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
              }}
              aria-hidden
            >
              <Globe size={16} />
            </span>
            <span className="font-display text-sm font-bold tracking-[0.22em] text-ink-200 uppercase max-sm:hidden" translate="no">
              Nation Commander
            </span>
          </div>
          <nav className="ml-auto flex flex-wrap items-center gap-0.5 max-sm:order-last max-sm:ml-0 max-sm:w-full max-sm:justify-between" aria-label="Atalhos do menu">
            <NavItem
              icon={MessagesSquare}
              label="Comunidade"
              disabled={!online}
              title={online ? 'Converse com outros comandantes que gostam do jogo' : offlineHint}
              onClick={() => setScreen('community')}
            />
            <NavItem icon={Megaphone} label="Novidades" dot title="O que mudou no jogo e o espaço para mandar a sua opinião" onClick={() => setScreen('feedback')} />
            <NavItem icon={BookOpen} label="Manual" title="O básico do jogo em 8 cartões curtos" onClick={() => setScreen('manual')} />
            <GuideDownload />
            <NavItem icon={Settings} label="Configurações" onClick={() => setScreen('settings')} />
            <NavItem icon={Info} label="Créditos" onClick={() => setScreen('credits')} />
            <span className="px-1">
              <LanguagePicker compact short />
            </span>
            <FullscreenButton />
          </nav>
          <div className="flex items-center gap-3 border-l border-ink-700 pl-3 max-sm:ml-auto">
            <span className="max-lg:hidden">
              <ConnectionBadge />
            </span>
            <button
              className="flex items-center gap-2 text-left disabled:cursor-default"
              onClick={() => setScreen('profile')}
              disabled={!profile}
              title={profile ? 'Perfil e estatísticas' : 'Perfil disponível para contas registradas'}
            >
              <NationBadge slot={0} countryId={country} size="sm" />
              <span className="leading-tight">
                <span className="block text-sm font-bold" translate="no">
                  {name}
                </span>
                <span className="block text-[11px] text-ink-400 [@media(max-height:520px)]:hidden">
                  {guest ? 'Convidado' : 'Perfil'} · {countryName(country)}
                </span>
              </span>
            </button>
            <button className="nc-icon-btn" onClick={() => void signOut()} title="Sair da conta" aria-label="Sair da conta">
              <LogOut size={15} aria-hidden />
            </button>
          </div>
        </header>

        {/* herói */}
        <section className="flex max-w-[640px] flex-1 flex-col justify-center py-2">
          <div className="flex items-center gap-2.5 font-display text-[11px] font-semibold tracking-[0.3em] text-brass-400 uppercase sm:text-xs">
            <span className="h-0.5 w-7 bg-brass-400" aria-hidden />
            {GAME_TITLE}
          </div>
          <h1 className="mt-3 font-display text-5xl leading-[0.92] font-bold tracking-wide text-ink-100 uppercase drop-shadow-[0_6px_30px_rgb(0_0_0/0.6)] sm:text-7xl xl:text-[5.4rem] [@media(max-height:520px)]:mt-1 [@media(max-height:520px)]:text-4xl">
            Comande
            <br />
            uma <span className="text-brass-400">nação</span>
          </h1>
          <p className="mt-4 max-w-[520px] text-base text-ink-300 sm:text-lg [@media(max-height:520px)]:hidden">
            Construa a economia, governe as cidades, ganhe aliados e vença a guerra num mapa vivo, da Guerra Fria ao futuro próximo.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 [@media(max-height:520px)]:mt-3">
            <button className="btn btn-primary btn-hero menu-cta" disabled={!online} title={offlineHint} onClick={() => void create('vs_ai')}>
              <Play size={20} aria-hidden /> Jogar contra a IA
            </button>
            <button className="btn btn-hero menu-cta" disabled={!online} title={offlineHint} onClick={() => setScreen('rooms')}>
              <Users size={18} aria-hidden /> Multijogador
            </button>
          </div>
          {invite && (
            <div
              className="mt-4 flex max-w-[560px] flex-wrap items-center gap-2 border border-brass-400/50 bg-brass-400/[0.07] px-3 py-2"
              style={{
                clipPath: 'polygon(7px 0, 100% 0, 100% 100%, 0 100%, 0 7px)',
              }}
            >
              <GraduationCap size={16} className="text-brass-400" aria-hidden />
              <span className="min-w-0 flex-1 text-sm text-ink-200">Primeira vez no comando? Um tutorial narrado de uns 15 minutos.</span>
              <button className="btn btn-primary min-h-8 px-3 text-xs" disabled={!online} title={offlineHint} onClick={() => void create('tutorial')}>
                Começar o tutorial
              </button>
              <button
                className="btn min-h-8 px-3 text-xs"
                onClick={() => {
                  markTutorial('skipped');
                  setInvite(false);
                }}
              >
                Agora não
              </button>
            </div>
          )}
          <div className="mt-3 max-w-[560px]">
            <PresetAdvice />
          </div>
        </section>

        {/* modos e novidades */}
        <section className="grid gap-3 lg:grid-cols-[1fr_360px] lg:items-end">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <ModeCard main icon={Bot} title="Contra a IA" text="Você contra governos da IA, do Fácil ao Brutal." disabled={!online} onClick={() => void create('vs_ai')} />
            <Frame className="min-w-0" innerClassName="flex h-full flex-col gap-1.5 p-3 sm:p-3.5">
              <button className="flex flex-col items-start gap-1.5 text-left disabled:opacity-60" disabled={!online} title={offlineHint} onClick={() => setScreen('rooms')}>
                <ModeIcon icon={Globe} />
                <span className="font-display text-base font-bold tracking-wider uppercase">Multijogador</span>
                <span className="text-xs text-ink-400 [@media(max-height:520px)]:hidden">Salas públicas ou privadas, com amigos e bots.</span>
              </button>
              <form
                className="mt-auto flex gap-1.5 [@media(max-height:520px)]:hidden"
                onSubmit={(e) => {
                  e.preventDefault();
                  void join();
                }}
              >
                <input
                  className="field min-w-0 py-1 font-mono text-xs tracking-[0.3em] uppercase"
                  placeholder="CÓDIGO"
                  aria-label="Código da sala"
                  value={code}
                  maxLength={5}
                  autoCapitalize="characters"
                  onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                />
                <button className="btn min-h-7 shrink-0 px-2 text-xs" disabled={!online || code.length !== 5} title={offlineHint}>
                  Entrar
                </button>
              </form>
              <button
                className="text-left text-[11px] font-semibold text-brass-400 hover:text-ink-100 disabled:opacity-60 [@media(max-height:520px)]:hidden"
                disabled={!online}
                title="Gera um código para convidar outro comandante"
                onClick={() => void create('pvp')}
              >
                <Flag size={12} className="mr-1 inline-block align-[-2px]" aria-hidden />
                Criar sala privada
              </button>
            </Frame>
            <ModeCard icon={GraduationCap} title="Tutorial" text="Partida guiada e narrada: aprenda em 15 minutos." disabled={!online} onClick={() => void create('tutorial')} />
            <ModeCard icon={FlaskConical} title="Sandbox" text="Recursos ilimitados e tudo liberado para testar." disabled={!online} onClick={() => void create('sandbox')} />
          </div>
          {latest && (
            <Frame className="max-lg:hidden [@media(max-height:620px)]:hidden" innerClassName="flex flex-col gap-2 p-3.5">
              <div className="flex items-center gap-2">
                <span className="nc-kicker flex items-center gap-1.5">
                  <span className="h-0.5 w-2.5 bg-brass-400" aria-hidden />
                  Novidades
                </span>
                <span className="nc-num rounded-[2px] bg-brass-400 px-1.5 py-px text-[11px] font-bold text-ink-950">v{latest.version}</span>
                <span className="ml-auto text-[11px] text-ink-400">{latest.date}</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {latest.items.slice(0, 3).map((it) => (
                  <li key={it} className="flex gap-2 text-xs text-ink-200">
                    <Check size={14} className="mt-px shrink-0 text-brass-400" aria-hidden />
                    <span className="line-clamp-2">{it}</span>
                  </li>
                ))}
              </ul>
              <button className="flex items-center gap-1 text-left text-xs font-semibold text-brass-400 hover:text-ink-100" onClick={() => setScreen('feedback')}>
                {`Ver tudo o que mudou (${sinceLast} novidades)`} <ArrowRight size={13} aria-hidden />
              </button>
            </Frame>
          )}
        </section>
        <div className="flex items-center gap-4 text-[11px] text-ink-500 lg:hidden">
          <ConnectionBadge />
          <RegionPicker />
        </div>
        <div className="hidden lg:block">
          <RegionPicker />
        </div>
      </div>
    </div>
  );
}

/** Baixa o Guia do Comandante (PDF) no idioma da tela. */
function GuideDownload() {
  const lang = useLangStore((s) => s.lang);
  const url = guideUrl(lang);
  return (
    <a
      className="flex h-8 items-center gap-1.5 rounded-[3px] px-2 text-[13px] sm:px-2.5 font-semibold text-ink-300 hover:bg-white/5 hover:text-ink-100"
      href={url}
      download={url.split('/').pop()}
      title="Baixar o Guia do Comandante completo (PDF)"
      aria-label="Guia em PDF"
    >
      <FileDown size={15} aria-hidden />
      <span className="max-xl:hidden">Guia em PDF</span>
    </a>
  );
}

function NavItem({ icon: Icon, label, onClick, disabled, title, dot }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; title?: string; dot?: boolean }) {
  return (
    <button
      className="flex h-8 items-center gap-1.5 rounded-[3px] px-2 text-[13px] sm:px-2.5 font-semibold text-ink-300 hover:bg-white/5 hover:text-ink-100 disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
    >
      <Icon size={15} aria-hidden />
      <span className="max-xl:hidden">{label}</span>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-brass-400 shadow-[0_0_8px_rgb(226_181_77/0.6)]" aria-hidden />}
    </button>
  );
}

function ModeIcon({ icon: Icon, main }: { icon: LucideIcon; main?: boolean }) {
  return (
    <span
      className={`grid h-8 w-8 place-items-center rounded-[3px] border ${main ? 'border-[#f5d68a] bg-gradient-to-b from-[#f0c766] to-brass-400 text-ink-950' : 'border-ink-600 bg-brass-400/5 text-brass-400'}`}
      aria-hidden
    >
      <Icon size={17} />
    </span>
  );
}

function ModeCard({ icon, title, text, onClick, disabled, main }: { icon: LucideIcon; title: string; text: string; onClick: () => void; disabled?: boolean; main?: boolean }) {
  return (
    <Frame className="min-w-0" innerClassName={`h-full ${main ? 'bg-[linear-gradient(180deg,rgb(226_181_77/0.16),rgb(10_14_20/0.92))]' : ''}`}>
      <button
        className="flex h-full w-full flex-col items-start gap-1.5 p-3 text-left disabled:opacity-60 sm:p-3.5"
        disabled={disabled}
        title={disabled ? 'Aguardando conexão com o servidor de jogo' : undefined}
        onClick={onClick}
      >
        <ModeIcon icon={icon} main={main} />
        <span className="font-display text-base font-bold tracking-wider uppercase">{title}</span>
        <span className="text-xs text-ink-400 [@media(max-height:520px)]:hidden">{text}</span>
      </button>
    </Frame>
  );
}

/**
 * Consultor de preset (KAICS Adaptables+ · C6): depois de uma partida que passou a maior parte do
 * tempo abaixo da meta, recomenda outro preset com motivo e números. Nunca troca sozinho.
 */
function PresetAdvice() {
  const quality = useSettingsStore((s) => s.quality);
  const update = useSettingsStore((s) => s.update);
  const [advice, setAdvice] = useState<Advice | null>(() => localAdvisorStore().advice());
  // o jogador já trocou de preset por conta própria: a recomendação perdeu o sentido
  if (!advice || advice.from !== quality) return null;
  const close = () => {
    localAdvisorStore().saveAdvice(null);
    setAdvice(null);
  };
  return (
    <div className="mb-4 rounded border border-brass-400/50 bg-ink-850/90 p-3 text-sm" role="status">
      <div className="font-semibold text-brass-400">Desempenho na última partida</div>
      <p className="mt-1 text-xs text-ink-200">{advice.reason}</p>
      <p className="mt-1 text-xs text-ink-200">
        Recomendado para a próxima: <b className="text-ink-100">{PRESET_LABELS[advice.to]}</b> — {advice.basis}. Os presets mudam só o visual, nunca as regras.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="btn btn-primary min-h-9 px-3"
          onClick={() => {
            update({ quality: advice.to });
            close();
          }}
        >
          Usar {PRESET_LABELS[advice.to]}
        </button>
        <button className="btn min-h-9 px-3" onClick={close}>
          Manter {PRESET_LABELS[advice.from]}
        </button>
      </div>
    </div>
  );
}
