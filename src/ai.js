// The AIs Bento can teach with, as the screens need them: names, models and what each is good at, which ones this
// Mac has, which one to fall back to when one can't answer, and how a plan's usage reads in plain words. The same
// list the app itself uses (electron/ai-catalog.json), so the two never disagree.
import CAT from '../electron/ai-catalog.json';

export const PROVIDERS = CAT.providers;
export const GITHUB = CAT.github;
const BY = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));
export const MODELS = PROVIDERS.flatMap((p) => p.models.map((m) => ({ ...m, prov: p.id })));

export const provider = (id) => BY[id] || null;
export const provOf = (model) => {
  const id = String(model || '').split(':')[0];
  return BY[id] ? id : PROVIDERS[0].id;
};
export const modelInfo = (model) => MODELS.find((m) => m.id === model) || null;
export const modelLabel = (model) => modelInfo(model)?.label || BY[provOf(model)].name;
export const providerName = (id) => BY[id]?.name || id;
// an AI that shows its answer only when it's done (so a long wait is normal), by the model's name
export const slowLabel = (label) => MODELS.some((m) => m.label === label && BY[m.prov]?.slow);
// the fast model that answers quick questions for this model's AI
export const fastModel = (model) => BY[provOf(model)].fast;

// providers: { claude: true, codex: false, … } from the app, or null while it's still looking
export const hasAI = (providers) => !providers || PROVIDERS.some((p) => providers[p.id]);
export const noAI = (providers) => !!providers && !PROVIDERS.some((p) => providers[p.id]);
export const firstAI = (providers) => PROVIDERS.find((p) => providers?.[p.id]) || null;
// when this AI can't answer (limit reached, signed out, missing): the next one you have, in Bento's order
export const altOf = (model, providers) => {
  const mine = provOf(model);
  const p = PROVIDERS.find((x) => x.id !== mine && providers?.[x.id]);
  return p ? p.default : null;
};
// the model to use when the chosen one's AI isn't on this Mac
export const usableModel = (model, providers) =>
  !providers || providers[provOf(model)] ? model : firstAI(providers)?.default || model;

// ---------------------------------------------------------------- plan usage, in plain words
// A limits reading from the app: { plan, windows: [{ label, used (0-100), n, of, unit, resetsAt, warn, out }], at }
// The window that matters most: the fullest one
export const mainWindow = (lesson) =>
  (lesson?.windows || [])
    .filter((w) => w.used != null || w.n != null)
    .sort((a, b) => (b.used ?? 0) - (a.used ?? 0))[0] || null;
export const level = (w) =>
  !w
    ? 'none'
    : w.out || (w.used ?? 0) >= 100
      ? 'out'
      : w.warn || (w.used ?? 0) >= 80
        ? 'high'
        : (w.used ?? 0) >= 50
          ? 'mid'
          : 'low';
// "resets Thursday 9:00" / "resets in 2 h" / "resets Dec 1". T translates the fixed words (never the numbers: each
// new string would otherwise be sent off for translation); dates and times come in the Mac's own language.
export function resetText(at, now = Date.now(), translate = (x) => x) {
  if (!at) return '';
  const ms = at - now;
  if (ms <= 0) return translate('resets soon');
  const d = new Date(at);
  if (ms < 3 * 3600e3) {
    const m = Math.round(ms / 60000);
    return m < 60
      ? `${translate('resets in')} ${m} ${translate('min')}`
      : `${translate('resets in')} ${Math.round(m / 60)} ${translate('h')}`;
  }
  const tm = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (ms < 6 * 864e5)
    return new Date(now).toDateString() === d.toDateString()
      ? `${translate('resets at')} ${tm}`
      : `${translate('resets')} ${d.toLocaleDateString(undefined, { weekday: 'long' })} ${tm}`;
  return `${translate('resets')} ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
// "53% of this week" / "12 of 200 requests this month"
export const usedText = (w, translate = (x) => x) =>
  !w
    ? ''
    : w.unlimited
      ? `${translate('unlimited')} ${translate(w.label)}`
      : w.of
        ? `${w.n} ${translate('of')} ${w.of} ${translate(w.unit || 'requests')} ${translate(w.label)}`
        : `${w.used}% ${translate('of')} ${translate(w.label)}`;
// how old a reading is, so a meter never pretends to be live
export const ageText = (at, now = Date.now(), translate = (x) => x) => {
  if (!at) return '';
  const m = Math.round((now - at) / 60000);
  return m < 2
    ? translate('just now')
    : m < 60
      ? `${m} ${translate('min ago')}`
      : m < 1440
        ? `${Math.round(m / 60)} ${translate('h ago')}`
        : `${Math.round(m / 1440)} ${translate('d ago')}`;
};
