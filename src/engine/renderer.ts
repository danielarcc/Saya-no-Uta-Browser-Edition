import { maskAlpha } from './wipe';
import type { Scene, ImageLayer } from './types';
import { emptyScene } from './types';
import { Assets } from './assets';
export class Renderer {
    private ctx: CanvasRenderingContext2D;
    private cache = new Map<string, HTMLImageElement>();
    private generation = 0;
    private masks = new Map<string, Uint8ClampedArray>();
    private cancellation = new Set<() => void>();
    scene: Scene = emptyScene();
    constructor(readonly canvas: HTMLCanvasElement, readonly assets: Assets) { this.ctx = canvas.getContext('2d')!; }
    cancel() { this.generation++; for (const cancel of this.cancellation)
        cancel(); this.cancellation.clear(); }
    async load(src: string) { if (src.startsWith('#'))
        return; if (this.cache.has(src))
        return; const image = new Image(); image.src = this.assets.url(src); await image.decode(); this.cache.set(src, image); }
    private async prepare(s: Scene) { await Promise.all([s.background, ...Object.values(s.layers).map(l => l.src), ...Object.values(s.sprites).map(l => l.src)].map(src => this.load(src))); }
    private image(ctx: CanvasRenderingContext2D, layer: ImageLayer, isSprite = false) {
        const { width: w, height: h } = this.canvas;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
        if (layer.src.startsWith('#')) {
            ctx.fillStyle = layer.src;
            ctx.fillRect(layer.x, layer.y, w * layer.scale, h * layer.scale);
        }
        else {
            const im = this.cache.get(layer.src);
            if (!im)
                throw new Error(`Image failed to load: ${layer.src}`);
            const iw = im.width * layer.scale, ih = im.height * layer.scale;
            const x = isSprite ? ((w * (this.assets.manifest.spriteAnchors?.[layer.align ?? 'center'] ?? (layer.align === 'left' ? .25 : layer.align === 'right' ? .75 : .5))) - iw / 2 + layer.x) : layer.x;
            const y = isSprite ? h - ih + layer.y : layer.y;
            ctx.drawImage(im, x, y, iw, ih);
        }
        ctx.restore();
    }
    private draw(ctx: CanvasRenderingContext2D, s: Scene) { const { width: w, height: h } = this.canvas; ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); ctx.save(); ctx.filter = `blur(${s.blur ?? 0}px) brightness(${s.brightness ?? 1})`; if (s.background.startsWith('#')) {
        ctx.fillStyle = s.background;
        ctx.fillRect(0, 0, w, h);
    }
    else {
        const im = this.cache.get(s.background);
        if (im)
            ctx.drawImage(im, 0, 0, w, h);
    } ctx.restore(); for (const [, l] of Object.entries(s.layers).sort(([a], [b]) => Number(a) - Number(b)))
        this.image(ctx, l); for (const l of Object.values(s.sprites))
        this.image(ctx, l, true); }
    private frame(s: Scene) { const c = document.createElement('canvas'); c.width = this.canvas.width; c.height = this.canvas.height; this.draw(c.getContext('2d')!, s); return c; }
    animate(ms: number, draw: (t: number) => void): Promise<void> { if (ms <= 0) {
        draw(1);
        return Promise.resolve();
    } return new Promise(resolve => { const start = performance.now(); let id = 0; const finish = () => { cancelAnimationFrame(id); this.cancellation.delete(finish); resolve(); }; this.cancellation.add(finish); const tick = (now: number) => { const t = Math.min(1, (now - start) / ms); draw(t); if (t < 1)
        id = requestAnimationFrame(tick);
    else
        finish(); }; id = requestAnimationFrame(tick); }); }
    async commit(scene: Scene, effect: string, ms: number) {
        const gen = this.generation;
        await this.prepare(scene);
        if (gen !== this.generation)
            return;
        const prev = this.frame(this.scene), next = this.frame(scene);
        let mask: Uint8ClampedArray | undefined;
        let cut: HTMLCanvasElement | undefined;
        let maskCanvas: HTMLCanvasElement | undefined;
        let pixels: ImageData | undefined;
        if (effect === 'effect') {
            const src = this.assets.manifest.transitionMask;
            if (!src)
                throw new Error('Missing WIPE mask');
            await this.load(src);
            if (gen !== this.generation)
                return;
            mask = this.masks.get(src);
            maskCanvas = document.createElement('canvas');
            maskCanvas.width = this.canvas.width;
            maskCanvas.height = this.canvas.height;
            const mc = maskCanvas.getContext('2d')!;
            if (!mask) {
                mc.drawImage(this.cache.get(src)!, 0, 0, maskCanvas.width, maskCanvas.height);
                mask = mc.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
                this.masks.set(src, mask);
            }
            pixels = mc.createImageData(maskCanvas.width, maskCanvas.height);
            cut = document.createElement('canvas');
            cut.width = this.canvas.width;
            cut.height = this.canvas.height;
        }
        await this.animate(effect === 'normal' ? 0 : ms, t => {
            this.ctx.globalAlpha = 1;
            this.ctx.drawImage(prev, 0, 0);
            if (mask && cut && maskCanvas && pixels) {
                for (let i = 0; i < mask.length; i += 4) {
                    pixels.data[i] = 255;
                    pixels.data[i + 1] = 255;
                    pixels.data[i + 2] = 255;
                    pixels.data[i + 3] = maskAlpha(mask[i], t);
                }
                maskCanvas.getContext('2d')!.putImageData(pixels, 0, 0);
                const c = cut.getContext('2d')!;
                c.clearRect(0, 0, cut.width, cut.height);
                c.globalCompositeOperation = 'source-over';
                c.drawImage(next, 0, 0);
                c.globalCompositeOperation = 'destination-in';
                c.drawImage(maskCanvas, 0, 0);
                this.ctx.drawImage(cut, 0, 0);
            }
            else {
                this.ctx.globalAlpha = t;
                this.ctx.drawImage(next, 0, 0);
            }
            this.ctx.globalAlpha = 1;
        });
        if (gen === this.generation) {
            this.scene = structuredClone(scene);
            this.draw(this.ctx, this.scene);
        }
    }
    async wait(ms: number) { await this.animate(ms, () => { }); }
    async flash(color: string, ms: number, count: number) { for (let i = 0; i < count; i++) {
        const gen = this.generation;
        await this.animate(ms, t => { this.draw(this.ctx, this.scene); this.ctx.globalAlpha = 1 - t; this.ctx.fillStyle = color; this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); this.ctx.globalAlpha = 1; });
        if (gen !== this.generation)
            return;
    } this.draw(this.ctx, this.scene); }
    async scroll(id: string, x: number, y: number, ms: number) { const layer = this.scene.layers[id]; if (!layer)
        throw new Error('Camada ausente'); const from = { ...layer }; await this.animate(ms, t => { layer.x = from.x + (x - from.x) * t; layer.y = from.y + (y - from.y) * t; this.draw(this.ctx, this.scene); }); }
    thumbnail() { const c = document.createElement('canvas'); c.width = 256; c.height = 192; c.getContext('2d')!.drawImage(this.canvas, 0, 0, 256, 192); return c.toDataURL('image/jpeg', 0.65); }
}

