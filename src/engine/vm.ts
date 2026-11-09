import { resolveTarget } from './paths';
import { parse, type Script, type Token } from './parser';
import { evaluate, type Variables } from './expression';
import { emptyScene, type Choice, type Host, type Manifest, type State, type Track } from './types';
const clone = <T>(x: T): T => structuredClone(x);
const n = (s: string | undefined, f = 0) => s === undefined || s === '' ? f : Number(s);
export class Engine {
    state: State;
    globals: Variables = {};
    private scripts = new Map<string, Script>();
    private listeners = new Set<() => void>();
    private epoch = 0;
    private busy = false;
    constructor(readonly manifest: Manifest, readonly host: Host, readonly readFile: (name: string) => Promise<string>) { this.state = this.initial(); }
    private initial(): State { return { script: this.manifest.entry, pc: 0, vars: {}, scene: emptyScene(), pending: emptyScene(), runs: [], italic: false, center: false, box: '9', speaker: '', choices: [], waiting: 'running', backlog: [], audio: {}, saveEnabled: true, read: {}, wasRead: false, revision: 0, segmentStart: 0, revealFrom: 0, shading: false, extraCG: false, menuMask: "#00" }; }
    subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
    getSnapshot = () => this.state;
    private emit() { this.state = { ...this.state, revision: this.state.revision + 1 }; for (const f of this.listeners)
        f(); }
    private vars() { return { ...this.globals, ...this.state.vars }; }
    private async script(name: string) { if (!Object.hasOwn(this.manifest.scripts, name))
        throw new Error(`Script missing from manifest: ${name}`); if (!this.scripts.has(name))
        this.scripts.set(name, parse(await this.readFile(name), name)); return this.scripts.get(name)!; }
    dispose() { this.epoch++; this.busy = false; this.host.cancel(); this.host.stopAll(); }
    async start(name = this.manifest.entry) { this.epoch++; this.host.cancel(); this.host.stopAll(); this.busy = false; const read = this.state.read; this.state = this.initial(); this.state.read = read; try {
        await this.jump(name);
    }
    catch (e) {
        this.fail(e);
        return;
    } this.emit(); await this.run(); }
    async advance() { if (this.busy || this.state.waiting !== 'click')
        return; if (this.manifest.textMode !== 'nvl') {
        this.state.runs = [];
        this.state.segmentStart = 0;
        this.state.revealFrom = 0;
    }
    else
        this.state.revealFrom = this.state.runs.map(r => r.text).join('\n').length; this.state.voice = undefined; this.state.speaker = ''; await this.host.stop('voice', 0); delete this.state.audio.voice; this.state.waiting = 'running'; await this.run(); }
    async choose(index: number) {
        if (this.busy || this.state.waiting !== 'choice')
            return;
        const c = this.state.choices[index];
        if (!c || c.disabled)
            return;
        this.state.choices = [];
        this.state.runs = [];
        this.state.segmentStart = 0;
        this.state.revealFrom = 0;
        this.state.waiting = 'running';
        try {
            if (c.pushse)
                await this.host.play('se:ui', { src: c.pushse, volume: 1, loop: false }, 0);
            await this.jump(c.href);
            await this.run();
        }
        catch (e) {
            this.fail(e);
        }
    }
    async resume() { if (this.state.waiting !== 'modal')
        return; this.state.modal = undefined; this.state.waiting = 'running'; await this.run(); }
    snapshot(): State { if (!['click', 'choice', 'end'].includes(this.state.waiting))
        throw new Error('Save while dialogue or a choice is waiting.'); if (!this.state.saveEnabled)
        throw new Error('Save desabilitado neste trecho.'); return clone(this.state); }
    async restore(state: State) { const script = await this.script(state.script); if (state.pc < 0 || state.pc > script.tokens.length)
        throw new Error('Invalid save position'); const read = { ...this.state.read, ...state.read }; this.epoch++; this.host.cancel(); this.host.stopAll(); this.busy = false; this.state = clone(state); this.state.read = read; await this.host.commit(this.state.scene, 'normal', 0); for (const [ch, t] of Object.entries(state.audio)) {
        if (ch === 'bgm' || t.loop)
            await this.host.play(ch, t, 0);
    } this.emit(); }
    private async jump(href: string) { const target = resolveTarget(href, this.state.script, Object.keys(this.manifest.scripts)); const name = target.file, marker = target.marker, epoch = this.epoch; const script = await this.script(name); if (epoch !== this.epoch)
        return; const pc = marker ? script.labels.get(marker) : 0; if (pc === undefined)
        throw new Error(`Marcador ausente: ${href}`); this.state.script = name; this.state.pc = pc; }
    private fail(e: unknown) { this.state.waiting = 'error'; this.state.error = e instanceof Error ? e.message : String(e); this.host.stopAll(); this.emit(); }
    private async run() {
        if (this.busy)
            return;
        this.busy = true;
        const epoch = this.epoch;
        let steps = 0;
        try {
            while (this.state.waiting === 'running' && this.epoch === epoch) {
                if (++steps > 10000)
                    throw new Error('10,000 instructions without a pause: possible infinite loop');
                const script = await this.script(this.state.script);
                if (epoch !== this.epoch)
                    return;
                const token = script.tokens[this.state.pc++];
                if (!token) {
                    this.state.pc = script.tokens.length;
                    if (this.state.runs.length > this.state.segmentStart) {
                        this.pauseText();
                    }
                    else if (this.state.choices.length) {
                        this.state.waiting = 'choice';
                    }
                    else {
                        this.state.waiting = 'end';
                    }
                    break;
                }
                try {
                    await this.execute(token);
                }
                catch (e) {
                    throw new Error(`${script.name}:${token.line}: ${e instanceof Error ? e.message : e}`);
                }
                if (steps % 100 === 0) {
                    this.emit();
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        }
        catch (e) {
            if (epoch === this.epoch)
                this.fail(e);
        }
        finally {
            if (epoch === this.epoch) {
                this.busy = false;
                this.emit();
            }
        }
    }
    private pauseText() { const s = this.state; s.waiting = 'click'; s.wasRead = !!s.read[`${s.script}:${s.pc}`]; s.read[`${s.script}:${s.pc}`] = true; const runs = s.runs.slice(s.segmentStart); if (runs.length)
        s.backlog.push({ text: runs.map(r => r.text).join('\n'), speaker: s.speaker, voice: s.voice, script: s.script, pc: s.pc }); s.segmentStart = s.runs.length; s.backlog = s.backlog.slice(-500); }
    private async execute(t: Token) {
        const s = this.state;
        if (t.kind === 'text') {
            s.runs.push({ text: t.text, italic: s.italic });
            return;
        }
        // Only explicit <K> checkpoints pause the script. No synthetic
        // pause before VOICE, CLEAR, A or END.
        const a = t.attrs;
        const time = n(a.TIME) * this.manifest.timing.effectMs;
        const mode = (a.MODE ?? 'normal').toLowerCase();
        switch (t.name) {
            case 'MARKER':
            case '/A':
            case '/PRE':
            case '/BODY':
            case '/HTML': break;
            case 'K':
                this.pauseText();
                break;
            case 'CLEAR':
                s.runs = [];
                s.segmentStart = 0;
                s.revealFrom = 0;
                s.choices = [];
                s.speaker = '';
                s.voice = undefined;
                break;
            case 'I':
            case 'II':
                s.italic = true;
                break;
            case '/I':
                s.italic = false;
                break;
            case 'CENTER':
                s.center = true;
                break;
            case '/CENTER':
                s.center = false;
                break;
            case 'BOX':
                s.box = a.TYPE ?? '9';
                break;
            case 'BACKGROUND':
                {
                    const nextBackground = a.SRC || '#000000';
                    if (this.manifest.clearSpritesOnBackgroundChange && nextBackground !== s.pending.background)
                        s.pending.sprites = {};
                    s.pending.background = nextBackground;
                }
                s.pending.shade = !!a.SHADE;
                s.pending.blur = s.pending.shade && s.shading ? 8 : 0;
                s.pending.brightness = s.pending.shade && s.extraCG ? 0.45 : 1;
                if (a.EX)
                    this.host.report('BACKGROUND EX: variant has no mapping');
                break;
            case 'LAYER': {
                const id = a.NUM ?? '0';
                if (!a.SRC || mode === 'off') {
                    delete s.pending.layers[id];
                    break;
                }
                s.pending.layers[id] = { src: a.SRC, x: n(a.X), y: n(a.Y), opacity: 1 - n(a.TRANSPARENT) / 100, scale: n(a.ZOOM, 100) / 100 };
                break;
            }
            case 'BUSTUP': {
                const name = a.NAME ?? 'actor';
                if (mode === 'off') {
                    delete s.pending.sprites[name];
                    break;
                }
                const src = a.SRC || this.manifest.characters[`${name}|${a.FACE ?? ''}`];
                if (!src)
                    throw new Error(`BUSTUP sem mapeamento: ${name}|${a.FACE ?? ''}`);
                s.pending.sprites[name] = { src, x: n(a.X), y: n(a.Y), align: a.ALIGN ?? 'center', scale: n(a.ZOOM, 100) / 100, opacity: 1 };
                break;
            }
            case 'WIPE': {
                const effect = (a.EFFECT ?? 'normal').toLowerCase();
                if (!['normal', 'fade', 'effect'].includes(effect))
                    throw new Error(`WIPE sem suporte: ${effect}`);
                if (effect === 'effect' && !this.manifest.transitionMask)
                    throw new Error('WIPE effect exige transitionMask no manifesto');
                await this.host.commit(clone(s.pending), effect, time);
                s.scene = clone(s.pending);
                break;
            }
            case 'WAIT':
                await this.host.wait(n(a.TIME) * this.manifest.timing.waitMs);
                break;
            case 'FLASH':
                await this.host.flash(a.SRC || '#ffffff', Math.max(time, 80), n(a.COUNT, 1));
                break;
            case 'SCROLL': {
                const id = a.NUM ?? '0';
                const layer = s.scene.layers[id];
                if (!layer)
                    throw new Error(`SCROLL: camada ${id} ausente`);
                const x = n(a.X, layer.x), y = n(a.Y, layer.y);
                await this.host.scroll(id, x, y, time * Math.max(1, n(a.COUNT, 1)));
                layer.x = x;
                layer.y = y;
                s.pending.layers[id] = clone(layer);
                break;
            }
            case 'BGM':
            case 'SE':
            case 'VOICE': {
                const ch = t.name === 'BGM' ? 'bgm' : t.name === 'VOICE' ? 'voice' : `se:${a.ID ?? '1'}`;
                if (mode === 'fadeout' || !a.SRC) {
                    await this.host.stop(ch, time);
                    delete s.audio[ch];
                    break;
                }
                if (a.COUNT)
                    this.host.report('Audio COUNT: partial repeats are not implemented; using LOOP');
                const track: Track = { src: a.SRC, loop: a.LOOP?.toLowerCase() === 'on' || (t.name === 'BGM' && a.LOOP === undefined), volume: n(a.VOL, 100) / 100 };
                // The mixer retains the outgoing source until its gain envelope ends.
                if (a.OLD?.toLowerCase() === 'fadeout')
                    track.crossfadeMs = time;
                await this.host.play(ch, track, mode === 'fadein' ? time : 0);
                s.audio[ch] = track;
                if (ch === 'voice') {
                    s.voice = a.SRC;
                    s.speaker = a.NAME ?? '';
                }
                break;
            }
            case 'A':
                if (!a.OPERATOR || evaluate(a.OPERATOR, this.vars()))
                    await this.jump(a.HREF);
                break;
            case 'CALC': {
                const key = a.WORKNAME;
                if (!key || ['__proto__', 'constructor', 'prototype'].includes(key))
                    throw new Error('Invalid variable name');
                const value = evaluate(a.OPERATOR ?? '0', this.vars());
                if (mode === 'global') {
                    this.globals[key] = value;
                    delete s.vars[key];
                    this.host.globalsChanged(this.globals);
                }
                else
                    s.vars[key] = value;
                break;
            }
            case 'CHOICE': {
                if (a.OPERATOR)
                    throw new Error('Non-empty CHOICE OPERATOR is not supported yet');
                if (a.TYPE && !['9', '10', '17'].includes(a.TYPE))
                    throw new Error(`Unsupported CHOICE TYPE: ${a.TYPE}`);
                const choice: Choice = { href: a.HREF, text: a.TEXT ?? a.HREF ?? 'Choice', x: n(a.X, 220), y: n(a.Y, 280 + s.choices.length * 80), frames: a.FILE?.split(';').filter(Boolean) ?? [], disabled: !!(a.DISABLE && evaluate(a.DISABLE, this.vars())), pushse: a.PUSHSE, onse: a.ONSE, shortcut: a.SHORTCUT };
                s.choices.push(choice);
                break;
            }
            case 'SELECT':
                if (!s.choices.length || s.choices.every(c => c.disabled))
                    throw new Error('SELECT has no enabled choices');
                s.waiting = 'choice';
                break;
            case 'LOAD':
                s.waiting = 'modal';
                s.modal = 'load';
                break;
            case 'SYSTEM': {
                const cmd = a.CMD?.toLowerCase();
                if (a.INIT?.toUpperCase() === 'TRUE') {
                    s.vars = {};
                    s.runs = [];
                    s.segmentStart = 0;
                    s.revealFrom = 0;
                    s.choices = [];
                }
                if (a.MENU) {
                    s.menuMask = a.MENU;
                    this.host.report(`SYSTEM MENU=${a.MENU}: mask recorded; native bits are not mapped yet`);
                }
                if (!cmd)
                    break;
                if (cmd === 'savemode') {
                    s.saveEnabled = mode !== 'off';
                    break;
                }
                if (['config', 'ending', 'credits', 'cgmode', 'music', 'save', 'load', 'backlog'].includes(cmd)) {
                    s.waiting = 'modal';
                    s.modal = cmd === 'ending' ? 'credits' : cmd === 'cgmode' ? 'gallery' : cmd;
                    break;
                }
                if (cmd === 'shading' || cmd === 'extracg') {
                    if (cmd === 'shading')
                        s.shading = n(a.TYPE) !== 0;
                    else
                        s.extraCG = n(a.TYPE) !== 0;
                    s.pending.blur = s.pending.shade && s.shading ? 8 : 0;
                    s.pending.brightness = s.pending.shade && s.extraCG ? 0.45 : 1;
                    break;
                }
                if (cmd === 'url') {
                    this.host.report('SYSTEM URL blocked: local execution only');
                    break;
                }
                throw new Error(`Unsupported SYSTEM CMD: ${cmd}`);
            }
            case 'INCLUDE': {
                if (!a.SRC)
                    throw new Error('INCLUDE sem SRC');
                const raw = await this.readFile(a.SRC);
                if (parse(raw, a.SRC).tokens.length)
                    throw new Error('INCLUDE with macros is not supported');
                break;
            }
            case 'END':
                s.waiting = 'end';
                break;
            default:
                if (this.manifest.strict)
                    throw new Error(`Unimplemented command: <${t.name}>`);
                this.host.report(`Comando ignorado por modo permissivo: ${t.name}`);
        }
    }
}

