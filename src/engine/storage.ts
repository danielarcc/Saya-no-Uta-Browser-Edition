import type { Manifest, State } from './types';
export interface Save {
    schema: 1;
    game: string;
    version: string;
    slot: number;
    date: string;
    thumbnail: string;
    state: State;
}
const DB = 'nps-local-saves-v1';
function database(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('saves', { keyPath: 'key' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
export async function listSaves(game: string): Promise<Save[]> { const db = await database(); return new Promise((resolve, reject) => { const tx = db.transaction('saves', 'readonly'); const r = tx.objectStore('saves').getAll(); tx.oncomplete = () => { db.close(); resolve(r.result.filter((s: Save) => s.game === game)); }; tx.onerror = () => { db.close(); reject(tx.error); }; }); }
export async function writeSave(save: Save) { const db = await database(); return new Promise<void>((resolve, reject) => { const tx = db.transaction('saves', 'readwrite'); tx.objectStore('saves').put({ ...save, key: `${save.game}:${save.slot}` }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; }); }
export async function deleteSave(game: string, slot: number) { const db = await database(); return new Promise<void>((resolve, reject) => { const tx = db.transaction('saves', 'readwrite'); tx.objectStore('saves').delete(`${game}:${slot}`); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; }); }
export function validateSave(value: unknown, m: Manifest): Save {
    // Validate data before assigning it to the VM; this is not executable code.
    const x = value as Save;
    if (!x || x.schema !== 1 || x.game !== m.id || x.version !== m.version)
        throw new Error('Save belongs to another project or an incompatible version');
    if (!Number.isInteger(x.slot) || x.slot < 0 || x.slot > 25 || typeof x.date !== 'string' || typeof x.thumbnail !== 'string' || (x.thumbnail !== '' && !x.thumbnail.startsWith('data:image/jpeg;base64,')))
        throw new Error('Invalid save metadata');
    const s = x.state;
    if (!s || !Object.hasOwn(m.scripts, s.script) || !Number.isInteger(s.pc) || s.pc < 0 || !['click', 'choice', 'end'].includes(s.waiting) || !Array.isArray(s.runs) || !Array.isArray(s.choices) || !Array.isArray(s.backlog) || typeof s.saveEnabled !== 'boolean')
        throw new Error('Invalid save state');
    if (!Number.isInteger(s.segmentStart) || s.segmentStart < 0 || s.segmentStart > s.runs.length || !Number.isFinite(s.revealFrom) || s.revealFrom < 0 || typeof s.shading !== 'boolean' || typeof s.extraCG !== 'boolean' || typeof s.menuMask !== 'string')
        throw new Error('Invalid reading state');
    const object = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
    for (const vars of [s.vars]) {
        if (!object(vars) || Object.entries(vars).some(([k, v]) => ['__proto__', 'constructor', 'prototype'].includes(k) || typeof v !== 'number' || !Number.isFinite(v)))
            throw new Error('Invalid variables');
    }
    const asset = (key: unknown) => typeof key === 'string' && (Object.keys(m.assets).some(k => k.replace(/\\/g, '/').toLowerCase() === key.replace(/\\/g, '/').toLowerCase()));
    const color = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);
    for (const scene of [s.scene, s.pending]) {
        if (!object(scene) || !(asset(scene.background) || color(scene.background)) || !object(scene.layers) || !object(scene.sprites))
            throw new Error('Invalid scene');
        if (scene.blur !== undefined && (!Number.isFinite(scene.blur) || scene.blur < 0 || scene.blur > 100))
            throw new Error('Invalid filter');
        if (scene.brightness !== undefined && (!Number.isFinite(scene.brightness) || scene.brightness < 0 || scene.brightness > 5))
            throw new Error('Invalid brightness');
        for (const l of [...Object.values(scene.layers), ...Object.values(scene.sprites)])
            if (!l || !(asset(l.src) || color(l.src)) || ![l.x, l.y, l.scale, l.opacity].every(Number.isFinite))
                throw new Error('Invalid layer');
    }
    for (const r of s.runs)
        if (typeof r.text !== 'string' || typeof r.italic !== 'boolean')
            throw new Error('Invalid text');
    for (const c of s.choices)
        if (typeof c.href !== 'string' || typeof c.text !== 'string' || !Number.isFinite(c.x) || !Number.isFinite(c.y) || !Array.isArray(c.frames) || !c.frames.every(asset) || typeof c.disabled !== 'boolean')
            throw new Error('Invalid choice');
    for (const b of s.backlog)
        if (typeof b.text !== 'string' || typeof b.speaker !== 'string' || (b.voice !== undefined && !asset(b.voice)))
            throw new Error('Invalid backlog');
    if (!object(s.audio) || Object.entries(s.audio).some(([ch, t]) => !(/^(bgm|voice|se:[\w-]+)$/.test(ch)) || !t || !asset(t.src) || !Number.isFinite(t.volume) || typeof t.loop !== 'boolean' || (t.position !== undefined && !Number.isFinite(t.position))))
        throw new Error('Invalid audio');
    if (!object(s.read) || Object.values(s.read).some(v => typeof v !== 'boolean'))
        throw new Error('Invalid history');
    return structuredClone(x);
}

