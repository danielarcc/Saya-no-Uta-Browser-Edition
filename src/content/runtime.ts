import type { Manifest } from '../engine/types';
import { parse, type Token } from '../engine/parser';
import type { ContentPackage } from './types';
import { validateEntry } from './repository';
export const SHELL_SCRIPT = '__engine__/title.nps';
export function makeRuntime(base: Manifest, menuSource: string, pkg: ContentPackage, entry: string): {
    manifest: Manifest;
    scripts: Record<string, string>;
} {
    validateEntry(pkg, entry);
    if (pkg.scripts[SHELL_SCRIPT] || Object.keys(pkg.resources).some(k => k.startsWith('__engine__/')))
        throw new Error('O pacote usa o namespace reservado __engine__.');
    const prefix = '__engine__/';
    const assets: Record<string, string> = {};
    for (const [k, v] of Object.entries(base.assets))
        assets[prefix + k] = '__engine__/' + v;
    for (const p of Object.keys(pkg.resources))
        assets[p] = p;
    const tokens = parse(menuSource, SHELL_SCRIPT).tokens;
    for (const t of tokens) {
        if (t.kind !== 'tag')
            continue;
        const a = t.attrs;
        if (['BGM', 'BACKGROUND', 'LAYER'].includes(t.name) && a.SRC && base.assets[a.SRC])
            a.SRC = prefix + a.SRC;
        if (t.name === 'CHOICE') {
            if (a.HREF === 'cafeteria.nps')
                a.HREF = '#__engine_start';
            if (a.FILE)
                a.FILE = a.FILE.split(';').map(v => prefix + v).join(';');
        }
    }
    const quote = (s: string) => s.includes('"') ? "'" + s + "'" : '"' + s + '"';
    const shell = tokens.map(t => t.kind === 'text' ? t.text : '<' + t.name + Object.entries(t.attrs).map(([k, v]) => ' ' + k + '=' + quote(v)).join('') + '>').join('\n') + '\n<MARKER NAME="#__engine_start"><SYSTEM INIT="TRUE"><SYSTEM CMD="savemode" MODE="on"><BGM MODE="fadeout" TIME="20"><CLEAR><A HREF=' + quote(entry) + '>';
    const manifest: Manifest = { ...base, clearSpritesOnBackgroundChange: pkg.clearSpritesOnBackgroundChange, id: pkg.id, version: 'content-v1:' + pkg.fingerprint, title: pkg.title, entry: SHELL_SCRIPT, scripts: { ...Object.fromEntries(Object.keys(pkg.scripts).map(p => [p, p])), [SHELL_SCRIPT]: SHELL_SCRIPT }, assets, characters: {}, textMode: pkg.textMode, timing: pkg.timing, transitionMask: pkg.transitionMask ?? (base.transitionMask ? prefix + base.transitionMask : undefined), credits: base.credits.map(k => prefix + k), gallery: base.gallery?.map(k => prefix + k), music: base.music?.map(t => ({ ...t, src: prefix + t.src })) };
    return { manifest, scripts: { ...pkg.scripts, [SHELL_SCRIPT]: shell } };
}

