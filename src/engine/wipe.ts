/** Monotonic alpha ramp through a grayscale transition mask. */
export function maskAlpha(luminance: number, progress: number, softness = 0.12): number {
    if (progress <= 0)
        return 0;
    if (progress >= 1)
        return 255;
    return Math.round(255 * Math.max(0, Math.min(1, ((progress * (1 + softness)) - (luminance / 255)) / softness)));
}

