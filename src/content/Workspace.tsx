import { useEffect, useMemo, useState } from 'react';
import { App } from '../App';
import type { Manifest } from '../engine/types';
import { listSaves, type Save } from '../engine/storage';
import { getActive, getPackage } from './repository';
import { makeRuntime } from './runtime';
import { ImportPanel } from './ImportPanel';
import { loadPreinstalled, makePreinstalledRuntime, type PreinstalledIndex } from './preinstalled';
import type { ContentPackage } from './types';
function visitedThisTab(): boolean {
    try {
        const key = 'nps:tab-visited';
        const previous = window.sessionStorage.getItem(key) === '1';
        window.sessionStorage.setItem(key, '1');
        return previous;
    }
    catch {
        try {
            const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
            return navigation?.type === 'reload';
        }
        catch {
            return false;
        }
    }
}
export function Workspace({ base, menuSource }: {
    base: Manifest;
    menuSource: string;
}) {
    const [restoreOnMount] = useState(visitedThisTab);
    const [current, setCurrent] = useState<{
        kind: 'browser';
        pkg: ContentPackage;
        entry: string;
    } | {
        kind: 'preinstalled';
        index: PreinstalledIndex;
    }>(), [ready, setReady] = useState(false), [open, setOpen] = useState(false), [error, setError] = useState(''), [resume, setResume] = useState<Save>(), [sequence, setSequence] = useState(0), [hydrated, setHydrated] = useState(false), [atTitle, setAtTitle] = useState(false);
    useEffect(() => { let alive = true; void (async () => { try {
        const installed = await loadPreinstalled();
        if (installed) {
            if (alive)
                setCurrent({ kind: 'preinstalled', index: installed });
        }
        else {
            const active = await getActive();
            if (active) {
                const pkg = await getPackage(active.id);
                if (pkg && alive)
                    setCurrent({ kind: 'browser', pkg, entry: active.entry });
                else if (alive)
                    setError('The active package is unavailable. Import it again.');
            }
        }
    }
    catch (e) {
        if (alive)
            setError(String(e));
    }
    finally {
        if (alive)
            setReady(true);
    } })(); return () => { alive = false; }; }, []);
    const runtime = useMemo(() => !current ? undefined : current.kind === 'preinstalled' ? makePreinstalledRuntime(base, menuSource, current.index) : makeRuntime(base, menuSource, current.pkg, current.entry), [base, menuSource, current]);
    useEffect(() => {
        if (!runtime)
            return;
        let alive = true;
        setHydrated(false);
        void (async () => {
            try {
                if (restoreOnMount) {
                    const saves = await listSaves(runtime.manifest.id);
                    const automatic = saves.find(s => s.slot === 0 && s.version === runtime.manifest.version);
                    if (alive)
                        setResume(automatic);
                }
                else if (alive)
                    setResume(undefined);
            }
            catch (e) {
                if (alive)
                    setError(e instanceof Error ? e.message : String(e));
            }
            finally {
                if (alive)
                    setHydrated(true);
            }
        })();
        return () => { alive = false; };
    }, [runtime, restoreOnMount]);
    function activate(pkg: ContentPackage, entry: string) { setAtTitle(false); setCurrent({ kind: 'browser', pkg, entry }); setResume(undefined); setSequence(n => n + 1); setOpen(false); setError(''); }
    async function continueReading() { setAtTitle(false); if (!current) {
        setOpen(true);
        return;
    } try {
        const saves = (await listSaves(runtime!.manifest.id)).filter(s => s.version === runtime?.manifest.version).sort((a, b) => b.date.localeCompare(a.date));
        if (!saves.length) {
            setError('No saves found for this package. Select Start to begin.');
            return;
        }
        setResume(saves[0]);
        setSequence(n => n + 1);
        setOpen(false);
        setError('');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    } }
    if (!ready || (runtime && !hydrated))
        return <main>Loading local content…</main>;
    return <><App key={`${atTitle ? 'title' : runtime?.manifest.id ?? 'builtin'}:${sequence}`} manifest={atTitle ? base : runtime?.manifest ?? base} uiManifest={base} content={current?.kind === 'browser' ? current.pkg : undefined} scriptOverrides={runtime?.scripts} initialSave={atTitle ? undefined : resume} onReturnToMenu={() => { setAtTitle(true); setResume(undefined); setSequence(n => n + 1); }} onContent={() => { if (atTitle && current) {
        setAtTitle(false);
        setResume(undefined);
        setSequence(n => n + 1);
    }
    else
        setOpen(true); }} onContinue={() => void continueReading()} requireContent={!current || atTitle} blocked={open}/>
 {open && <ImportPanel active={current?.kind === 'browser' ? current.pkg.id : undefined} onClose={() => setOpen(false)} onActivate={activate} onContinue={() => void continueReading()}/>}
 {error && <div className="toast content-toast" role="alert">{error} <button onClick={() => setError('')}>OK</button></div>}
 </>;
}

