import type { ContentPackage, PackageInfo, ActiveContent } from './types';
const DB = 'nps-content-v1';
function db(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => { r.result.createObjectStore('packages', { keyPath: 'id' }); r.result.createObjectStore('catalog', { keyPath: 'id' }); r.result.createObjectStore('settings'); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function read<T>(store: string, key: IDBValidKey): Promise<T | undefined> { const d = await db(); return new Promise((resolve, reject) => { const tx = d.transaction(store); const r = tx.objectStore(store).get(key); tx.oncomplete = () => { d.close(); resolve(r.result); }; tx.onerror = () => { d.close(); reject(tx.error); }; }); }
export const getPackage = (id: string) => read<ContentPackage>('packages', id);
export const getActive = () => read<ActiveContent>('settings', 'active');
export async function listPackages(): Promise<PackageInfo[]> { const d = await db(); return new Promise((resolve, reject) => { const tx = d.transaction('catalog'); const r = tx.objectStore('catalog').getAll(); tx.oncomplete = () => { d.close(); resolve(r.result); }; tx.onerror = () => { d.close(); reject(tx.error); }; }); }
export async function installPackage(pkg: ContentPackage, entry: string) {
    if (pkg.issues.some(i => i.severity === 'error'))
        throw new Error('Corrija os erros do pacote antes de ativar.');
    validateEntry(pkg, entry);
    const { id, title, fingerprint, created, bytes, fileCount, scriptCount } = pkg;
    const d = await db();
    return new Promise<void>((resolve, reject) => { const tx = d.transaction(['packages', 'catalog', 'settings'], 'readwrite'); tx.objectStore('packages').put(pkg); tx.objectStore('catalog').put({ id, title, fingerprint, created, bytes, fileCount, scriptCount, entry }); tx.objectStore('settings').put({ id, entry }, 'active'); tx.oncomplete = () => { d.close(); resolve(); }; tx.onabort = tx.onerror = () => { d.close(); reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'Espaço do navegador insuficiente. O pacote anterior foi preservado.' : `Não foi possível salvar o pacote: ${tx.error?.message ?? 'transação cancelada'}`)); }; });
}
export function validateEntry(pkg: ContentPackage, entry: string) { const hash = entry.indexOf('#'), file = hash < 0 ? entry : entry.slice(0, hash), marker = hash < 0 ? '' : entry.slice(hash + 1); const e = pkg.entries.find(e => e.file === file); if (!e || (marker && !e.labels.includes(marker)))
    throw new Error('Choose an existing starting script and marker.'); }
export async function activatePackage(id: string, entry: string) { const pkg = await getPackage(id); if (!pkg)
    throw new Error('Content not found in this browser. Import it again.'); await installPackage(pkg, entry); return pkg; }

