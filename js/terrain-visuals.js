import * as THREE from 'three';
import { Terrain } from './board-gen.js';
import { lerp } from './utils.js';

export class TerrainVisuals {
    constructor(assets) {
        this.assets = assets;
    }

    getModifiedHeight(x, z, pathSegments, nodes) {
        // 1. Base Terrain Height
        let h = Terrain.getHeight(x, z);
        let finalH = h;

        // Track path influence separately for coloring only
        let pathWeight = 0;

        // 2. Sample for Paths (paint only, no height change)
        if (pathSegments) {
            for (const seg of pathSegments) {
                // Optimization: AABB check
                if (x < Math.min(seg.sx, seg.ex) - 4 || x > Math.max(seg.sx, seg.ex) + 4 ||
                    z < Math.min(seg.sz, seg.ez) - 4 || z > Math.max(seg.sz, seg.ez) + 4) continue;

                if (seg.lenSq < 0.001) continue;

                // Project point onto line segment
                const t = ((x - seg.sx) * (seg.ex - seg.sx) + (z - seg.sz) * (seg.ez - seg.sz)) / seg.lenSq;
                const clampedT = Math.max(0, Math.min(1, t));

                const projX = seg.sx + clampedT * (seg.ex - seg.sx);
                const projZ = seg.sz + clampedT * (seg.ez - seg.sz);

                const distSq = (x - projX)**2 + (z - projZ)**2;

                // Road params - Scaled for meters
                const roadWidth = 4.0;
                const blendWidth = 12.0;

                if (distSq < blendWidth * blendWidth) {
                    const dist = Math.sqrt(distSq);

                    // Add subtle noise to road edge to avoid hard edges
                    const edgeNoise = (Math.sin(x * 0.5) + Math.cos(z * 0.8)) * 0.5;
                    const effectiveRadius = roadWidth + edgeNoise;

                    let w = 0;
                    if (dist < effectiveRadius) {
                        w = 1.0;
                    } else {
                        const falloff = (dist - effectiveRadius) / (blendWidth - effectiveRadius);
                        w = 1.0 - falloff;
                        w = Math.max(0, w * w * (3 - 2 * w)); // smoothstep
                    }

                    // Soften overall path influence (used only for color now)
                    const adjustedW = w * 0.7;

                    if (adjustedW > pathWeight) {
                        pathWeight = adjustedW;
                    }
                }
            }
        }

        // 3. Flatten for Nodes (keep for smoother standing areas)
        if (nodes) {
            for (const node of nodes) {
                if (Math.abs(node.x - x) > 15 || Math.abs(node.z - z) > 15) continue;

                const dist = Math.hypot(x - node.x, z - node.z);
                // Scaled for larger nodes
                const innerRadius = 5.0;
                const outerRadius = 12.0;

                if (dist < outerRadius) {
                    let w = 0;
                    if (dist < innerRadius) {
                        w = 1.0;
                    } else {
                        const t = (dist - innerRadius) / (outerRadius - innerRadius);
                        const v = 1 - t;
                        w = v * v * (3 - 2 * v);
                    }

                    // Keep a bit of original terrain so node bases blend better into waterline
                    const blendedNodeHeight = lerp(h, node.y, 0.8);
                    finalH = lerp(finalH, blendedNodeHeight, w);
                }
            }
        }

        // Return terrain height plus path weight for coloring
        return { y: finalH, weight: pathWeight };
    }

    generateTerrainStrip(chunkIndex, xOffset, isCenter, pathSegments, chunkNodes) {
        const width = 250;
        const depth = 250; // chunk depth
        const segmentsW = 100;
        const segmentsD = 100;

        const zStart = -chunkIndex * depth;
        const zCenter = zStart - depth / 2;

        const terrainGeo = new THREE.PlaneGeometry(width, depth, segmentsW, segmentsD);
        terrainGeo.rotateX(-Math.PI / 2);
        terrainGeo.translate(xOffset, 0, zCenter);

        const posAttr = terrainGeo.attributes.position;
        const colors = [];
        const normals = [];
        const normVec = new THREE.Vector3();
        const tanX = new THREE.Vector3();
        const tanZ = new THREE.Vector3();

        // Helper to get height (respecting node flattening only if center chunk)
        const getHeightAt = (tx, tz) => {
            if (isCenter) {
                return this.getModifiedHeight(tx, tz, pathSegments, chunkNodes).y;
            }
            return Terrain.getHeight(tx, tz);
        };

        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const z = posAttr.getZ(i);

            // Height
            let y = 0, weight = 0;
            if (isCenter) {
                const res = this.getModifiedHeight(x, z, pathSegments, chunkNodes);
                y = res.y;
                weight = res.weight;
            } else {
                y = Terrain.getHeight(x, z);
            }
            posAttr.setY(i, y);

            // Manual Normal Calculation for Seamless Borders
            const eps = 0.2;
            const hL = getHeightAt(x - eps, z);
            const hR = getHeightAt(x + eps, z);
            const hD = getHeightAt(x, z - eps);
            const hU = getHeightAt(x, z + eps);

            tanX.set(2 * eps, hR - hL, 0).normalize();
            tanZ.set(0, hU - hD, 2 * eps).normalize();
            normVec.crossVectors(tanZ, tanX).normalize();
            normals.push(normVec.x, normVec.y, normVec.z);

            // Color
            let col = Terrain.getColor(x, z, y);

            // Apply Path Color (Center only)
            if (isCenter && weight > 0.1) {
                const dirtR = 0.55;
                const dirtG = 0.48;
                const dirtB = 0.38;
                const blend = weight * 0.9;
                col.r = lerp(col.r, dirtR, blend);
                col.g = lerp(col.g, dirtG, blend);
                col.b = lerp(col.b, dirtB, blend);
            }

            colors.push(col.r, col.g, col.b);
        }

        terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        terrainGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

        const terrainMesh = new THREE.Mesh(terrainGeo, this.assets.terrainMaterial);
        terrainMesh.receiveShadow = true;
        return terrainMesh;
    }
}