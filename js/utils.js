export function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

// Simple seeded random to ensure chunks are deterministic if re-generated from same seed (optional, but good practice)
// For this prototype, we'll use storage to persist, so Math.random is fine for initial generation.
export function randomRange(min, max) {
    return Math.random() * (max - min) + min;
}

export class SimplexNoise {
    constructor(seed = 0) {
        this.p = new Uint8Array(256);
        this.perm = new Uint8Array(512);
        this.permMod12 = new Uint8Array(512);
        for (let i = 0; i < 256; i++) {
            this.p[i] = i;
        }
        for (let i = 0; i < 256; i++) {
            let r = (seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF) & 0xFF;
            let k = this.p[i];
            this.p[i] = this.p[r];
            this.p[r] = k;
        }
        for (let i = 0; i < 512; i++) {
            this.perm[i] = this.p[i & 255];
            this.permMod12[i] = this.perm[i] % 12;
        }
        this.grad3 = [new Float32Array([1, 1, 0]), new Float32Array([-1, 1, 0]), new Float32Array([1, -1, 0]), new Float32Array([-1, -1, 0]),
        new Float32Array([1, 0, 1]), new Float32Array([-1, 0, 1]), new Float32Array([1, 0, -1]), new Float32Array([-1, 0, -1]),
        new Float32Array([0, 1, 1]), new Float32Array([0, -1, 1]), new Float32Array([0, 1, -1]), new Float32Array([0, -1, -1])];
    }
    noise2D(xin, yin) {
        const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
        const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
        let n0, n1, n2;
        let s = (xin + yin) * F2;
        let i = Math.floor(xin + s);
        let j = Math.floor(yin + s);
        let t = (i + j) * G2;
        let X0 = i - t;
        let Y0 = j - t;
        let x0 = xin - X0;
        let y0 = yin - Y0;
        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; }
        else { i1 = 0; j1 = 1; }
        let x1 = x0 - i1 + G2;
        let y1 = y0 - j1 + G2;
        let x2 = x0 - 1.0 + 2.0 * G2;
        let y2 = y0 - 1.0 + 2.0 * G2;
        let ii = i & 255;
        let jj = j & 255;
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 < 0) n0 = 0.0;
        else {
            t0 *= t0;
            let gi0 = this.permMod12[ii + this.perm[jj]];
            n0 = t0 * t0 * (this.grad3[gi0][0] * x0 + this.grad3[gi0][1] * y0);
        }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 < 0) n1 = 0.0;
        else {
            t1 *= t1;
            let gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
            n1 = t1 * t1 * (this.grad3[gi1][0] * x1 + this.grad3[gi1][1] * y1);
        }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 < 0) n2 = 0.0;
        else {
            t2 *= t2;
            let gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];
            n2 = t2 * t2 * (this.grad3[gi2][0] * x2 + this.grad3[gi2][1] * y2);
        }
        return 70.0 * (n0 + n1 + n2);
    }
}

export function getWaterWaveHeight(x, z, time) {
    const t = time * 0.5;
    let y = 0.0;
    // Swell
    y += Math.sin(x * 0.02 + t * 0.5) * 1.0;
    y += Math.cos(z * 0.02 + t * 0.4) * 1.0;
    // Detail
    y += Math.sin(x * 0.1 + z * 0.05 + t) * 0.25;
    y += Math.cos(x * 0.05 - z * 0.1 + t * 0.9) * 0.25;
    // Micro chop
    y += Math.sin(x * 0.3 + t * 2.0) * 0.05;
    
    return y * 0.5;
}