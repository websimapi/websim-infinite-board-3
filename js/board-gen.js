import { uuidv4, randomRange, SimplexNoise } from './utils.js';

// Configuration
const CHUNK_DEPTH = 250; // World units (meters)
const ROW_SPACING = 50;
const BOARD_WIDTH = 100; 
const MIN_NODES_PER_ROW = 2;
const MAX_NODES_PER_ROW = 4;
const MIN_NODE_DISTANCE = 15.0;

// Terrain System
const noise = new SimplexNoise(1337);

export const Terrain = {
    WATER_LEVEL: -2.0,

    getBiome(z) {
        // Biome zones based on Z depth (meters)
        const depth = Math.abs(z);
        if (depth < 2000) return 'GRASS';
        if (depth < 4500) return 'FOREST';
        if (depth < 7000) return 'DESERT';
        if (depth < 10000) return 'SNOW';
        return 'ALIEN';
    },

    getHeight(x, z) {
        const biome = this.getBiome(z);

        // Domain Warping for organic terrain flow
        const warpFreq = 0.0005; // Smoother warping for larger scale
        const warpAmp = 60.0;
        const wx = noise.noise2D(x * warpFreq, z * warpFreq) * warpAmp;
        const wz = noise.noise2D(x * warpFreq + 100, z * warpFreq + 100) * warpAmp;
        
        const xW = x + wx;
        const zW = z + wz;

        // Enhanced noise layers for HD detail - Scaled for 1 unit = 1 meter
        const n1 = noise.noise2D(xW * 0.0015, zW * 0.0015); // Macro shape
        const n2 = noise.noise2D(xW * 0.004, zW * 0.004);   // Large features
        const n3 = noise.noise2D(xW * 0.01, zW * 0.01);     // Small features
        
        let y = 0;
        if (biome === 'GRASS') {
            // Gentle rolling hills with detail
            y = n1 * 25.0 + n2 * 10.0 + n3 * 2.0;
            // Occasional plateaus
            if (n1 > 0.5) y += 5.0; 
        } else if (biome === 'FOREST') {
            // Rougher, more organic but smoothed
            y = n1 * 35.0 + n2 * 15.0 + n3 * 4.0;
        } else if (biome === 'DESERT') {
            // Smooth dunes + wind ripples
            const dune = Math.sin(xW * 0.003 + zW * 0.002 + n1) * 30.0;
            y = dune + n3 * 2.0;
        } else if (biome === 'SNOW') {
            // Rugged peaks, very noisy
            y = (Math.abs(n1) * 80 + Math.abs(n2) * 30) + n3 * 10.0;
        } else {
            // Alien: Weird geometric patterns + noise
            y = Math.sin(xW * 0.05) * Math.cos(zW * 0.05) * 25 + n1 * 15 + n3 * 2.0;
        }
        return y;
    },

    getSlope(x, z) {
        const delta = 1.0; // Larger delta for meter scale
        const h = this.getHeight(x, z);
        const hx = this.getHeight(x + delta, z);
        const hz = this.getHeight(x, z + delta);
        // Approximate magnitude of gradient
        return Math.sqrt(Math.pow(hx - h, 2) + Math.pow(hz - h, 2));
    },

    getColor(x, z, h) {
        const biome = this.getBiome(z);
        const slope = this.getSlope(x, z);
        
        // Detailed texture noise
        const n = noise.noise2D(x*0.2, z*0.2); 
        const nDetail = noise.noise2D(x*1.5, z*1.5); 

        // Helper to hex
        const color = (r, g, b) => ({r, g, b}); 
        
        // Underwater / Seabed (replaces old water logic)
        if (h < this.WATER_LEVEL) {
            // Darkens with depth but stays visible for transparency
            const depth = this.WATER_LEVEL - h;
            const dark = Math.max(0.3, 0.9 - depth * 0.1);
            // Sandy/Muddy bottom
            return color(
                (0.6 + n*0.1) * dark, 
                (0.55 + n*0.1) * dark, 
                (0.4 + n*0.1) * dark
            );
        }

        // Global cliff / drop-off dirt-gravel treatment for steep slopes above water
        if (h >= this.WATER_LEVEL && slope > 1.5) {
            // Base earthy tone
            let r = 0.45 + n * 0.08 + nDetail * 0.04;
            let g = 0.38 + n * 0.06;
            let b = 0.30 + n * 0.05 + nDetail * 0.03;

            // Slight cool tint on very steep spots to hint at exposed rock
            const steepFactor = Math.min(1.0, (slope - 1.2) * 0.8);
            r = r * (1.0 - 0.1 * steepFactor);
            g = g * (1.0 - 0.05 * steepFactor);
            b = b * (1.0 + 0.05 * steepFactor);

            return color(r, g, b);
        }

        // Beach / Shoreline
        if (h < this.WATER_LEVEL + 2.0 && slope < 0.6) {
            return color(0.7 + n*0.1, 0.65 + n*0.1, 0.5 + n*0.1); // Sand
        }

        if (biome === 'GRASS') {
            if (slope > 0.75) return color(0.45 + n*0.05, 0.35 + n*0.05, 0.25); // Dirt
            return color(0.2 + n*0.1 + nDetail*0.05, 0.55 + n*0.15, 0.2 + nDetail*0.05); // Grass
        }
        if (biome === 'FOREST') {
             if (slope > 0.9) return color(0.35, 0.35, 0.35); // Rock
             return color(0.1 + nDetail*0.05, 0.25 + n*0.1, 0.1 + nDetail*0.05); // Dark Green
        }
        if (biome === 'DESERT') {
            return color(0.85 + n*0.1, 0.75 + n*0.05 + nDetail*0.05, 0.5 + n*0.1); // Sand
        }
        if (biome === 'SNOW') {
            if (h > 4 || slope < 0.6) return color(0.92 + nDetail*0.05, 0.92 + nDetail*0.05, 0.98); // Snow
            return color(0.35 + n*0.1, 0.35 + n*0.1, 0.4); // Rock
        }
        // Alien
        return color(0.5 + n*0.4, 0.05 + nDetail*0.1, 0.5 + Math.sin(z)*0.4);
    }
};

export class BoardGenerator {
    /**
     * Generates a chunk of the board.
     * @param {number} chunkIndex 
     * @param {Array} prevRowNodes - Nodes from the end of the previous chunk.
     * @returns {Object} Chunk data.
     */
    generateChunk(chunkIndex, prevRowNodes = []) {
        // Background chunks (negative index) have no game nodes, just terrain
        if (chunkIndex < 0) {
            return {
                index: chunkIndex,
                nodes: [],
                edges: [],
                exitNodes: []
            };
        }

        const nodes = [];
        const edges = [];

        // Z coordinates: We move towards negative Z
        const startZ = -chunkIndex * CHUNK_DEPTH; 

        // Padding allows nodes to spawn away from edges, preventing terrain flattening seams
        const PADDING = 6.0;
        let currentZ = startZ - PADDING;
        const endZ = startZ - CHUNK_DEPTH + PADDING;

        let lastRow = prevRowNodes;

        // Helper to place nodes so they float on water if terrain is below water level
        const getNodeHeight = (x, z) => {
            const terrainY = Terrain.getHeight(x, z);
            if (terrainY < Terrain.WATER_LEVEL) {
                // Small offset so the piece clearly rests on the water surface
                return Terrain.WATER_LEVEL + 0.2;
            }
            return terrainY;
        };

        // Initialize start node if this is the first chunk and empty
        if (chunkIndex === 0 && lastRow.length === 0) {
            const startNode = {
                id: `node_start`,
                x: 0,
                y: getNodeHeight(0, 0),
                z: 0,
                color: '#44aaff'
            };
            nodes.push(startNode);
            lastRow = [startNode];
            currentZ = -ROW_SPACING;
        }

        while (currentZ > endZ) {
            const rowNodeCount = Math.floor(randomRange(MIN_NODES_PER_ROW, MAX_NODES_PER_ROW + 1));
            const currentRow = [];

            // Generate nodes for this row with collision detection
            let attempts = 0;
            const maxAttempts = 50;

            while (currentRow.length < rowNodeCount && attempts < maxAttempts) {
                attempts++;
                
                const x = randomRange(-BOARD_WIDTH, BOARD_WIDTH);
                const z = currentZ + randomRange(-0.8, 0.8);

                // Check slope for flat surface
                const slope = Terrain.getSlope(x, z);
                if (slope > 0.8 && attempts < 40) {
                    // Try to find a flatter spot
                    continue;
                }

                let tooClose = false;
                for (const existing of currentRow) {
                    if (Math.hypot(existing.x - x, existing.z - z) < MIN_NODE_DISTANCE) {
                        tooClose = true;
                        break;
                    }
                }

                if (!tooClose) {
                    const node = {
                        id: `c${chunkIndex}_${uuidv4()}`,
                        x: x,
                        y: getNodeHeight(x, z), 
                        z: z,
                        color: '#ffffff'
                    };
                    nodes.push(node);
                    currentRow.push(node);
                }
            }

            if (currentRow.length === 0) {
                 const x = randomRange(-BOARD_WIDTH/2, BOARD_WIDTH/2);
                 const z = currentZ;
                 const node = {
                    id: `c${chunkIndex}_${uuidv4()}`,
                    x: x,
                    y: getNodeHeight(x, z),
                    z: z,
                    color: '#ffffff'
                };
                nodes.push(node);
                currentRow.push(node);
            }

            // Create connections

            // 1. Ensure every parent connects to at least one child (Branching)
            lastRow.forEach(parent => {
                // Find close children
                const sortedChildren = [...currentRow].sort((a, b) => {
                    const distA = Math.hypot(a.x - parent.x, a.z - parent.z);
                    const distB = Math.hypot(b.x - parent.x, b.z - parent.z);
                    return distA - distB;
                });

                // Connect to 1 to 3 closest children
                const connectionCount = Math.floor(randomRange(1, 3));
                for(let k=0; k<connectionCount && k<sortedChildren.length; k++) {
                    const child = sortedChildren[k];
                    // Prevent extremely long horizontal jumps
                    if (Math.abs(child.x - parent.x) < BOARD_WIDTH * 1.2) {
                        edges.push({ from: parent.id, to: child.id });
                    }
                }
            });

            // 2. Ensure every child has at least one parent (Merging/Reachability)
            currentRow.forEach(child => {
                const hasParent = edges.some(e => e.to === child.id);
                if (!hasParent) {
                    // Find closest parent
                    let closestParent = null;
                    let minDst = Infinity;

                    lastRow.forEach(p => {
                        const d = Math.hypot(p.x - child.x, p.z - child.z);
                        if (d < minDst) {
                            minDst = d;
                            closestParent = p;
                        }
                    });

                    if (closestParent) {
                        edges.push({ from: closestParent.id, to: child.id });
                    }
                }
            });

            lastRow = currentRow;
            currentZ -= ROW_SPACING;
        }

        return {
            index: chunkIndex,
            nodes,
            edges,
            exitNodes: lastRow
        };
    }
}