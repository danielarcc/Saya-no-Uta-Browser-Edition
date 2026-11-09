export const pathKey = (s: string) => s.replace(/\\/g, '/').normalize('NFC').replace(/^\.\//, '').toLowerCase();
export function cleanPath(raw: string): string {
    const path = raw.replace(/\\/g, '/').normalize('NFC');
    if (!path || path.startsWith('/') || /^[a-z]:/i.test(path) || /[\x00-\x1f:#?]/.test(path) || path.split('/').includes('..'))
        throw new Error(`Unsafe path: ${raw}`);
    return path.split('/').filter(p => p && p !== '.').join('/');
}
export function resolveFile(ref: string, current: string, files: string[], kind?: 'image' | 'sound' | 'voice' | 'script'): string {
    const raw = ref.replace(/\\/g, '/').normalize('NFC');
    const dir = current.includes('/') ? current.slice(0, current.lastIndexOf('/') + 1) : '';
    if (raw.startsWith('/') || /[\x00-\x1f:#?]/.test(raw))
        throw new Error(`Referência não local: ${ref}`);
    const parent = raw.split('/').includes('..');
    let relative = dir + raw;
    const stack: string[] = [];
    for (const part of relative.split('/')) {
        if (!part || part === '.')
            continue;
        if (part === '..') {
            if (!stack.length)
                throw new Error(`Referência fora do pacote: ${ref}`);
            stack.pop();
        }
        else
            stack.push(part);
    }
    relative = stack.join('/');
    const value = parent ? relative : cleanPath(raw), key = pathKey(value);
    const extensions = kind === 'image' ? ['.png', '.jpg', '.jpeg', '.webp', '.bmp'] : kind === 'sound' || kind === 'voice' ? ['.ogg', '.wav', '.mp3', '.m4a', '.flac', '.opus'] : kind === 'script' ? ['.nps'] : [];
    const stems = [key, ...(!/\.[^/]+$/.test(key) ? extensions.map(e => key + e) : [])];
    const exact = (keys: string[]) => files.filter(f => keys.includes(pathKey(f)));
    let found = exact(parent ? stems : stems.map(s => pathKey(dir) + s));
    if (found.length === 1)
        return found[0];
    if (parent)
        throw new Error(`Relative file not found: ${ref} em ${current}`);
    found = exact(stems);
    if (found.length === 1)
        return found[0];
    found = files.filter(f => stems.some(s => pathKey(f).endsWith('/' + s)));
    if (kind === 'voice' || kind === 'sound') {
        const qualified = found.filter(f => new RegExp(`/(?:${kind === 'voice' ? 'voice|voices|voz' : 'sound|sounds|audio|bgm|se'})/`, 'i').test('/' + f));
        if (qualified.length)
            found = qualified;
    }
    if (found.length === 1)
        return found[0];
    if (!found.length && !value.includes('/'))
        found = files.filter(f => stems.includes(pathKey(f).split('/').pop()!));
    if (found.length === 1)
        return found[0];
    throw new Error(found.length ? `Ambiguous reference "${ref}": ${found.join(', ')}` : `Missing file: "${ref}" (referenced by ${current})`);
}
export function resolveTarget(href: string, current: string, files: string[]): {
    file: string;
    marker: string;
} {
    const hash = href.indexOf('#');
    const ref = hash < 0 ? href : href.slice(0, hash);
    const marker = hash < 0 ? '' : href.slice(hash + 1);
    if (!ref && !marker)
        throw new Error('Destino vazio');
    return { file: ref ? resolveFile(ref, current, files, 'script') : current, marker };
}

