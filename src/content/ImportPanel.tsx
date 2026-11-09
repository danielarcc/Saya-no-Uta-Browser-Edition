import { useEffect, useRef, useState } from 'react';
import { installPackage, listPackages, activatePackage } from './repository';
import type { ContentPackage, PackageInfo } from './types';
export function ImportPanel({ active, onClose, onActivate, onContinue }: {
    active?: string;
    onClose: () => void;
    onActivate: (pkg: ContentPackage, entry: string) => void;
    onContinue: () => void;
}) {
    const [packages, setPackages] = useState<PackageInfo[]>([]), [draft, setDraft] = useState<ContentPackage>(), [file, setFile] = useState(''), [marker, setMarker] = useState(''), [status, setStatus] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const worker = useRef<Worker | undefined>(undefined);
    useEffect(() => { void listPackages().then(setPackages).catch(e => setError(String(e))); return () => worker.current?.terminate(); }, []);
    function cancel() { worker.current?.terminate(); worker.current = undefined; setBusy(false); setStatus('Import canceled. The active package has not changed.'); }
    function inspect(zip?: File, selected?: FileList) {
        worker.current?.terminate();
        setDraft(undefined);
        setError('');
        setBusy(true);
        setStatus('Preparing local files…');
        try {
            const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
            worker.current = w;
            w.onmessage = (e: MessageEvent<{
                type: string;
                message?: string;
                pkg?: ContentPackage;
            }>) => { if (worker.current !== w)
                return; if (e.data.type === 'progress') {
                setStatus(e.data.message ?? '');
                return;
            } w.terminate(); worker.current = undefined; setBusy(false); if (e.data.type === 'error') {
                setError(e.data.message ?? 'Import failed');
                setStatus('');
                return;
            } const pkg = e.data.pkg!; setDraft(pkg); const hash = pkg.entry.indexOf('#'); setFile(hash < 0 ? pkg.entry : pkg.entry.slice(0, hash)); setMarker(hash < 0 ? '' : pkg.entry.slice(hash + 1)); setStatus('Analysis complete. Check the starting point before activating.'); };
            w.onerror = e => { w.terminate(); worker.current = undefined; setBusy(false); setError(e.message || 'Failed to process package.'); };
            w.postMessage(zip ? { zip } : { files: Array.from(selected ?? []).filter(f => /\.(nps|h|json|png|jpe?g|webp|bmp|ogg|wav|mp3|m4a|flac|opus)$/i.test(f.name)).map(f => ({ path: f.webkitRelativePath || f.name, blob: f })) });
        }
        catch (e) {
            setBusy(false);
            setError(e instanceof Error ? e.message : String(e));
        }
    }
    async function activate() { if (!draft)
        return; setBusy(true); setError(''); try {
        const entry = file + (marker ? '#' + marker : '');
        await installPackage(draft, entry);
        onActivate(draft, entry);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setBusy(false);
    } }
    async function existing(p: PackageInfo) { setBusy(true); try {
        const pkg = await activatePackage(p.id, p.entry);
        onActivate(pkg, p.entry);
    }
    catch (e) {
        setError(String(e));
        setBusy(false);
    } }
    const errors = draft?.issues.filter(i => i.severity === 'error') ?? [];
    const warnings = draft?.issues.filter(i => i.severity === 'warning') ?? [];
    return <div className="content-backdrop"><section className="content-manager" role="dialog" aria-modal="true" aria-label="Import content"><header><h1>Local content</h1><button onClick={onClose} disabled={busy && !worker.current} aria-label="Close import">✕</button></header><div className="content-body">
 <p>Select an authorized, non-explicit content package. Files stay in this browser and are not uploaded to a server.</p>
 <div className="content-actions"><label className="content-file">Select folder<input aria-label="Select folder" type="file" multiple {...{ webkitdirectory: '', directory: '' }} disabled={busy} onChange={e => { if (e.target.files?.length)
        inspect(undefined, e.target.files); e.target.value = ''; }}/></label><label className="content-file">Select ZIP<input aria-label="Select ZIP" type="file" accept=".zip,application/zip" disabled={busy} onChange={e => { if (e.target.files?.[0])
        inspect(e.target.files[0]); e.target.value = ''; }}/></label>{busy && worker.current && <button onClick={cancel}>Cancel analysis</button>}</div>
 {status && <p role="status">{status}</p>}{error && <p role="alert" className="content-error">{error}</p>}
 {draft && <><h2>{draft.title}</h2><p>{draft.scriptCount} scripts · {Object.keys(draft.resources).length} assets · {(draft.bytes / 1048576).toFixed(1)} MiB</p>
 <label className="content-field">Starting script<select aria-label="Starting script" value={file} disabled={busy} onChange={e => { setFile(e.target.value); setMarker(''); }}><option value="">Select where the story begins</option>{draft.entries.map(e => <option key={e.file} value={e.file}>{e.file}{draft.suggestedEntries.includes(e.file) ? ' — no incoming script link' : ''}</option>)}</select></label>
 <label className="content-field">Starting marker<select aria-label="Starting marker" value={marker} disabled={busy || !file} onChange={e => setMarker(e.target.value)}><option value="">Beginning of file</option>{draft.entries.find(e => e.file === file)?.labels.map(l => <option key={l} value={l}>#{l}</option>)}</select></label>
 {!draft.entry && <p>The package has multiple possible starting points. Choose the correct script above.</p>}
 <p>{errors.length} error(s) · {warnings.length} warning(s)</p>{draft.issues.length > 0 && <ol className="content-issues">{draft.issues.map((i, n) => <li key={n} className={i.severity === 'error' ? 'content-error' : ''}><strong>{i.file}{i.line ? `:${i.line}` : ''}</strong> — {i.message}</li>)}</ol>}
 <button disabled={busy || !file || !!errors.length} onClick={() => void activate()}>Activate package</button>
 {errors.length > 0 && <p>The package was not activated. Fix the listed issues and import it again.</p>}
 </>}
 <h2>Packages in this browser</h2>{packages.length ? packages.map(p => <article className="content-installed" key={p.id}><div><strong>{p.title}{active === p.id ? ' · active' : ''}</strong><p>{p.entry} · {p.scriptCount} scripts</p></div><button disabled={busy} onClick={() => void existing(p)}>Use package</button></article>) : <p>No packages imported.</p>}
 {active && <button disabled={busy} onClick={onContinue}>Continue — latest save</button>}
 <p className="content-footnote">ZIP files up to 512 MiB; extracted content up to 1 GiB. Closing this tab during analysis cancels installation. Clearing browser data removes packages and progress. Export saves to keep a backup.</p>
 </div></section></div>;
}

