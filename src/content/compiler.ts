import { parse, SUPPORTED, type Token } from '../engine/parser';
import { resolveFile, resolveTarget, pathKey } from '../engine/paths';
import { decodeText, verifyInputs } from './archive';
import type { ContentPackage, InputFile, Issue } from './types';
const image = /\.(png|jpe?g|webp|bmp)$/i, audio = /\.(ogg|wav|mp3|m4a|flac|opus)$/i;
function quote(s: string) { if (!s.includes('"'))
    return '"' + s + '"'; if (!s.includes("'"))
    return "'" + s + "'"; throw new Error('Attribute contains incompatible quotes'); }
function serialize(tokens: Token[]) { let line = 1; return tokens.map(t => { const pad = '\n'.repeat(Math.max(0, t.line - line)); const str = t.kind === 'text' ? t.text : '<' + t.name + Object.entries(t.attrs).map(([k, v]) => ' ' + k + '=' + quote(v)).join('') + '>'; line += pad.length + (str.match(/\n/g)?.length ?? 0); return pad + str; }).join(''); }
function mime(path: string) { const ext = path.split('.').pop()!.toLowerCase(); return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4' } as Record<string, string>)[ext] ?? 'application/octet-stream'; }
async function digest(bytes: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))).map(n => n.toString(16).padStart(2, '0')).join(''); }
export async function compilePackage(input: InputFile[], progress: (s: string) => void = () => { }): Promise<ContentPackage> {
    const files = verifyInputs(input);
    const paths = files.map(f => f.path);
    const issues: Issue[] = [];
    const parsed = new Map<string, ReturnType<typeof parse>>();
    const issue = (file: string, message: string, line?: number, severity: 'error' | 'warning' = 'error') => issues.push({ file, line, message, severity });
    for (const path of paths)
        if (path.startsWith('__engine__/'))
            issue(path, 'The __engine__ namespace is reserved for the interface.');
    const configs = files.filter(f => f.path.split('/').pop()?.toLowerCase() === 'nps-package.json');
    let meta: Record<string, unknown> = {};
    if (configs.length > 1)
        issue('nps-package.json', 'Multiple manifests found. Import one experience at a time.');
    if (configs.length === 1) {
        try {
            const value = JSON.parse(decodeText(configs[0].data));
            if (!value || typeof value !== 'object' || Array.isArray(value))
                throw Error('Expected a JSON object');
            meta = value;
        }
        catch (e) {
            issue(configs[0].path, String(e));
        }
    }
    for (const f of files.filter(f => /\.(nps|h)$/i.test(f.path))) {
        progress(`Analyzing ${f.path}`);
        try {
            parsed.set(f.path, parse(decodeText(f.data), f.path));
        }
        catch (e) {
            issue(f.path, e instanceof Error ? e.message : String(e));
        }
    }
    const nps = [...parsed.keys()].filter(p => /\.nps$/i.test(p));
    if (!nps.length)
        issue('package', 'No readable .nps scripts found.');
    const media = paths.filter(p => image.test(p) || audio.test(p));
    const edges = new Map(nps.map(p => [p, new Set<string>()]));
    const aliases = (meta.assets && typeof meta.assets === 'object' && !Array.isArray(meta.assets) ? meta.assets : {}) as Record<string, unknown>;
    const characters = (meta.characters && typeof meta.characters === 'object' && !Array.isArray(meta.characters) ? meta.characters : {}) as Record<string, unknown>;
    const resource = (ref: string, file: string, kind: 'image' | 'sound' | 'voice') => {
        if (!ref)
            return ref;
        if (kind === 'image' && /^#[\da-f]{3,8}$/i.test(ref))
            return ref;
        const alias = Object.entries(aliases).find(([k]) => pathKey(k) === pathKey(ref))?.[1];
        if (alias !== undefined && typeof alias !== 'string')
            throw Error(`Invalid alias: ${ref}`);
        return resolveFile(typeof alias === 'string' ? alias : ref, file, media.filter(p => kind === 'image' ? image.test(p) : audio.test(p)), kind);
    };
    for (const [file, s] of parsed) {
        if (/\.h$/i.test(file) && s.tokens.length) {
            issue(file, 'INCLUDE with macros or instructions is unsupported; only comment-only files are allowed.');
            continue;
        }
        for (const t of s.tokens) {
            if (t.kind !== 'tag')
                continue;
            const a = t.attrs;
            try {
                if (!SUPPORTED.has(t.name))
                    issue(file, `Unsupported command: ${t.name}`, t.line);
                if (['A', 'CHOICE'].includes(t.name)) {
                    const { file: target, marker } = resolveTarget(a.HREF ?? '', file, nps);
                    if (marker && !parsed.get(target)!.labels.has(marker))
                        throw Error(`Missing marker: ${a.HREF}`);
                    a.HREF = target + (marker ? '#' + marker : '');
                    if (target !== file)
                        edges.get(file)?.add(target);
                }
                if (t.name === 'INCLUDE') {
                    a.SRC = resolveFile(a.SRC ?? '', file, [...parsed.keys()]);
                }
                if (['BACKGROUND', 'LAYER', 'FLASH'].includes(t.name) && a.SRC)
                    a.SRC = resource(a.SRC, file, 'image');
                if (t.name === 'BUSTUP' && (a.MODE ?? 'on').toLowerCase() !== 'off') {
                    const key = `${a.NAME ?? ''}|${a.FACE ?? ''}`;
                    const mapping = characters[key];
                    if (mapping !== undefined && typeof mapping !== 'string')
                        throw Error(`Invalid mapping: ${key}`);
                    a.SRC = resource(a.SRC || (typeof mapping === 'string' ? mapping : `${a.NAME ?? ''}_${a.FACE ?? ''}`), file, 'image');
                }
                if (['BGM', 'SE', 'VOICE'].includes(t.name) && a.SRC && (a.MODE ?? 'normal').toLowerCase() !== 'fadeout')
                    a.SRC = resource(a.SRC, file, t.name === 'VOICE' ? 'voice' : 'sound');
                if (t.name === 'CHOICE') {
                    if (a.FILE)
                        a.FILE = a.FILE.split(';').filter(Boolean).map(p => resource(p, file, 'image')).join(';');
                    for (const k of ['ONSE', 'PUSHSE'])
                        if (a[k])
                            a[k] = resource(a[k], file, 'sound');
                    if (a.OPERATOR)
                        issue(file, 'Non-empty CHOICE OPERATOR is not supported yet.', t.line);
                }
                if (t.name === 'WIPE' && !['normal', 'fade', 'effect'].includes((a.EFFECT ?? 'normal').toLowerCase()))
                    issue(file, `Unsupported WIPE EFFECT: ${a.EFFECT}`, t.line);
                if (t.name === 'SYSTEM' && a.CMD && !['config', 'ending', 'credits', 'cgmode', 'music', 'save', 'load', 'backlog', 'savemode', 'shading', 'extracg', 'url'].includes(a.CMD.toLowerCase()))
                    issue(file, `Unsupported SYSTEM CMD: ${a.CMD}`, t.line);
                if (t.name === 'SYSTEM' && a.CMD?.toLowerCase() === 'url')
                    issue(file, 'Opening external URLs is blocked.', t.line, 'warning');
                if (t.name === 'BGM' && a.COUNT)
                    issue(file, 'BGM COUNT does not support partial loops.', t.line, 'warning');
            }
            catch (e) {
                issue(file, e instanceof Error ? e.message : String(e), t.line);
            }
        }
    }
    let transitionMask: string | undefined;
    if (typeof meta.transitionMask === 'string') {
        try {
            transitionMask = resource(meta.transitionMask, configs[0]?.path ?? '', 'image');
        }
        catch (e) {
            issue('nps-package.json', String(e));
        }
    }
    for (const [file, s] of parsed)
        if (s.tokens.some(t => t.kind === 'tag' && t.name === 'WIPE' && t.attrs.EFFECT?.toLowerCase() === 'effect') && !transitionMask)
            issue(file, 'WIPE effect will use the engine’s built-in visual mask.', undefined, 'warning');
    const incoming = new Set([...edges.values()].flatMap(x => [...x]));
    const roots = nps.filter(p => !incoming.has(p));
    let entry = '';
    if (meta.entry !== undefined) {
        if (typeof meta.entry !== 'string')
            issue('nps-package.json', 'entry must be a script path, optionally followed by #marker.');
        else
            try {
                const target = resolveTarget(meta.entry, configs[0]?.path ?? '', nps);
                if (target.marker && !parsed.get(target.file)!.labels.has(target.marker))
                    throw Error('Missing entry marker');
                entry = target.file + (target.marker ? '#' + target.marker : '');
            }
            catch (e) {
                issue('nps-package.json', String(e));
            }
    }
    else if (roots.length === 1)
        entry = roots[0];
    else if (nps.length === 1)
        entry = nps[0];
    if (meta.width !== undefined && meta.width !== 1280)
        issue('nps-package.json', 'This build preserves the 1280 × 960 logical resolution.');
    if (meta.height !== undefined && meta.height !== 960)
        issue('nps-package.json', 'This build preserves the 1280 × 960 logical resolution.');
    const timing = { waitMs: 1, effectMs: 10 };
    if (meta.timing !== undefined) {
        const tm = meta.timing as Record<string, unknown>;
        for (const k of ['waitMs', 'effectMs'] as const) {
            const v = tm?.[k];
            if (v !== undefined) {
                if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 1000)
                    issue('nps-package.json', `timing.${k} invalid`);
                else
                    timing[k] = v;
            }
        }
    }
    progress('Calculating content identity…');
    const hashLines: string[] = [];
    for (const f of [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        hashLines.push(f.path + '\0' + await digest(f.data));
    const fingerprint = await digest(new TextEncoder().encode(hashLines.join('\n')));
    const scripts: Record<string, string> = {};
    for (const [p, s] of parsed) {
        try {
            scripts[p] = serialize(s.tokens);
        }
        catch (e) {
            issue(p, String(e));
        }
    }
    const resources: Record<string, Blob> = {};
    for (const f of files)
        if (media.includes(f.path))
            resources[f.path] = new Blob([new Uint8Array(f.data).buffer], { type: mime(f.path) });
    return { id: 'content-' + fingerprint, title: typeof meta.title === 'string' ? meta.title.slice(0, 150) : (files[0]?.path.split('/')[0] ?? 'Pacote NPS'), fingerprint, created: new Date().toISOString(), bytes: files.reduce((a, f) => a + f.data.length, 0), fileCount: files.length, scriptCount: nps.length, entry, scripts, resources, entries: nps.map(file => ({ file, labels: [...parsed.get(file)!.labels.keys()] })), suggestedEntries: roots, issues, textMode: meta.textMode === 'replace' ? 'replace' : 'nvl', timing, transitionMask };
}

