import type { Track } from './types';
import { Assets } from './assets';
export interface Volumes {
    master: number;
    bgm: number;
    se: number;
    voice: number;
}
type Playing = {
    source: AudioBufferSourceNode;
    gain: GainNode;
    track: Track;
    started: number;
    offset: number;
    buffer: AudioBuffer;
};
export class AudioMixer {
    private ctx?: AudioContext;
    private master?: GainNode;
    private buses: Record<string, GainNode> = {};
    private cache = new Map<string, AudioBuffer>();
    private playing = new Map<string, Playing>();
    private serial = new Map<string, number>();
    private outgoing = new Set<Playing>();
    volumes: Volumes = { master: 0.8, bgm: 0.7, se: 0.7, voice: 1 };
    constructor(private assets: Assets) { }
    private ensure() { if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        for (const k of ['bgm', 'se', 'voice']) {
            this.buses[k] = this.ctx.createGain();
            this.buses[k].connect(this.master);
        }
        this.setVolumes(this.volumes);
    } }
    async unlock() { this.ensure(); if (this.ctx!.state === 'suspended')
        await this.ctx!.resume(); }
    setVolumes(v: Volumes) { this.volumes = v; if (!this.ctx || !this.master)
        return; this.master.gain.setValueAtTime(v.master, this.ctx.currentTime); for (const k of ['bgm', 'se', 'voice'] as const)
        this.buses[k].gain.setValueAtTime(v[k], this.ctx.currentTime); }
    async play(ch: string, track: Track, fadeMs: number) {
        this.ensure();
        const ctx = this.ctx!;
        const token = (this.serial.get(ch) ?? 0) + 1;
        this.serial.set(ch, token);
        let buffer = this.cache.get(track.src);
        if (!buffer) {
            const response = await fetch(this.assets.url(track.src));
            if (!response.ok)
                throw new Error(`Áudio ausente: ${track.src}`);
            buffer = await ctx.decodeAudioData(await response.arrayBuffer());
            this.cache.set(track.src, buffer);
        }
        if (this.serial.get(ch) !== token)
            return;
        const previous = this.playing.get(ch);
        if (previous && track.crossfadeMs) {
            const now = ctx.currentTime;
            previous.gain.gain.cancelScheduledValues(now);
            previous.gain.gain.setValueAtTime(previous.gain.gain.value, now);
            previous.gain.gain.linearRampToValueAtTime(0, now + track.crossfadeMs / 1000);
            previous.source.stop(now + track.crossfadeMs / 1000);
            this.outgoing.add(previous);
            previous.source.onended = () => { previous.source.disconnect(); previous.gain.disconnect(); this.outgoing.delete(previous); };
            this.playing.delete(ch);
        }
        else
            this.kill(ch);
        const source = ctx.createBufferSource(), gain = ctx.createGain();
        source.buffer = buffer;
        source.loop = track.loop;
        source.connect(gain);
        gain.connect(this.buses[ch.startsWith('se:') ? 'se' : ch === 'bgm' ? 'bgm' : 'voice']);
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(fadeMs ? 0 : track.volume, now);
        if (fadeMs)
            gain.gain.linearRampToValueAtTime(track.volume, now + fadeMs / 1000);
        const offset = track.loop ? (track.position ?? 0) % buffer.duration : Math.min(track.position ?? 0, Math.max(0, buffer.duration - 0.001));
        const record: Playing = { source, gain, track, started: now, offset, buffer };
        this.playing.set(ch, record);
        source.onended = () => { if (this.playing.get(ch) === record)
            this.playing.delete(ch); source.disconnect(); gain.disconnect(); };
        source.start(0, offset);
    }
    private kill(ch: string) { const p = this.playing.get(ch); if (p) {
        p.source.stop();
        p.source.disconnect();
        p.gain.disconnect();
        this.playing.delete(ch);
    } }
    async stop(ch: string, fadeMs = 0) { this.serial.set(ch, (this.serial.get(ch) ?? 0) + 1); const p = this.playing.get(ch); if (!p || !this.ctx)
        return; if (fadeMs) {
        const now = this.ctx.currentTime;
        p.gain.gain.cancelScheduledValues(now);
        p.gain.gain.setValueAtTime(p.gain.gain.value, now);
        p.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
        await new Promise(r => setTimeout(r, fadeMs));
    } if (this.playing.get(ch) === p)
        this.kill(ch); }
    stopAll() { for (const p of this.outgoing) {
        try {
            p.source.stop();
        }
        catch { }
        p.source.disconnect();
        p.gain.disconnect();
    } this.outgoing.clear(); for (const ch of new Set([...this.serial.keys(), ...this.playing.keys()])) {
        this.serial.set(ch, (this.serial.get(ch) ?? 0) + 1);
        this.kill(ch);
    } }
    isVoicePlaying() { return this.playing.has('voice'); }
    snapshot() { const result: Record<string, Track> = {}; for (const [ch, p] of this.playing) {
        const position = (this.ctx!.currentTime - p.started + p.offset);
        result[ch] = { ...p.track, position: p.track.loop ? position % p.buffer.duration : position };
    } return result; }
}

