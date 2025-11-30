import * as THREE from 'three';
import { Terrain } from './board-gen.js';
import { getWaterWaveHeight } from './utils.js';

export class PathVisuals {
    constructor(scene, assets, terrainVisuals) {
        this.scene = scene;
        this.assets = assets;
        this.terrainVisuals = terrainVisuals;
        
        this.activeTrailGroup = null;
        this.activeTrailDots = [];
        this.nextDotIndex = 0;
    }

    setActivePath(pathNodes) {
        // Clear existing trail, if any
        if (this.activeTrailGroup) {
            this.scene.remove(this.activeTrailGroup);
            this.activeTrailGroup.traverse(obj => {
                if (obj.geometry && !obj.geometry.userData.isShared) {
                    obj.geometry.dispose();
                }
                if (obj.material && obj.material.dispose) {
                    obj.material.dispose();
                }
            });
            this.activeTrailGroup = null;
        }

        // Reset tracking
        this.activeTrailDots = [];
        this.nextDotIndex = 0;

        if (!pathNodes || pathNodes.length < 2) return;

        const group = new THREE.Group();

        for (let i = 0; i < pathNodes.length - 1; i++) {
            const startNode = pathNodes[i];
            const endNode = pathNodes[i + 1];

            const startPos = new THREE.Vector3(startNode.x, startNode.y, startNode.z);
            const endPos = new THREE.Vector3(endNode.x, endNode.y, endNode.z);

            const segmentDir = new THREE.Vector3().subVectors(endPos, startPos);
            const segmentLength = segmentDir.length();
            if (segmentLength < 0.001) continue;
            segmentDir.normalize();

            const nodeRadius = 5.0;
            const visualGap = 1.0;
            const dotRadius = 0.3;
            const innerOffset = nodeRadius + visualGap + dotRadius;

            const usableLength = segmentLength - innerOffset * 2;
            if (usableLength <= 0.01) continue;

            const dotSpacing = 2.5;
            const dotCount = Math.floor(usableLength / dotSpacing);
            if (dotCount <= 0) continue;

            for (let j = 0; j < dotCount; j++) {
                const t = (j + 0.5) / dotCount;
                const distanceAlong = innerOffset + t * usableLength;

                const pos = new THREE.Vector3().copy(startPos).addScaledVector(segmentDir, distanceAlong);

                // Sample terrain/water height for proper placement
                const hInfo = this.terrainVisuals.getModifiedHeight(pos.x, pos.z, null, null);
                let surfaceHeight = hInfo.y;
                let onWater = false;
                
                // Store actual ground height (relative to dot center) for clamping
                // Dot is usually placed at surfaceHeight + 0.5. 
                // So min safe Y is hInfo.y + 0.5.
                const minDotY = hInfo.y + 0.5;

                if (surfaceHeight < Terrain.WATER_LEVEL) {
                    onWater = true;
                    surfaceHeight = Terrain.WATER_LEVEL;
                }

                let colorHex;
                if (onWater) {
                    colorHex = 0x44aaff; // Blue for over-water
                    pos.y = surfaceHeight + 0.3;
                } else {
                    pos.y = surfaceHeight + 0.5; // Raised to prevent clipping on hills
                    const biome = Terrain.getBiome(pos.z);
                    switch (biome) {
                        case 'GRASS':
                            colorHex = 0x44ff66;
                            break;
                        case 'FOREST':
                            colorHex = 0x00cc55;
                            break;
                        case 'DESERT':
                            colorHex = 0xffdd55;
                            break;
                        case 'SNOW':
                            colorHex = 0xffffff;
                            break;
                        case 'ALIEN':
                        default:
                            colorHex = 0xff55ff;
                            break;
                    }
                }

                const dotMaterial = this.assets.trailDotMaterial.clone();
                dotMaterial.color.setHex(colorHex);

                const dot = new THREE.Mesh(this.assets.trailDotGeometry, dotMaterial);
                dot.position.copy(pos);
                
                if (onWater) {
                    dot.userData.isFloating = true;
                    dot.userData.baseY = pos.y;
                    dot.userData.minY = minDotY;
                }

                group.add(dot);
                this.activeTrailDots.push(dot);
            }
        }

        this.scene.add(group);
        this.activeTrailGroup = group;
    }

    update(time) {
        if (!this.activeTrailDots) return;
        
        for (const dot of this.activeTrailDots) {
            if (dot.userData.isFloating && dot.visible) {
                const waveH = getWaterWaveHeight(dot.position.x, dot.position.z, time);
                const targetY = dot.userData.baseY + waveH;
                
                if (dot.userData.minY !== undefined) {
                    dot.position.y = Math.max(targetY, dot.userData.minY);
                } else {
                    dot.position.y = targetY;
                }
            }
        }
    }

    pruneTrail(playerPos) {
        if (!this.activeTrailDots || this.activeTrailDots.length === 0) return;

        const thresholdSq = 1.0 * 1.0;

        for (let i = this.nextDotIndex; i < this.activeTrailDots.length; i++) {
             const dot = this.activeTrailDots[i];
             if (!dot.visible) {
                 this.nextDotIndex = i + 1;
                 continue;
             }

             const dx = dot.position.x - playerPos.x;
             const dz = dot.position.z - playerPos.z;
             const distSq = dx * dx + dz * dz;

             if (distSq < thresholdSq) {
                 dot.visible = false;
                 this.nextDotIndex = i + 1;
             } else {
                 break;
             }
        }
    }
}