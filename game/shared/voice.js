// ============================================================
// Jacob's thoughts, spoken. The browser's own speech voices read his
// lines, the Book comes back in a softer voice (his mother's, the way
// he remembers it), and the gossip-flies whisper. While a thought is
// spoken the world's sound drops and muffles, so it sits in his head.
// Nothing is downloaded; what's available depends on the computer.
// ============================================================
export const voice = {
  ok: typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
  list: [], cur: null, token: 0, onEnd: null, timer: 0,
  settings: { on: true, vol: 0.9, jacob: '', book: '', auto: false },
  duck: null,          // set by the game: (on) => muffle the world or let it back in
};
try { Object.assign(voice.settings, JSON.parse(localStorage.getItem('farm-of-rust-voice') || '{}')); } catch (e) { /* storage unavailable */ }
export function saveVoice() { try { localStorage.setItem('farm-of-rust-voice', JSON.stringify(voice.settings)); } catch (e) { /* storage unavailable */ } }

// best guesses first: natural Australian voices in Edge, then Windows, Mac and Chrome's own, then any English voice
const VOICE_PREF = {
  jacob: [/William.*Natural/i, /James.*Austral/i, /\bLee\b/i, /Austral.*\bmale\b/i, /Ryan.*Natural/i, /Thomas.*Natural/i, /Guy.*Natural/i, /Christopher.*Natural/i, /Eric.*Natural/i,
    /Google UK English Male/i, /\bDaniel\b/i, /\bArthur\b/i, /\bGeorge\b/i, /\bDavid\b/i, /\bMark\b/i, /\bAlex\b/i, /\bFred\b/i],
  book: [/Natasha.*Natural/i, /Annette.*Natural/i, /Catherine.*Austral/i, /\bKaren\b/i, /Sonia.*Natural/i, /Libby.*Natural/i, /Aria.*Natural/i, /Jenny.*Natural/i,
    /Google UK English Female/i, /\bHazel\b/i, /\bSerena\b/i, /\bMoira\b/i, /\bKate\b/i, /\bZira\b/i, /\bSamantha\b/i, /\bVictoria\b/i],
};
export function loadVoices() {
  if (!voice.ok) return;
  try {
    const all = speechSynthesis.getVoices() || [];
    voice.list = all.filter(v => /^en([-_]|$)/i.test(v.lang || ''));
    if (!voice.list.length) voice.list = all.slice();
  } catch (e) { voice.list = []; }
}
if (voice.ok) { loadVoices(); try { speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) { speechSynthesis.onvoiceschanged = loadVoices; } }
export function pickVoice(role) {
  if (!voice.list.length) loadVoices();
  const want = voice.settings[role === 'whisper' ? 'jacob' : role === 'radio' ? 'book' : role];
  if (want) { const v = voice.list.find(v => v.name === want); if (v) return v; }
  for (const re of VOICE_PREF[role === 'book' || role === 'radio' ? 'book' : 'jacob']) { const v = voice.list.find(v => re.test(v.name)); if (v) return v; }
  return voice.list.find(v => /en[-_]AU/i.test(v.lang)) || voice.list.find(v => /en[-_]GB/i.test(v.lang)) || voice.list[0] || null;
}
// the voices a role can cycle through in settings: "Automatic" first, then everything English
export function voiceChoices() { if (!voice.list.length) loadVoices(); return [''].concat(voice.list.map(v => v.name)); }
export function voiceLabel(name, role) {
  if (!name) { const v = pickVoice(role); return 'Automatic' + (v ? ` (${shortVoice(v.name)})` : ''); }
  return shortVoice(name);
}
const shortVoice = (n) => n.replace(/^Microsoft\s+/i, '').replace(/\s+Online\s+\(Natural\)/i, ' (natural)').replace(/\s*-\s*English\s*/i, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

// what the voice actually reads: no ellipses or dashes read aloud, a pause where the page has one
function speakable(text) {
  return String(text).replace(/…/g, ', ').replace(/\s[–—]\s/g, ', ').replace(/[“”"]/g, '').replace(/\s+,/g, ',').replace(/^[,\s]+|[,\s]+$/g, '').trim();
}
export function stopVoice() {
  if (!voice.ok) return;
  voice.token++;
  clearTimeout(voice.timer);
  if (voice.cur) { voice.cur = null; try { speechSynthesis.cancel(); } catch (e) { /* nothing to stop */ } }
  if (voice.duck) voice.duck(false);
}
// role: 'jacob' (his thoughts), 'book' (the Book of Lost Echoes), 'whisper' (the flies), 'radio' (a voice out of the tractor's set, on the road)
export function speak(text, role = 'jacob', { muted = false, onEnd = null } = {}) {
  if (!voice.ok || !voice.settings.on || muted) return false;
  const say = speakable(text);
  if (!say) return false;
  let busy = false; try { busy = speechSynthesis.speaking || speechSynthesis.pending; } catch (e) { /* unknown */ }
  stopVoice();
  const u = new SpeechSynthesisUtterance(say), v = pickVoice(role), token = voice.token;
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-AU';
  const natural = v && /Natural|Online/i.test(v.name);
  if (role === 'book') { u.rate = natural ? 0.94 : 0.9; u.pitch = 1.0; u.volume = voice.settings.vol * 0.9; }
  else if (role === 'whisper') { u.rate = 0.82; u.pitch = 0.55; u.volume = voice.settings.vol * 0.32; }
  else if (role === 'radio') { u.rate = 1.06; u.pitch = 1.12; u.volume = voice.settings.vol * 0.5; }
  else { u.rate = natural ? 1.02 : 0.98; u.pitch = natural ? 0.94 : 0.86; u.volume = voice.settings.vol; }
  const finish = () => {
    if (token !== voice.token) return;
    clearTimeout(voice.timer);
    voice.cur = null;
    if (voice.duck && role !== 'whisper' && role !== 'radio') voice.duck(false);
    if (onEnd) onEnd();
  };
  u.onend = finish; u.onerror = finish;
  voice.cur = u;
  if (voice.duck && role !== 'whisper' && role !== 'radio') voice.duck(true);
  // some browsers never fire onend: give the world its sound back after a generous guess at the length
  voice.timer = setTimeout(finish, 2500 + say.length * 95 / (u.rate || 1));
  // straight after a cancel Chrome can drop the next line, so give it a moment when something was playing
  const go = () => { if (token !== voice.token) return; try { speechSynthesis.resume(); speechSynthesis.speak(u); } catch (e) { finish(); } };
  if (busy) setTimeout(go, 70); else go();
  return true;
}
