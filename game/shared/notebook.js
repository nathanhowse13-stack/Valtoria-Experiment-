// ============================================================
// The idea notebook every page shares: kept in the page's
// database when it runs as an artifact (the `ideas` collection,
// which Claude reads next session), and in this browser always.
// ============================================================
export const IDEA_KINDS = [['story', 'Story'], ['character', 'Character'], ['world', 'World'], ['gameplay', 'Gameplay'], ['fix', 'Fix']];
export const ideas = { list: [], db: null, dl: null, shared: false, synced: false };
try { ideas.list = JSON.parse(localStorage.getItem('valtoria-ideas') || '[]'); } catch (e) { ideas.list = []; }

const hooks = { onChange: () => {}, onFull: () => {} };
function keepLocal() {
  try { localStorage.setItem('valtoria-ideas', JSON.stringify(ideas.list.map(i => ({ ...i, thumb: i.thumb && i.thumb.length < 60000 ? i.thumb : '' })))); } catch (e) { /* storage unavailable */ }
}

export async function connectIdeas({ onChange, onFull } = {}) {
  if (onChange) hooks.onChange = onChange;
  if (onFull) hooks.onFull = onFull;
  const c = window.claude;
  if (!c || !c.use) return;
  try { ideas.db = await c.use('db'); } catch (e) { ideas.db = null; }
  try { ideas.dl = await c.use('downloads'); } catch (e) { ideas.dl = null; }
  if (!ideas.db) return;
  try {
    ideas.db.collection('ideas').onSnapshot((snap) => {
      const remote = snap.docs.map(d => ({ id: d.id, ...d.data(), shared: true })), ids = new Set(remote.map(i => i.id));
      if (!ideas.synced) {
        // anything jotted while the notebook was out of reach goes up now
        ideas.synced = true;
        const waiting = ideas.list.filter(i => !ids.has(i.id) && !i.shared);
        setTimeout(async () => { for (const i of waiting) if (await share(i)) i.shared = true; keepLocal(); }, 0);
      }
      ideas.list = remote.concat(ideas.list.filter(i => !ids.has(i.id) && !i.shared)).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
      ideas.shared = true; keepLocal(); hooks.onChange();
    }, () => { ideas.shared = false; hooks.onChange(); });
  } catch (e) { ideas.db = null; }
}

async function share(i) {
  if (!ideas.db) return false;
  const doc = { ...i }; delete doc.shared; delete doc.id;
  for (let tries = 0; tries < 2; tries++) {
    try { await ideas.db.collection('ideas').doc(i.id).set(doc); return true; } catch (e) {
      if (e && e.code === 'quota_exceeded') { hooks.onFull(); return false; }
      if (!e || e.code !== 'unavailable') return false;
      await new Promise(r => setTimeout(r, 600 + Math.random() * 600));
    }
  }
  return false;
}

// build names the page and its version, so a note says where it was written
export async function addIdea(text, kind, build, context, thumb) {
  const now = new Date();
  const i = { id: 'i' + now.getTime().toString(36) + Math.floor(Math.random() * 1e4).toString(36), text: text.trim(), kind, at: now.toISOString(), ...context, thumb: thumb || '', build };
  ideas.list.unshift(i); keepLocal(); hooks.onChange();
  const ok = await share(i);
  if (ok) i.shared = true;
  keepLocal();
  return ok;
}

export async function deleteIdea(id) {
  const k = ideas.list.findIndex(i => i.id === id); if (k < 0) return;
  const [i] = ideas.list.splice(k, 1); keepLocal(); hooks.onChange();
  if (ideas.db && i.shared) try { await ideas.db.collection('ideas').doc(id).delete(); } catch (e) { /* stays gone locally */ }
}

const AREA_NAME = { yard: 'the yard', road: 'the road' };
export const ideaWhere = (i) => AREA_NAME[i.area] || 'the shack';

export async function exportIdeas() {
  const lines = ['# Ideas from Valtoria', '', `Exported ${new Date().toLocaleString('en-AU')}`, ''];
  for (const i of ideas.list) {
    const kind = (IDEA_KINDS.find(k => k[0] === i.kind) || [0, 'Idea'])[1];
    lines.push(`## ${kind} · ${new Date(i.at).toLocaleString('en-AU')}`, '', i.text, '', `*${[ideaWhere(i), i.place, i.looking && 'looking at ' + i.looking, i.heat].filter(Boolean).join(' · ')}*`, '');
  }
  const data = lines.join('\n'), filename = 'valtoria-ideas.md';
  if (ideas.dl) try { await ideas.dl.save({ filename, data }); return 'saved'; } catch (e) { if (e && e.code === 'declined') return 'declined'; }
  if (window.claude) return 'failed';
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'text/markdown' })); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return 'saved';
  } catch (e) { return 'failed'; }
}
