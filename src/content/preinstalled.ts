/** Optional server-side prepared content. All paths are relative to public/content/. */
import { cleanPath, pathKey } from '../engine/paths';
import type { ContentPackage } from './types';
import type { Manifest } from '../engine/types';
import { makeRuntime, SHELL_SCRIPT } from './runtime';
export interface PreinstalledIndex {
    clearSpritesOnBackgroundChange?: boolean;
    schema: 1;
    enabled: true;
    id: string;
    version: string;
    title: string;
    entry: string;
    scripts: Record<string, string>;
    assets: Record<string, string>;
    textMode?: 'nvl' | 'replace';
    timing?: {
        waitMs: number;
        effectMs: number;
    };
    transitionMask?: string;
}
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function fileTable(v: unknown, label: string): Record<string, string> {
    if (!object(v))
        throw Error(`${label} precisa ser um mapa de caminhos.`);
    const result: Record<string, string> = {};
    const keys = new Set<string>();
    for (const [name, location] of Object.entries(v)) {
        if (typeof location !== 'string')
            throw Error(`${label}: invalid file: ${name}`);
        const n = cleanPath(name), l = cleanPath(location), k = pathKey(n);
        if (n.startsWith('__engine__/') || n.startsWith('__preinstalled__/') || l.startsWith('__engine__/') || l.startsWith('__preinstalled__/'))
            throw Error('Reserved namespace in preinstalled content.');
        if (keys.has(k))
            throw Error(`${label}: nome duplicado: ${n}`);
        keys.add(k);
        result[n] = l;
    }
    return result;
}
export function validatePreinstalled(raw: unknown): PreinstalledIndex | undefined {
    if (!object(raw))
        throw Error('Invalid preinstalled manifest.');
    if (raw.enabled === false)
        return undefined;
    if (raw.schema !== 1 || raw.enabled !== true)
        throw Error('Invalid preinstalled manifest version or mode.');
    const { id, version, title, entry } = raw;
    if (typeof id !== 'string' || !(/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(id)))
        throw Error('Invalid preinstalled content ID.');
    if (typeof version !== 'string' || !version || version.length > 100 || typeof title !== 'string' || !title || title.length > 150 || typeof entry !== 'string')
        throw Error('Invalid preinstalled metadata.');
    const scripts = fileTable(raw.scripts, 'scripts');
    const assets = fileTable(raw.assets, 'assets');
    if (!Object.keys(scripts).length)
        throw Error('No preinstalled scripts found.');
    const hash = entry.indexOf('#');
    const script = hash < 0 ? entry : entry.slice(0, hash);
    if (!Object.hasOwn(scripts, script) || script === SHELL_SCRIPT)
        throw Error('entry does not point to a preinstalled script.');
    if (hash >= 0 && !entry.slice(hash + 1))
        throw Error('Marcador de entrada vazio.');
    if (raw.textMode !== undefined && !['nvl', 'replace'].includes(String(raw.textMode)))
        throw Error('Invalid textMode.');
    let timing: PreinstalledIndex['timing'];
    if (raw.timing !== undefined) {
        if (!object(raw.timing))
            throw Error('Invalid timing.');
        const { waitMs, effectMs } = raw.timing;
        if (typeof waitMs !== 'number' || !Number.isFinite(waitMs) || waitMs <= 0 || waitMs > 1000 || typeof effectMs !== 'number' || !Number.isFinite(effectMs) || effectMs <= 0 || effectMs > 1000)
            throw Error('Invalid execution timing.');
        timing = { waitMs, effectMs };
    }
    let transitionMask: string | undefined;
    if (raw.transitionMask !== undefined) {
        if (typeof raw.transitionMask !== 'string' || !Object.hasOwn(assets, raw.transitionMask))
            throw Error('transitionMask precisa indicar um recurso do manifesto.');
        transitionMask = raw.transitionMask;
    }
    return { schema: 1, enabled: true, id, version, title, entry, scripts, assets, textMode: raw.textMode as PreinstalledIndex['textMode'], timing, transitionMask,
        clearSpritesOnBackgroundChange: raw.clearSpritesOnBackgroundChange === true
    };
}
export async function loadPreinstalled(fetcher: typeof fetch = fetch): Promise<PreinstalledIndex | undefined> {
    const url = new URL('content/index.json', document.baseURI);
    const response = await fetcher(url, { cache: 'no-store' });
    if (response.status === 404)
        return undefined;
    if (!response.ok)
        throw Error(`Preinstalled manifest: HTTP ${response.status}`);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('json'))
        throw Error('content/index.json is not valid JSON. Check the server and paths.');
    return validatePreinstalled(await response.json());
}
/** Reuses the exact same script shell and menu from the browser import path. */
export function makePreinstalledRuntime(base: Manifest, menuSource: string, index: PreinstalledIndex) {
    const placeholder: ContentPackage = {
        id: `preinstalled-${index.id}`, title: index.title,
        fingerprint: index.version, created: '', bytes: 0, fileCount: Object.keys(index.assets).length + Object.keys(index.scripts).length, scriptCount: Object.keys(index.scripts).length,
        entry: index.entry, scripts: Object.fromEntries(Object.keys(index.scripts).map(s => [s, ''])),
        resources: Object.fromEntries(Object.keys(index.assets).map(s => [s, new Blob()])),
        entries: Object.keys(index.scripts).map(file => ({ file, labels: index.entry.startsWith(file + '#') ? [index.entry.slice(file.length + 1)] : [] })),
        suggestedEntries: [], issues: [], textMode: index.textMode ?? 'nvl', timing: index.timing ?? { waitMs: 1, effectMs: 10 }, transitionMask: index.transitionMask,
    } as ContentPackage;
    const { manifest, scripts } = makeRuntime(base, menuSource, placeholder, index.entry);
    for (const [name, file] of Object.entries(index.scripts))
        manifest.scripts[name] = '__preinstalled__/' + file;
    for (const [name, file] of Object.entries(index.assets))
        manifest.assets[name] = '__preinstalled__/' + file;
    // Avoid retaining the placeholder's scripts/resources in the browser: HTTP streams files on demand.
    return { manifest: { ...manifest, clearSpritesOnBackgroundChange: index.clearSpritesOnBackgroundChange, version: 'content-v1:' + index.version }, scripts: { [SHELL_SCRIPT]: scripts[SHELL_SCRIPT] } };
}

