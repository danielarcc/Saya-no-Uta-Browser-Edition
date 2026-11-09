import { cleanPath } from './paths';
import type { Manifest } from './types';
export function normalize(key: string) { return key.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase(); }
export class Assets {
    private lookup = new Map<string, string>();
    private urls = new Map<string, string>();
    constructor(readonly manifest: Manifest, private options?: {
        scripts?: Record<string, string>;
        resources?: Record<string, Blob>;
    }) { for (const [key, path] of Object.entries(manifest.assets)) {
        const k = normalize(key);
        if (this.lookup.has(k))
            throw new Error(`Alias duplicado: ${key}`);
        cleanPath(path);
        this.lookup.set(k, path);
    } }
    url(key: string) { const path = this.lookup.get(normalize(key)); if (!path)
        throw new Error(`Asset not registered: ${key}`); const blob = this.options?.resources?.[path]; if (blob) {
        if (!this.urls.has(path))
            this.urls.set(path, URL.createObjectURL(blob));
        return this.urls.get(path)!;
    } const preinstalled = path.startsWith('__preinstalled__/'); const local = preinstalled ? path.slice('__preinstalled__/'.length) : path.startsWith('__engine__/') ? path.slice('__engine__/'.length) : path; return new URL((preinstalled ? 'content/' : 'game/') + local, document.baseURI).href; }
    dispose() { for (const url of this.urls.values())
        URL.revokeObjectURL(url); this.urls.clear(); }
    async script(name: string) { if (this.options?.scripts && Object.hasOwn(this.options.scripts, name))
        return this.options.scripts[name]; const path = this.manifest.scripts[name]; if (!path || path.startsWith('/') || path.includes('..') || path.includes(':'))
        throw new Error(`Script not registered: ${name}`); const preinstalled = path.startsWith('__preinstalled__/'); const local = preinstalled ? path.slice('__preinstalled__/'.length) : path; const r = await fetch(new URL((preinstalled ? 'content/' : 'game/') + local, document.baseURI)); if (!r.ok)
        throw new Error(`HTTP ${r.status}: ${name}`); return r.text(); }
}

