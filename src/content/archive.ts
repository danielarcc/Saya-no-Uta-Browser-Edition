import { unzipSync } from 'fflate';
import { cleanPath, pathKey } from '../engine/paths';
import type { InputFile } from './types';
export const LIMITS = { archive: 512 * 1024 * 1024, total: 1024 * 1024 * 1024, file: 128 * 1024 * 1024, count: 10000 };
const supported = /\.(nps|h|json|png|jpe?g|webp|bmp|ogg|wav|mp3|m4a|flac|opus)$/i;
export function decodeText(data: Uint8Array): string { try {
    if (data[0] === 255 && data[1] === 254)
        return new TextDecoder('utf-16le', { fatal: true }).decode(data);
    if (data[0] === 254 && data[1] === 255)
        return new TextDecoder('utf-16be', { fatal: true }).decode(data);
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
}
catch {
    throw new Error('Unrecognized encoding. Use UTF-8 or UTF-16 with BOM.');
} }
export function verifyInputs(files: InputFile[]): InputFile[] { if (files.length > LIMITS.count)
    throw new Error('Package exceeds 10,000 files'); let total = 0; const seen = new Set<string>(); return files.filter(f => supported.test(f.path)).map(f => { const path = cleanPath(f.path), key = pathKey(path); if (seen.has(key))
    throw new Error(`Duplicate name (including case/Unicode variants): ${path}`); seen.add(key); total += f.data.byteLength; if (f.data.byteLength > LIMITS.file || total > LIMITS.total)
    throw new Error('Package exceeds the limit: 128 MiB per file or 1 GiB total'); return { path, data: f.data }; }); }
/** Inspect ZIP directory before allocation/decompression; reject ZIP64/encryption/traversal. */
export function readZip(bytes: Uint8Array): InputFile[] {
    if (bytes.length > LIMITS.archive)
        throw new Error('ZIP excede 512 MiB');
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
        if (v.getUint32(p, true) === 0x06054b50 && p + 22 + v.getUint16(p + 20, true) === bytes.length) {
            end = p;
            break;
        }
    if (end < 0)
        throw new Error('Invalid or incomplete ZIP');
    const count = v.getUint16(end + 10, true), size = v.getUint32(end + 12, true), offset = v.getUint32(end + 16, true);
    if (v.getUint16(end + 4, true) || v.getUint16(end + 6, true) || count === 65535 || offset === 0xffffffff)
        throw new Error('Split, ZIP64, or multi-disk ZIP files are not supported');
    if (count > LIMITS.count || offset + size > end)
        throw new Error('Invalid ZIP directory or too many files');
    let p = offset, total = 0;
    const names = new Map<string, number>();
    const crcs = new Map<string, number>();
    const safe = new Set<string>();
    for (let i = 0; i < count; i++) {
        if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50)
            throw new Error('Corrupt ZIP directory');
        const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), packed = v.getUint32(p + 20, true), expanded = v.getUint32(p + 24, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
        if (flags & 1)
            throw new Error('Encrypted ZIP files are not supported');
        if (![0, 8].includes(method))
            throw new Error(`ZIP compression method ${method} is not supported`);
        if (p + 46 + nl + el + cl > offset + size)
            throw new Error('Nome ZIP truncado');
        const raw = decodeText(bytes.slice(p + 46, p + 46 + nl));
        const name = cleanPath(raw);
        if (local + 30 > offset || v.getUint32(local, true) !== 0x04034b50)
            throw new Error('Invalid ZIP header');
        const localNameLength = v.getUint16(local + 26, true), localExtra = v.getUint16(local + 28, true);
        if (local + 30 + localNameLength + localExtra + packed > offset)
            throw new Error('Dados ZIP fora dos limites');
        const localName = decodeText(bytes.slice(local + 30, local + 30 + localNameLength));
        if (localName !== raw)
            throw new Error('ZIP headers contain mismatched filenames');
        if (!raw.endsWith('/')) {
            const k = pathKey(name);
            if (names.has(k))
                throw new Error(`Nome duplicado no ZIP: ${name}`);
            names.set(k, expanded);
            crcs.set(k, v.getUint32(p + 16, true));
            total += expanded;
            if (expanded > LIMITS.file || total > LIMITS.total)
                throw new Error('Expanded ZIP exceeds memory limits');
            if (supported.test(name))
                safe.add(raw);
        }
        p += 46 + nl + el + cl;
    }
    let result: Record<string, Uint8Array>;
    try {
        result = unzipSync(bytes, { filter: f => safe.has(f.name) });
    }
    catch {
        throw new Error('Could not decompress: corrupt ZIP.');
    }
    return verifyInputs(Object.entries(result).map(([path, data]) => { if (crc32(data) !== crcs.get(pathKey(cleanPath(path))))
        throw new Error(`Invalid CRC: ${path}`); if (data.length !== names.get(pathKey(cleanPath(path))))
        throw new Error('Tamanho descompactado incorreto'); return { path, data }; }));
}
export async function readDirectory(files: FileList | File[], progress: (s: string) => void = () => { }): Promise<InputFile[]> { let total = 0; if (files.length > LIMITS.count)
    throw new Error('Folder exceeds 10,000 files'); const out: InputFile[] = []; for (const f of Array.from(files)) {
    if (!supported.test(f.name))
        continue;
    total += f.size;
    if (f.size > LIMITS.file || total > LIMITS.total)
        throw new Error('Folder exceeds memory limits');
    const path = cleanPath(f.webkitRelativePath || f.name);
    progress(`Lendo ${path}`);
    out.push({ path, data: new Uint8Array(await f.arrayBuffer()) });
} return verifyInputs(out); }
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k++)
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(bytes: Uint8Array) { let c = 0xffffffff; for (const b of bytes)
    c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

