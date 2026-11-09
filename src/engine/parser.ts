export type Token = {
    kind: 'text';
    text: string;
    line: number;
} | {
    kind: 'tag';
    name: string;
    attrs: Record<string, string>;
    line: number;
};
export interface Script {
    name: string;
    tokens: Token[];
    labels: Map<string, number>;
}
export class NpsError extends Error {
}
export function parse(source: string, name = 'main.nps'): Script {
    const tokens: Token[] = [];
    let p = 0, line = 1, buffer = '', start = 1;
    const flush = () => { if (buffer.trim())
        tokens.push({ kind: 'text', text: buffer.replace(/\r/g, '').trim(), line: start }); buffer = ''; };
    source = source.replace(/^\uFEFF/, '');
    while (p < source.length) {
        if (source.startsWith('//', p)) {
            flush();
            while (p < source.length && source[p] !== '\n')
                p++;
            continue;
        }
        if (source[p] === '<') {
            flush();
            const at = line;
            let q = '', raw = '';
            p++;
            let closed = false;
            while (p < source.length) {
                const c = source[p++];
                if (c === '\n')
                    line++;
                if (q) {
                    raw += c;
                    if (c === q)
                        q = '';
                }
                else if (c === '"' || c === "'") {
                    q = c;
                    raw += c;
                }
                else if (c === '>') {
                    closed = true;
                    break;
                }
                else
                    raw += c;
            }
            if (!closed)
                throw new NpsError(`${name}:${at}: unterminated tag`);
            if (raw.startsWith('!'))
                continue;
            const m = raw.trim().match(/^(\/?[\w]+)([\s\S]*)$/u);
            if (!m)
                throw new NpsError(`${name}:${at}: invalid tag`);
            const attrs: Record<string, string> = {};
            let rest = m[2].trim();
            while (rest) {
                const a = rest.match(/^(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))\s*/u);
                if (!a)
                    throw new NpsError(`${name}:${at}: invalid attribute: ${rest}`);
                attrs[a[1].toUpperCase()] = a[2] ?? a[3] ?? a[4];
                rest = rest.slice(a[0].length);
            }
            tokens.push({ kind: 'tag', name: m[1].toUpperCase(), attrs, line: at });
        }
        else {
            if (!buffer)
                start = line;
            const c = source[p++];
            buffer += c;
            if (c === '\n')
                line++;
        }
    }
    flush();
    const labels = new Map<string, number>();
    tokens.forEach((t, i) => { if (t.kind === 'tag' && t.name === 'MARKER') {
        const key = (t.attrs.NAME ?? '').replace(/^#/, '');
        if (!key || labels.has(key))
            throw new NpsError(`${name}:${t.line}: marcador vazio ou duplicado`);
        labels.set(key, i + 1);
    } });
    return { name, tokens, labels };
}
export const SUPPORTED = new Set(['K', 'VOICE', 'WIPE', 'BACKGROUND', 'WAIT', 'CLEAR', 'BOX', 'SE', 'BUSTUP', 'BGM', 'A', 'MARKER', 'CHOICE', 'I', '/I', 'SYSTEM', 'FLASH', 'LAYER', 'SELECT', 'CALC', '/A', 'CENTER', '/CENTER', 'END', 'SCROLL', 'II', 'INCLUDE', 'LOAD', '/PRE', '/BODY', '/HTML']);

