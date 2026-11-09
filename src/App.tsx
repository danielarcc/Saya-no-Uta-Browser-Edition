import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { ContentPackage } from './content/types';
import type { Choice, Manifest, State } from './engine/types';
import { Engine } from './engine/vm';
import { Assets } from './engine/assets';
import { Renderer } from './engine/renderer';
import { AudioMixer, type Volumes } from './engine/audio';
import { listSaves, writeSave, deleteSave, validateSave, type Save } from './engine/storage';
const noopSubscribe = () => () => { };
const blank = () => null;
type BindAction = 'advance' | 'backlog' | 'save' | 'quickSave' | 'quickLoad' | 'config' | 'auto' | 'skip' | 'hide' | 'fullscreen' | 'menu';
const bindDefaults: Record<BindAction, string> = { advance: 'Space', backlog: 'KeyB', save: 'KeyD', quickSave: 'KeyS', quickLoad: 'KeyL', config: 'KeyC', auto: 'KeyA', skip: 'ControlLeft', hide: 'KeyH', fullscreen: 'KeyF', menu: 'Escape' };
const bindLabels: Record<BindAction, string> = { advance: 'Advance', backlog: 'History', save: 'Save / Load', quickSave: 'Quick save', quickLoad: 'Quick load', config: 'Settings', auto: 'Auto', skip: 'Skip read text (hold)', hide: 'Hide text', fullscreen: 'Fullscreen', menu: 'Menu' };
function savedBinds(): Record<BindAction, string> {
    try {
        const value = JSON.parse(localStorage.getItem('nps:keybinds') || '{}');
        const saved = Object.entries(value).filter(([key, binding]) =>
            key in bindDefaults && typeof binding === 'string'
        );
        return { ...bindDefaults, ...Object.fromEntries(saved) } as Record<BindAction, string>;
    } catch {
        return { ...bindDefaults };
    }
}

interface Settings extends Volumes {
    textMs: number;
    autoMs: number;
    textOpacity: number;
}
const defaults: Settings = { master: 0.8, bgm: 0.65, se: 0.7, voice: 1, textMs: 20, autoMs: 1400, textOpacity: 0.55 };
function savedSettings(): Settings {
    try {
        return { ...defaults, ...JSON.parse(localStorage.getItem('nps:settings') || '{}') };
    } catch {
        return defaults;
    }
}

function ChoiceButton({ choice, index, assets, onChoose, onHover }: {
    choice: Choice;
    index: number;
    assets: Assets;
    onChoose: () => void;
    onHover: () => void;
}) {
    const [hover, setHover] = useState(false), [frame, setFrame] = useState(0);
    useEffect(() => { if (choice.frames.length < 2)
        return; const id = setInterval(() => setFrame(n => (n + 1) % Math.max(1, choice.frames.length - 2)), 90); return () => clearInterval(id); }, [choice.frames.length]);
    const src = choice.frames.length ? assets.url(choice.frames[hover ? choice.frames.length - 1 : frame % choice.frames.length]) : undefined;
    return <button className={src ? 'image-choice' : 'text-choice'} style={{ left: choice.x, top: choice.y }} disabled={choice.disabled} onMouseEnter={() => { setHover(true); onHover(); }} onMouseLeave={() => setHover(false)} onFocus={() => { setHover(true); onHover(); }} onBlur={() => setHover(false)} onClick={e => { e.stopPropagation(); onChoose(); }} aria-label={choice.text} data-choice={index}>{src ? <img draggable={false} src={src} alt={choice.text}/> : choice.text}</button>;
}
function NativeButton({ kind, label, assets, onClick, disabled = false }: {
    kind: string;
    label: string;
    assets: Assets;
    onClick: () => void;
    disabled?: boolean;
}) {
    const [over, setOver] = useState(false);
    const key = `data/menu/${kind}-${disabled ? '04' : over ? '02' : '01'}.png`;
    return <button className="native-button" aria-label={label} disabled={disabled} onClick={onClick} onMouseEnter={() => setOver(true)} onMouseLeave={() => setOver(false)} onFocus={() => setOver(true)} onBlur={() => setOver(false)}><img src={assets.url(key)} alt={label}/></button>;
}
export interface AppProps {
    manifest: Manifest;
    uiManifest?: Manifest;
    content?: ContentPackage;
    scriptOverrides?: Record<string, string>;
    initialSave?: Save;
    onContent?: () => void;
    onContinue?: () => void;
    onReturnToMenu?: () => void;
    requireContent?: boolean;
    blocked?: boolean;
}
export function App({ manifest, uiManifest, content, scriptOverrides, initialSave, onContent, onContinue, onReturnToMenu, requireContent = false, blocked = false }: AppProps) {
    const canvas = useRef<HTMLCanvasElement>(null), viewport = useRef<HTMLDivElement>(null);
    const [assets] = useState(() => new Assets(manifest, { scripts: scriptOverrides, resources: content?.resources }));
    const [interfaceAssets] = useState(() => new Assets(uiManifest ?? manifest));
    const [mixer] = useState(() => new AudioMixer(assets));
    const renderer = useRef<Renderer | undefined>(undefined);
    const [engine, setEngine] = useState<Engine>();
    const state = useSyncExternalStore(engine?.subscribe ?? noopSubscribe, engine?.getSnapshot ?? blank);
    const [booted, setBooted] = useState(!manifest.development), [scale, setScale] = useState(1), [stageOffset, setStageOffset] = useState({ x: 0, y: 0 }), [panel, setPanel] = useState(''), [settings, setSettings] = useState(savedSettings), [toast, setToast] = useState(''), [logs, setLogs] = useState<string[]>([]), [slots, setSlots] = useState<Save[]>([]), [auto, setAuto] = useState(false), [skip, setSkip] = useState(false), [shown, setShown] = useState(0), [working, setWorking] = useState(false), [hidden, setHidden] = useState(false);
    const [bindings, setBindings] = useState(savedBinds), [rebinding, setRebinding] = useState<BindAction | null>(null);
    useEffect(() => { try {
        localStorage.setItem('nps:keybinds', JSON.stringify(bindings));
    }
    catch { } }, [bindings]);
    const [savePage, setSavePage] = useState(0), [selectedImage, setSelectedImage] = useState(''), [musicPlaying, setMusicPlaying] = useState('');
    const activePanel = panel || state?.modal || '';
    const text = state?.runs.map(r => r.text).join('\n') ?? '';
    // NPS controls progression. Never introduce synthetic click checkpoints.
    const displayed = settings.textMs === 0 ? text.length : shown;
    const dialogueRef = useRef<HTMLDivElement>(null);
    const spokenRef = useRef<HTMLDivElement>(null);
    const [pageOffset, setPageOffset] = useState(0);
    useLayoutEffect(() => {
        const viewport = dialogueRef.current;
        const spoken = spokenRef.current;
        if (!viewport || !spoken) {
            setPageOffset(0);
            return;
        }

        // Advance the visible text in whole-line pages only when it overflows.
        // This does not advance the VM or introduce extra NPS checkpoints.
        const lineHeight = parseFloat(getComputedStyle(spoken).lineHeight);
        const availableHeight = viewport.clientHeight - spoken.offsetTop;
        if (!Number.isFinite(lineHeight) || availableHeight <= 0) return;
        const linesPerPage = Math.max(1, Math.floor(availableHeight / lineHeight));
        const pageHeight = linesPerPage * lineHeight;
        const nextPage = Math.max(0, Math.ceil((spoken.scrollHeight - availableHeight - 1) / pageHeight));
        setPageOffset(nextPage * pageHeight);
    }, [displayed, state?.script, state?.box, state?.runs]);
    const error = (e: unknown) => setToast(e instanceof Error ? e.message : String(e));
    useEffect(() => {
        const render = new Renderer(canvas.current!, assets);
        renderer.current = render;
        const vm = new Engine(manifest, { commit: (...args) => render.commit(...args), wait: ms => render.wait(ms), flash: (...args) => render.flash(...args), scroll: (...args) => render.scroll(...args), play: (...args) => mixer.play(...args), stop: (...args) => mixer.stop(...args), stopAll: () => mixer.stopAll(), cancel: () => render.cancel(), report: s => setLogs(old => old.includes(s) ? old : [...old.slice(-99), s]), globalsChanged: g => { try {
                localStorage.setItem(`nps:${manifest.id}:globals`, JSON.stringify(g));
            }
            catch {
                setToast('Unable to save global variables.');
            } } }, name => assets.script(name));
        try {
            const g = JSON.parse(localStorage.getItem(`nps:${manifest.id}:globals`) || '{}');
            if (g && typeof g === 'object' && Object.values(g).every(x => typeof x === 'number'))
                vm.globals = g;
        }
        catch { }
        setEngine(vm);
        if (initialSave) {
            try {
                validateSave(initialSave, manifest);
                void vm.restore(initialSave.state).catch(e => setToast(String(e)));
            }
            catch (e) {
                setToast(String(e));
                void vm.start();
            }
        }
        else if (!manifest.development)
            void vm.start();
        return () => { vm.dispose(); assets.dispose(); interfaceAssets.dispose(); };
    }, [assets, manifest, mixer]);
    useEffect(() => {
        const el = viewport.current;
        if (!el)
            return;
        const update = () => {
            const full = document.fullscreenElement === el;
            const w = el.clientWidth || manifest.width;
            const h = el.clientHeight || (w * manifest.height / manifest.width);
            const next = full ? Math.min(w / manifest.width, h / manifest.height) : w / manifest.width;
            setScale(next);
            setStageOffset(full ? { x: Math.max(0, (w - manifest.width * next) / 2), y: Math.max(0, (h - manifest.height * next) / 2) } : { x: 0, y: 0 });
        };
        const observer = new ResizeObserver(update);
        observer.observe(el);
        document.addEventListener('fullscreenchange', update);
        window.addEventListener('resize', update);
        update();
        return () => { observer.disconnect(); document.removeEventListener('fullscreenchange', update); window.removeEventListener('resize', update); };
    }, [manifest.width, manifest.height]);
    useEffect(() => { mixer.setVolumes(settings); try {
        localStorage.setItem('nps:settings', JSON.stringify(settings));
    }
    catch { } }, [settings, mixer]);
    useEffect(() => { setShown(settings.textMs === 0 ? text.length : (state?.revealFrom ?? 0)); if (settings.textMs === 0)
        return; const id = setInterval(() => setShown(n => Math.min(text.length, n + 1)), Math.max(5, settings.textMs)); return () => clearInterval(id); }, [text, state?.pc, settings.textMs]);
    useEffect(() => { if (!toast)
        return; const id = setTimeout(() => setToast(''), 6000); return () => clearTimeout(id); }, [toast]);
    useEffect(() => { if (state?.waiting === 'choice' || state?.waiting === 'end' || state?.waiting === 'error') {
        setSkip(false);
        setAuto(false);
    } }, [state?.waiting]);
    useEffect(() => { if (skip && state?.waiting === 'click' && !state.wasRead)
        setSkip(false); if (!engine || !state || state.waiting !== 'click' || activePanel || blocked || (!auto && !skip))
        return; const id = setInterval(() => { if (skip && state.wasRead) {
        setShown(text.length);
        advance();
    }
    else if (shown >= text.length && !mixer.isVoicePlaying())
        advance(); }, skip ? 70 : settings.autoMs + (text.length - (state?.revealFrom ?? 0)) * 12); return () => clearInterval(id); }, [auto, skip, state?.pc, state?.waiting, state?.wasRead, shown, activePanel, blocked, engine, mixer, text.length, settings.autoMs]);
    async function refreshSlots() { setSlots(await listSaves(manifest.id)); }
    useEffect(() => { if (['save', 'load'].includes(activePanel))
        void refreshSlots().catch(error); }, [activePanel]);
    async function save(slot: number, silent = false) { if (!engine || !renderer.current)
        return; const snapshot = engine.snapshot(); snapshot.audio = mixer.snapshot(); const value: Save = { schema: 1, game: manifest.id, version: manifest.version, slot, date: new Date().toISOString(), thumbnail: renderer.current.thumbnail(), state: snapshot }; await writeSave(value); if (!silent) {
        await refreshSlots();
        setToast('Progress saved in this browser.');
    } }
    useEffect(() => { if (state?.saveEnabled && state.script !== manifest.entry && ['click', 'choice', 'end'].includes(state.waiting))
        void save(0, true).catch(error); }, [state?.script, state?.pc, state?.waiting]);
    async function load(value: Save) { if (!engine)
        return; setWorking(true); try {
        const checked = validateSave(value, manifest);
        await mixer.unlock();
        await engine.restore(checked.state);
        setPanel('');
        setSkip(false);
        setAuto(false);
        setToast('Progress restored.');
    }
    catch (e) {
        error(e);
    }
    finally {
        setWorking(false);
    } }
    async function start() { if (!engine)
        return; setWorking(true); try {
        await mixer.unlock();
        setBooted(true);
        setPanel('');
        await engine.start();
    }
    catch (e) {
        error(e);
    }
    finally {
        setWorking(false);
    } }
    function advance() {
        if (!engine || activePanel || working || blocked || state?.waiting !== 'click')
            return;
        if (hidden) {
            setHidden(false);
            return;
        }
        const visible = settings.textMs === 0 ? text.length : shown;
        if (visible < text.length) {
            setShown(text.length);
            return;
        }
        void engine.advance();
    }
    function returnToMenu() { setPanel(''); setHidden(false); setAuto(false); setSkip(false); setRebinding(null); if (onReturnToMenu)
        onReturnToMenu();
    else
        void start(); }
    function open(name: string) { setHidden(false); setPanel(name); setSkip(false); setAuto(false); }
    async function close() { setSelectedImage(''); if (activePanel === 'music') {
        await mixer.stop('bgm', 150);
        if (state?.audio.bgm)
            await mixer.play('bgm', state.audio.bgm, 150);
        setMusicPlaying('');
    } setPanel(''); if (state?.waiting === 'modal')
        await engine?.resume(); }
    async function quickLoad() { const values = await listSaves(manifest.id); const value = values.find(x => x.slot === 25); if (value)
        await load(value);
    else
        setToast('No quick save available.'); }
    async function fullscreen() { if (!document.fullscreenElement)
        await viewport.current?.requestFullscreen();
    else
        await document.exitFullscreen(); }
    useEffect(() => {
        function key(e: KeyboardEvent) {
            if (blocked || !booted)
                return;
            if (rebinding) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    setRebinding(null);
                    return;
                }
                if (['ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code))
                    return;
                e.preventDefault();
                if (Object.entries(bindings).some(([action, code]) => action !== rebinding && code === e.code)) {
                    setToast('This key is already assigned to another action.');
                    return;
                }
                setBindings(v => ({ ...v, [rebinding]: e.code }));
                setRebinding(null);
                return;
            }
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName) || e.altKey || e.metaKey)
                return;
            const eventCode = e.code || (e.key === ' ' || e.key === 'Spacebar' ? 'Space' : e.key === 'Enter' ? 'Enter' : e.key === 'Escape' ? 'Escape' : e.key === 'Control' ? 'ControlLeft' : e.key.length === 1 && /^[a-z]$/i.test(e.key) ? `Key${e.key.toUpperCase()}` : '');
            const action = (Object.keys(bindings) as BindAction[]).find(k => bindings[k] === eventCode || (k === 'advance' && eventCode === 'Enter' && bindings.advance === 'Space'));
            if (!action)
                return;
            e.preventDefault();
            if (e.repeat && action !== 'skip')
                return;
            if (action === 'menu') {
                if (activePanel)
                    void close();
                else
                    open('pause');
                return;
            }
            if (activePanel)
                return;
            switch (action) {
                case 'advance':
                    advance();
                    break;
                case 'backlog':
                    open('backlog');
                    break;
                case 'save':
                    open('save');
                    break;
                case 'quickSave':
                    void save(25).catch(error);
                    break;
                case 'quickLoad':
                    void quickLoad().catch(error);
                    break;
                case 'config':
                    open('config');
                    break;
                case 'auto':
                    setAuto(v => !v);
                    break;
                case 'skip':
                    setSkip(true);
                    break;
                case 'hide':
                    setHidden(v => !v);
                    break;
                case 'fullscreen':
                    void fullscreen().catch(error);
                    break;
            }
        }
        const up = (e: KeyboardEvent) => { if (e.code === bindings.skip || (!e.code && e.key === 'Control' && bindings.skip === 'ControlLeft'))
            setSkip(false); };
        window.addEventListener('keydown', key);
        window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', up); };
    });
    function exportSave(value: Save) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${manifest.id}-slot-${value.slot}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
    async function exportAllSaves() {
        const saves = await listSaves(manifest.id);
        if (!saves.length) {
            setToast('No saves available to export.');
            return;
        }
        const blob = new Blob([JSON.stringify({ format: 'nps-save-bundle-v1', game: manifest.id, saves }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${manifest.id}-all-saves.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    async function importSave(file: File | undefined) {
        if (!file)
            return;
        try {
            if (file.size > 5000000)
                throw new Error('Save file exceeds 5 MB');
            const raw = JSON.parse(await file.text());
            const bundle = raw?.format === 'nps-save-bundle-v1';
            if (bundle && (!Array.isArray(raw.saves) || raw.game !== manifest.id || raw.saves.length > 26))
                throw new Error('Invalid save bundle or wrong game.');
            const values: Save[] = (bundle ? raw.saves : [raw]).map((item: unknown) => validateSave(item, manifest));
            if (!values.length)
                throw new Error('Save bundle is empty.');
            if (new Set(values.map(v => v.slot)).size !== values.length)
                throw new Error('Duplicate slots in save bundle.');
            if (!confirm(bundle ? `Import ${values.length} saves? Matching slots will be overwritten.` : `Import and overwrite slot ${values[0].slot}?`))
                return;
            for (const value of values)
                await writeSave(value);
            await refreshSlots();
            setToast(`${values.length} save(s) imported.`);
        }
        catch (e) {
            error(e);
        }
    }
    const canSave = !!state?.saveEnabled && ['click', 'choice', 'end'].includes(state.waiting);
    return <main className="app" inert={blocked}>
 {manifest.development && <header className="app-header"><div><span className="dot"/> NPS <span className="muted">/ LOCAL ENGINE</span></div><span className="build">0.2 · development</span></header>}
 <div className="viewport" ref={viewport} onPointerDown={() => void mixer.unlock().catch(error)} style={{ aspectRatio: `${manifest.width}/${manifest.height}` }}>
 <div className="stage" style={{ width: manifest.width, height: manifest.height, transform: `translate(${stageOffset.x}px, ${stageOffset.y}px) scale(${scale})` }} onClick={advance} onWheel={e => { if (e.deltaY < 0 && state?.waiting === 'click')
        open('backlog'); }} onContextMenu={e => { e.preventDefault(); if (state?.waiting === 'choice') {
        const i = state.choices.findIndex(c => c.shortcut === 'MouseDownR');
        if (i >= 0) {
            void engine?.choose(i);
            return;
        }
    } if (activePanel)
        void close();
    else
        open('pause'); }}>
 <canvas ref={canvas} width={manifest.width} height={manifest.height} aria-label="Scene canvas"/>
 {booted && state && <>
 {!hidden && text && <div className={`dialogue box-${state.box} ${state.center ? 'center' : ''}`} style={{ '--text-opacity': settings.textOpacity } as CSSProperties}><div ref={dialogueRef} className="dialogue-scroll" aria-live="polite">{manifest.development && <div className="speaker">{state.speaker}</div>}<div className="spoken" ref={spokenRef} style={{ transform: `translateY(-${pageOffset}px)` }}>{(() => { let used = 0; return state.runs.map((r, i) => { const runStart = used; const visibleCount = Math.max(0, Math.min(r.text.length, displayed - runStart)); const value = r.text.slice(0, visibleCount); used += r.text.length + 1; if (displayed <= runStart) return null; const newline = i < state.runs.length - 1 && displayed > runStart + r.text.length ? '\n' : ''; return <span className={r.italic ? 'italic' : ''} key={i}>{value}{newline}</span>; }); })()}</div>{state.waiting === 'click' && displayed >= text.length && <span className="next native-eye" aria-label="Click to continue"/>}</div></div>}
 {state.waiting === 'choice' && state.choices.map((c, i) => <ChoiceButton key={`${state.script}:${state.pc}:${i}`} choice={c} index={i} assets={assets} onHover={() => { if (c.onse)
            void mixer.play('se:ui', { src: c.onse, loop: false, volume: 1 }, 0).catch(error); }} onChoose={() => { if (requireContent && state.script === manifest.entry && c.href === 'cafeteria.nps') {
            onContent?.();
            return;
        } setWorking(true); void engine?.choose(i).finally(() => setWorking(false)); }}/>)}
 {state.waiting === 'end' && <div className="end-card" onClick={e => e.stopPropagation()}><span className="eyebrow">End</span><h2>End of script</h2><p>No further script transition is defined.</p><button onClick={returnToMenu}>Return to title</button><button onClick={() => open('credits')}>Credits</button></div>}
 {state.waiting === 'error' && <div className="end-card error-card" onClick={e => e.stopPropagation()}><h2>Execution stopped</h2><p>{state.error}</p><p>The command was not skipped. See the compatibility documentation.</p><button onClick={returnToMenu}>Return to title</button><button onClick={() => open('diagnostics')}>Diagnostics</button></div>}

 <div className="port-credit" onClick={e => e.stopPropagation()}>Web Port by <a href="https://github.com/danielarcc" target="_blank" rel="noopener noreferrer">Daniel Arc</a></div>
 </>}
 {!booted && <div className="launch" onClick={e => e.stopPropagation()}><span className="eyebrow">LOCAL BUILD · 1280 × 960</span><h1>NPS<br /><em>Local Engine</em></h1><p>NPS script reader with the original visual interface.<br />Includes a separate test script for validation.</p><button className="primary" disabled={!engine || working} onClick={() => void start()}>Open engine <span>↗</span></button><small>Click to enable browser audio.</small></div>}
 </div>
 {activePanel && <section className={`overlay panel-${activePanel}`} style={{ width: manifest.width, height: manifest.height, transform: `translate(${stageOffset.x}px, ${stageOffset.y}px) scale(${scale})`, transformOrigin: 'top left' }} role="dialog" aria-modal="true" aria-label={activePanel} onClick={e => e.stopPropagation()}><header><div><h2>{{ pause: 'Pause', config: 'Settings', keybinds: 'Keyboard shortcuts', save: 'Save progress', load: 'Load progress', backlog: 'History', credits: 'Original credits', diagnostics: 'Diagnostics', gallery: 'CG Library', music: 'Sound Library' }[activePanel] ?? activePanel}</h2></div><button onClick={() => void close()} aria-label="Close panel">✕</button></header><div className="panel-content">
 {activePanel === 'pause' && <div className="pause-menu">
 <NativeButton kind="cancel" label="Resume" assets={interfaceAssets} onClick={() => void close()}/>
 <NativeButton kind="messagenon" label="Hide text" assets={interfaceAssets} onClick={() => { void close(); setHidden(true); }}/>
 <NativeButton kind="automessage" label="Auto" assets={interfaceAssets} onClick={() => { void close(); setAuto(true); }}/>
 <NativeButton kind="skip" label="Skip read text" assets={interfaceAssets} onClick={() => { void close(); setSkip(true); }}/>
 <NativeButton kind="log" label="History" assets={interfaceAssets} onClick={() => setPanel('backlog')}/>
 <NativeButton kind="data" label="Save / Load" assets={interfaceAssets} onClick={() => setPanel('save')}/>
 <NativeButton kind="qsave" label="Quick save" assets={interfaceAssets} disabled={!canSave} onClick={() => void save(25).then(close).catch(error)}/>
 <NativeButton kind="qload" label="Quick load" assets={interfaceAssets} onClick={() => void quickLoad().catch(error)}/>
 <NativeButton kind="fullscreen" label="Fullscreen" assets={interfaceAssets} onClick={() => void fullscreen().catch(error)}/>
 <NativeButton kind="config" label="Settings" assets={interfaceAssets} onClick={() => setPanel('config')}/>
 <NativeButton kind="title" label="Title screen" assets={interfaceAssets} onClick={() => { if (confirm('Return to the title screen?'))
                returnToMenu(); }}/>
 <NativeButton kind="fin" label="Exit" assets={interfaceAssets} onClick={() => { if (confirm('Exit reading and return to the title screen?'))
                returnToMenu(); }}/>
 {manifest.development && <button onClick={() => setPanel('diagnostics')}>Diagnostics</button>}
 </div>}
 {activePanel === 'config' && <><p className="muted">Reading and audio settings</p>{([['master', 'Master volume'], ['bgm', 'Music'], ['se', 'Sound effects'], ['voice', 'Voice']] as const).map(([k, label]) => <label className="setting" key={k}><span>{label}</span><input aria-label={label} type="range" min="0" max="1" step="0.01" value={settings[k]} onChange={e => setSettings(v => ({ ...v, [k]: Number(e.target.value) }))}/><output>{Math.round(settings[k] * 100)}%</output></label>)}<label className="setting"><span>Dialogue box opacity</span><input aria-label="Dialogue box opacity" type="range" min="0" max="1" step="0.05" value={settings.textOpacity} onChange={e => setSettings(v => ({ ...v, textOpacity: Number(e.target.value) }))}/><output>{Math.round(settings.textOpacity * 100)}%</output></label><label className="setting"><span>Text speed</span><input aria-label="Text speed" type="range" min="0" max="60" step="5" value={settings.textMs} onChange={e => setSettings(v => ({ ...v, textMs: Number(e.target.value) }))}/><output>{settings.textMs} ms</output></label><label className="setting"><span>Auto-play delay</span><input type="range" min="500" max="5000" step="100" value={settings.autoMs} onChange={e => setSettings(v => ({ ...v, autoMs: Number(e.target.value) }))}/><output>{settings.autoMs} ms</output></label><p className="muted">Keyboard shortcuts can be changed in Settings → Keybindings.</p><button onClick={() => setPanel('keybinds')}>Keyboard shortcuts · Customize</button><button onClick={() => setSettings(defaults)}>Restore defaults</button></>}
 {['save', 'load'].includes(activePanel) && <><div className="save-tools"><div className="save-tabs"><button className={activePanel === 'save' ? 'active' : ''} onClick={() => setPanel('save')}>Save</button><button className={activePanel === 'load' ? 'active' : ''} onClick={() => setPanel('load')}>Load</button></div><p>{activePanel === 'save' ? 'Choose a slot. Overwriting a save requires confirmation.' : 'Choose a save to continue.'}</p>{activePanel === 'load' && <div className="save-import-export"><label className="file-button">Import save<input type="file" accept="application/json,.json" onChange={e => { void importSave(e.target.files?.[0]); e.currentTarget.value = ''; }}/></label><button type="button" onClick={() => void exportAllSaves().catch(error)}>Export all saves</button></div>}</div>{activePanel === 'save' && !canSave && <p className="warning">Saving is unavailable here. Wait for dialogue or a choice.</p>}<div className="save-grid">{(savePage === 4 ? [25] : savePage === 0 ? [0, 1, 2, 3, 4, 5] : Array.from({ length: 6 }, (_, i) => (savePage - 1) * 6 + i + 6)).map(slot => { const value = slots.find(s => s.slot === slot); return <article className="save-slot" key={slot}><button className="slot-main" disabled={working || (activePanel === 'save' ? (!canSave || slot === 0) : !value)} onClick={() => { if (activePanel === 'save') {
            if (value && !confirm('Overwrite this save?'))
                return;
            void save(slot).catch(error);
        }
        else if (value)
            void load(value); }}><div className="slot-preview">{value ? <img src={value.thumbnail} alt="Scene preview"/> : <span>—</span>}</div><strong>{slot === 0 ? 'Autosave' : slot === 25 ? 'Quick save' : `Slot ${String(slot).padStart(2, '0')}`}</strong><small>{value ? new Date(value.date).toLocaleString('en-US') : 'Empty'}</small>{value && <span className="save-text">{value.state.runs.map(r => r.text).join(' ').slice(0, 65) || value.state.script}</span>}</button>{value && <div className="slot-actions"><button onClick={() => exportSave(value)}>Export</button><button onClick={() => { if (confirm('Delete this save?'))
            void deleteSave(manifest.id, slot).then(refreshSlots).catch(error); }}>Delete</button></div>}</article>; })}</div><div className="save-pages">{[0, 1, 2, 3, 4].map(p => <button key={p} className={savePage === p ? 'active' : ''} onClick={() => setSavePage(p)}>{p === 4 ? 'Quick' : String(p + 1).padStart(2, '0')}</button>)}</div></>}
 {activePanel === 'keybinds' && <div className="bind-list"><p className="muted">Select an action and press a key. Esc cancels. A key can only be assigned once.</p>{(Object.keys(bindLabels) as BindAction[]).map(action => <div className="bind-row" key={action}><span>{bindLabels[action]}</span><button className={rebinding === action ? 'active' : ''} onClick={() => setRebinding(action)}>{rebinding === action ? 'Press a key…' : bindings[action].replace(/^Key/, '').replace(/^Digit/, '').replace('Space', 'Space').replace('ControlLeft', 'Left Ctrl')}</button></div>)}<button onClick={() => { setBindings({ ...bindDefaults }); setRebinding(null); }}>Reset keybindings</button><button onClick={() => { setRebinding(null); setPanel('config'); }}>Back to settings</button></div>}
 {activePanel === 'backlog' && <div className="backlog">{state?.backlog.length ? state.backlog.map((b, i) => <article key={i}><small>{String(i + 1).padStart(3, '0')} {b.speaker && `/ ${b.speaker}`}</small><p>{b.text}</p>{b.voice && <button onClick={() => void mixer.play('voice', { src: b.voice!, volume: 1, loop: false }, 0).catch(error)}>▶ Replay voice</button>}</article>) : <p>No dialogue in history yet.</p>}</div>}
 {activePanel === 'credits' && <div className="credits"><p>Original credits are displayed below.</p>{manifest.credits.map(src => <img key={src} src={assets.url(src)} alt={`Original credits — ${src}`}/>)}<div className="additional-credit"><p>Web Port by <a href="https://github.com/danielarcc" target="_blank" rel="noopener noreferrer">Daniel Arc</a></p><p>NSFW Content Censorship by Eduardo Hayashi</p></div><div className="port-disclosure"><p>Unofficial fan-made web port. Saya no Uta belongs to its respective rights holders. This project is not affiliated with or endorsed by the original creators.</p><p>Original work: <strong>Saya no Uta (The Song of Saya)</strong> — Nitroplus. All original game assets and trademarks belong to their respective owners.</p><p>For support or copyright concerns, including removal requests from rights holders, contact <a href="mailto:sunsteel127@gmail.com">sunsteel127@gmail.com</a>. The project maintainer is willing to cooperate with Nitroplus and other rights holders on removal requests.</p></div></div>}
 {activePanel === 'gallery' && <div className="gallery">{selectedImage ? <button className="gallery-full" aria-label="Back to gallery" onClick={() => setSelectedImage('')}><img src={assets.url(selectedImage)} alt="Selected scene"/></button> : <div className="gallery-grid">{manifest.gallery?.map((src, i) => <button key={src} onClick={() => setSelectedImage(src)} aria-label={`Open image ${i + 1}`}><img src={assets.url(src)} alt={`Scene ${i + 1}`}/></button>)}</div>}</div>}
 {activePanel === 'music' && <div className="music-list">{manifest.music?.map((track, i) => <button key={track.src} className={musicPlaying === track.src ? 'active' : ''} onClick={() => { void mixer.play('bgm', { src: track.src, loop: true, volume: 1, crossfadeMs: 350 }, 350).then(() => setMusicPlaying(track.src)).catch(error); }}><span>{String(i + 1).padStart(2, '0')}</span>{track.title}<span>{musicPlaying === track.src ? '■' : '▶'}</span></button>)}<button onClick={() => { void mixer.stop('bgm', 300); setMusicPlaying(''); }}>Stop</button></div>}
 {activePanel === 'diagnostics' && <><p>Project: {manifest.id} / {manifest.version}</p><p>Script: {state?.script} · next instruction: {state?.pc} · state: {state?.waiting}</p><pre>{JSON.stringify({ local: state?.vars, globals: engine?.globals }, null, 2)}</pre><h3>Technical warnings</h3>{logs.length ? logs.map((l, i) => <p className="log" key={i}>{l}</p>) : <p>No warnings recorded.</p>}<p>Compatibility details are documented in docs/COMPATIBILIDADE.md.</p></>}
 </div></section>}
 </div>
 <nav className={`toolbar ${state?.script === manifest.entry ? 'on-title' : ''}`} aria-label="Controls"><button disabled={!booted} onClick={returnToMenu}>Menu</button><button disabled={!booted} onClick={() => open('backlog')}>History</button><button disabled={!booted} onClick={() => open('save')}>Save</button><button disabled={!booted} onClick={() => open('load')}>Load</button><span /><button className={auto ? 'active' : ''} disabled={!booted || state?.waiting !== 'click'} onClick={() => setAuto(v => !v)}>Auto</button><button onClick={() => void fullscreen().catch(error)} aria-label="Fullscreen">⛶</button></nav>

 {toast && <div className="toast" role="status">{toast}</div>}
 </main>;
}

