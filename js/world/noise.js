class PerlinNoise {
    constructor(seed = Math.random()) {
        this.p = new Uint8Array(512);
        const permutation = new Uint8Array(256);
        for (let i = 0; i < 256; i++) permutation[i] = i;
        
        let s = Math.floor(seed * 2**31);
        const random = () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x80000000;
        };

        for (let i = 255; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
        }
        for (let i = 0; i < 512; i++) this.p[i] = permutation[i % 256];
    }
    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }
    grad(hash, x, y) {
        const h = hash & 3;
        let u = h < 2 ? x : y;
        let v = h < 2 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    noise2D(x, y) {
        let X = Math.floor(x) & 255;
        let Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = this.fade(x);
        const v = this.fade(y);
        const A = this.p[X] + Y;
        const B = this.p[X + 1] + Y;
        return this.lerp(v,
            this.lerp(u, this.grad(this.p[A], x, y), this.grad(this.p[B], x - 1, y)),
            this.lerp(u, this.grad(this.p[A + 1], x, y - 1), this.grad(this.p[B + 1], x - 1, y - 1))
        );
    }
    grad3D(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    noise3D(x, y, z) {
        let X = Math.floor(x) & 255;
        let Y = Math.floor(y) & 255;
        let Z = Math.floor(z) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);
        const A  = this.p[X] + Y;
        const AA = this.p[A] + Z;
        const AB = this.p[A + 1] + Z;
        const B  = this.p[X + 1] + Y;
        const BA = this.p[B] + Z;
        const BB = this.p[B + 1] + Z;
        return this.lerp(w,
            this.lerp(v,
                this.lerp(u, this.grad3D(this.p[AA], x, y, z), this.grad3D(this.p[BA], x-1, y, z)),
                this.lerp(u, this.grad3D(this.p[AB], x, y-1, z), this.grad3D(this.p[BB], x-1, y-1, z))
            ),
            this.lerp(v,
                this.lerp(u, this.grad3D(this.p[AA+1], x, y, z-1), this.grad3D(this.p[BA+1], x-1, y, z-1)),
                this.lerp(u, this.grad3D(this.p[AB+1], x, y-1, z-1), this.grad3D(this.p[BB+1], x-1, y-1, z-1))
            )
        );
    }
    fbm3D(x, y, z, octaves, persistence = 0.5, lacunarity = 2) {
        let total = 0, frequency = 1, amplitude = 1, maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            total += this.noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        return total / maxValue;
    }
    fbm(x, y, octaves, persistence = 0.5, lacunarity = 2) {
        let total = 0, frequency = 1, amplitude = 1, maxValue = 0; 
        for(let i = 0; i < octaves; i++) {
            total += this.noise2D(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        return total / maxValue;
    }
}