import { useState, type FormEvent } from 'react';
import { env } from '../../lib/env.ts';
import { supabase, USERNAME_RE } from '../../lib/supabase.ts';
import { playAsGuest } from '../../app/session.ts';
import { Shell } from '../components/Shell.tsx';

type Tab = 'login' | 'signup';

export function AuthScreen() {
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [guestName, setGuestName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const sb = supabase;
  if (!sb) {
    return (
      <Shell title="Nation Commander">
        <p className="text-sm text-ink-200">
          O Supabase não está configurado. Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja o README).
        </p>
        {env.allowGuests && <GuestForm name={guestName} setName={setGuestName} />}
      </Shell>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (tab === 'signup') {
        if (!USERNAME_RE.test(username)) throw new Error('O nome de usuário deve ter de 3 a 20 caracteres: letras, números ou _.');
        if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        const { data: available, error: rpcErr } = await sb.rpc('username_available', { name: username });
        if (rpcErr) throw new Error(rpcErr.message);
        if (!available) throw new Error('Este nome de usuário já está em uso.');
        const { data, error: err } = await sb.auth.signUp({
          email,
          password,
          options: { data: { username, display_name: username } },
        });
        if (err) throw err;
        if (!data.session) setInfo('Conta criada. Se a confirmação de e-mail estiver ativa no Supabase, confirme antes de entrar.');
      } else {
        const { error: err } = await sb.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err) {
      setError(translateAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="mb-6 text-center">
        <div className="text-xs font-semibold tracking-[0.3em] text-brass-400">RTS GEOPOLÍTICO 3D</div>
        <h1 className="mt-1 text-3xl font-black tracking-wide">Nation Commander</h1>
        <p className="mt-1 text-xs text-ink-400">Nome de trabalho · protótipo multijogador</p>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded bg-ink-950 p-1" role="tablist">
        {(['login', 'signup'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`rounded px-3 py-2 text-sm font-semibold ${tab === t ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200'}`}
            onClick={() => {
              setTab(t);
              setError(null);
            }}
          >
            {t === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        ))}
      </div>
      <form className="space-y-3" onSubmit={submit}>
        {tab === 'signup' && (
          <div>
            <label className="label" htmlFor="username">
              Nome de usuário
            </label>
            <input id="username" className="field" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">
            E-mail
          </label>
          <input id="email" className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            className="field"
            type="password"
            autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        {error && <p className="text-sm text-red-300">⚠ {error}</p>}
        {info && <p className="text-sm text-ink-200">ℹ {info}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Aguarde…' : tab === 'login' ? 'Entrar' : 'Criar conta e entrar'}
        </button>
      </form>
      {env.allowGuests && <GuestForm name={guestName} setName={setGuestName} />}
    </Shell>
  );
}

function GuestForm({ name, setName }: { name: string; setName: (v: string) => void }) {
  return (
    <form
      className="mt-6 border-t border-ink-700 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        playAsGuest(name.trim() || 'Convidado');
      }}
    >
      <label className="label" htmlFor="guest">
        Ou jogue como convidado (estatísticas não são salvas)
      </label>
      <div className="flex gap-2">
        <input id="guest" className="field" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        <button className="btn">Jogar</button>
      </div>
    </form>
  );
}

function translateAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/already registered/i.test(msg)) return 'Este e-mail já possui conta.';
  if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado.';
  if (/database error saving new user/i.test(msg)) return 'Não foi possível criar o perfil (nome de usuário em uso?).';
  if (/rate limit/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos.';
  return msg;
}
