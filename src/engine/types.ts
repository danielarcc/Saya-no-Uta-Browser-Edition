import type { Variables } from './expression';
export interface ImageLayer {
    src: string;
    x: number;
    y: number;
    opacity: number;
    scale: number;
    align?: string;
}
export interface Scene {
    background: string;
    layers: Record<string, ImageLayer>;
    sprites: Record<string, ImageLayer>;
    shade?: boolean;
    blur?: number;
    brightness?: number;
}
export interface Choice {
    href: string;
    text: string;
    x: number;
    y: number;
    frames: string[];
    disabled: boolean;
    pushse?: string;
    onse?: string;
    shortcut?: string;
}
export interface Run {
    text: string;
    italic: boolean;
}
export interface Track {
    src: string;
    loop: boolean;
    volume: number;
    position?: number;
    crossfadeMs?: number;
}
export interface BacklogEntry {
    text: string;
    speaker: string;
    voice?: string;
    script: string;
    pc: number;
}
export type Waiting = 'running' | 'click' | 'choice' | 'modal' | 'end' | 'error';
export interface State {
    script: string;
    pc: number;
    vars: Variables;
    scene: Scene;
    pending: Scene;
    runs: Run[];
    italic: boolean;
    center: boolean;
    box: string;
    speaker: string;
    voice?: string;
    choices: Choice[];
    waiting: Waiting;
    modal?: string;
    backlog: BacklogEntry[];
    audio: Record<string, Track>;
    saveEnabled: boolean;
    read: Record<string, boolean>;
    wasRead: boolean;
    error?: string;
    revision: number;
    segmentStart: number;
    revealFrom: number;
    shading: boolean;
    extraCG: boolean;
    menuMask: string;
}
export interface Manifest {
    id: string;
    version: string;
    title: string;
    entry: string;
    width: number;
    height: number;
    timing: {
        waitMs: number;
        effectMs: number;
    };
    scripts: Record<string, string>;
    assets: Record<string, string>;
    characters: Record<string, string>;
    credits: string[];
    strict: boolean;
    textMode?: 'nvl' | 'replace';
    transitionMask?: string;
    development?: boolean;
    gallery?: string[];
    music?: {
        src: string;
        title: string;
    }[];
    spriteAnchors?: Record<string, number>;
    clearSpritesOnBackgroundChange?: boolean;
}
export interface Host {
    commit(scene: Scene, effect: string, duration: number): Promise<void>;
    wait(ms: number): Promise<void>;
    flash(color: string, ms: number, count: number): Promise<void>;
    scroll(layer: string, x: number, y: number, ms: number): Promise<void>;
    play(channel: string, track: Track, fadeMs: number): Promise<void>;
    stop(channel: string, fadeMs: number): Promise<void>;
    stopAll(): void;
    cancel(): void;
    report(message: string): void;
    globalsChanged(vars: Variables): void;
}
export const emptyScene = (): Scene => ({ background: '#000000', layers: {}, sprites: {} });

