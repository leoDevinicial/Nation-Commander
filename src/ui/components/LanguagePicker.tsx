import { Languages } from 'lucide-react';
import { LANGS, LANG_LABEL, useLangStore, type Lang } from '../../i18n/index.ts';

const FLAG: Record<Lang, string> = { pt: '🇧🇷', en: '🇺🇸', es: '🇪🇸' };

/**
 * Seletor de idioma (04/11), no menu principal e nas configurações. Os nomes ficam sempre no próprio idioma
 * (`translate="no"`): quem caiu num idioma que não lê ainda acha o seu.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  return (
    <label className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`} translate="no" title="Idioma · Language · Idioma">
      <Languages size={compact ? 14 : 16} className="text-ink-300" aria-hidden />
      <select
        className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-ink-100"
        value={lang}
        aria-label="Idioma / Language"
        onChange={(e) => setLang(e.target.value as Lang)}
      >
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {FLAG[l]} {LANG_LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
