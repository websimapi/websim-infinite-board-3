import * as THREE from 'three';
import { getWaterWaveHeight } from './utils.js';

export class PlayerVisuals {
    constructor(scene, assets) {
        this.scene = scene;
        this.assets = assets;
        
        this.playerMesh = null;
        this.playerLight = null;
        this.lastPlayerPos = new THREE.Vector3();
        
        this.downRaycaster = new THREE.Raycaster();
        this.downRaycaster.ray.direction.set(0, -1, 0);
    }

    create(startPos) {
        this.playerMesh = new THREE.Mesh(this.assets.playerGeometry, this.assets.playerMaterial);
        this.playerMesh.rotation.order = 'YXZ';
        this.playerMesh.position.copy(startPos);
        this.scene.add(this.playerMesh);

        this.playerLight = new THREE.PointLight(0xff0055, 1, 10);
        this.playerMesh.add(this.playerLight);

        this.lastPlayerPos.copy(startPos);
    }

    updatePosition(pos, groundMeshes, waterMeshes, followLight, time) {
        if (!this.playerMesh) return;

        // Compute horizontal direction for orientation
        const moveDir = new THREE.Vector3().subVectors(pos, this.lastPlayerPos);
        const horizontalDir = new THREE.Vector3(moveDir.x, 0, moveDir.z);
        let hasDirection = horizontalDir.lengthSq() > 0.0001;
        if (hasDirection) {
            horizontalDir.normalize();
        }

        // Raycast down to find ground and water heights
        const origin = new THREE.Vector3(pos.x, pos.y + 100, pos.z);
        this.downRaycaster.ray.origin.copy(origin);

        let groundY = null;
        let waterY = null;

        if (groundMeshes && groundMeshes.length > 0) {
            const groundHits = this.downRaycaster.intersectObjects(groundMeshes, false);
            if (groundHits.length > 0) {
                groundY = groundHits[0].point.y;
            }
        }

        if (waterMeshes && waterMeshes.length > 0) {
            const waterHits = this.downRaycaster.intersectObjects(waterMeshes, false);
            if (waterHits.length > 0) {
                waterY = waterHits[0].point.y;
            }
        }

        const capsuleHalfHeight = 0.9;
        let finalPos = new THREE.Vector3().copy(pos);
        let isSwimming = false;

        if (waterY !== null && (groundY === null || waterY > groundY + 0.3)) {
            // Apply wave height
            const waveH = getWaterWaveHeight(pos.x, pos.z, time);
            
            let swimY = waterY - 0.2 + waveH;
            
            // Prevent clipping through ground if wave dips too low
            if (groundY !== null) {
                const minSwimY = groundY + capsuleHalfHeight; 
                if (swimY < minSwimY) {
                    swimY = minSwimY;
                }
            }
            
            finalPos.y = swimY;
            isSwimming = true;
        } else if (groundY !== null) {
            finalPos.y = groundY + capsuleHalfHeight;
        } else {
            finalPos.y = pos.y + capsuleHalfHeight;
        }

        this.playerMesh.position.copy(finalPos);

        // Orient player in direction of travel
        if (hasDirection) {
            const yaw = Math.atan2(horizontalDir.x, horizontalDir.z);
            this.playerMesh.rotation.y = yaw;
        }

        // Tilt when swimming
        if (isSwimming && hasDirection) {
            this.playerMesh.rotation.x = 1.3;
        } else {
            this.playerMesh.rotation.x = 0;
        }

        this.lastPlayerPos.copy(finalPos);

        if (followLight) {
            followLight.position.set(finalPos.x, finalPos.y + 20, finalPos.z + 10);
        }
    }
}