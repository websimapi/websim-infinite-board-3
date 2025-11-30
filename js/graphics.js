import * as THREE from 'three';
import { AssetManager } from './assets.js';
import { TerrainVisuals } from './terrain-visuals.js';
import { DistanceLabel } from './distance-label.js';
import { addChunkVisualsToScene } from './chunk-visuals.js';
import { Terrain } from './board-gen.js';
import { Environment } from './environment.js';
import { PlayerVisuals } from './player-visuals.js';
import { PathVisuals } from './path-visuals.js';
import { getWaterWaveHeight } from './utils.js';

export class Graphics {
    constructor(container) {
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10000);
        this.camera.position.set(0, 30, 40);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);

        // Environment (Lighting & Fog)
        this.environment = new Environment(this.scene);

        // Animation clock
        this.clock = new THREE.Clock();

        // Zoom
        this.zoom = 0.6;
        this.minZoom = 0.2; // Close up (approx 4-5m away)
        this.maxZoom = 20.0; // Far away (tactical)

        // Touch Interaction State
        this.gestureMode = null; // 'zoom' | 'pan' | null
        this.startPinchDist = 0;
        this.startZoom = 0;
        this.startPanCenter = new THREE.Vector2();
        this.lastPanCenter = new THREE.Vector2();

        window.addEventListener('wheel', (e) => {
            // Smoother zoom handling with reduced sensitivity
            const sensitivity = 0.002;
            const delta = e.deltaY * sensitivity;
            this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + delta));
        }, { passive: true });

        this.renderer.domElement.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                this.startPinchDist = dist;
                this.startZoom = this.zoom;
                
                const cx = (e.touches[0].pageX + e.touches[1].pageX) / 2;
                const cy = (e.touches[0].pageY + e.touches[1].pageY) / 2;
                
                this.startPanCenter.set(cx, cy);
                this.lastPanCenter.set(cx, cy);
                
                this.gestureMode = null;
                this.isFollowingPlayer = false;
            }
        }, { passive: false });

        this.renderer.domElement.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                
                const dist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );

                const cx = (e.touches[0].pageX + e.touches[1].pageX) / 2;
                const cy = (e.touches[0].pageY + e.touches[1].pageY) / 2;

                // Determine gesture mode if not yet locked
                if (!this.gestureMode) {
                    const zoomDelta = Math.abs(dist - this.startPinchDist);
                    const panDelta = Math.hypot(cx - this.startPanCenter.x, cy - this.startPanCenter.y);
                    
                    // Thresholds to distinguish intent
                    if (zoomDelta > 10) {
                        this.gestureMode = 'zoom';
                    } else if (panDelta > 10) {
                        this.gestureMode = 'pan';
                    }
                }
                
                if (this.gestureMode === 'zoom') {
                    if (this.startPinchDist > 0) {
                        const scale = this.startPinchDist / dist;
                        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.startZoom * scale));
                    }
                } else if (this.gestureMode === 'pan') {
                    const dy = cy - this.lastPanCenter.y;
                    // Restrict to vertical axis (forward/back) only; dx is 0
                    this.panCamera(0, dy);
                }
                
                this.lastPanCenter.set(cx, cy);
            }
        }, { passive: false });

        // Pan Control
        this.isFollowingPlayer = true;
        this.panFocus = new THREE.Vector3();
        this.isPanning = false;
        this.lastMouse = new THREE.Vector2();

        this.renderer.domElement.addEventListener('pointerdown', (e) => {
            if (e.button === 1) { // Middle Click
                e.preventDefault();
                this.isPanning = true;
                this.isFollowingPlayer = false;
                this.lastMouse.set(e.clientX, e.clientY);
                this.renderer.domElement.setPointerCapture(e.pointerId);
            } else if (e.button === 0) { // Left Click
                this.isFollowingPlayer = true;
            }
        });

        this.renderer.domElement.addEventListener('pointermove', (e) => {
            if (this.isPanning) {
                e.preventDefault();
                const dx = e.clientX - this.lastMouse.x;
                const dy = e.clientY - this.lastMouse.y;
                this.lastMouse.set(e.clientX, e.clientY);
                this.panCamera(dx, dy);
            }
        });

        this.renderer.domElement.addEventListener('pointerup', (e) => {
            if (e.button === 1) {
                this.isPanning = false;
                this.renderer.domElement.releasePointerCapture(e.pointerId);
            }
        });

        // Assets / terrain / raycasting
        this.assets = new AssetManager();
        this.terrainVisuals = new TerrainVisuals(this.assets);
        this.meshMap = new Map();
        this.chunkGroups = new Map();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Sub-systems
        this.playerVisuals = new PlayerVisuals(this.scene, this.assets);
        this.pathVisuals = new PathVisuals(this.scene, this.assets, this.terrainVisuals);

        // Track ground and water meshes for collision
        this.groundMeshes = [];
        this.waterMeshes = [];

        // Distance label manager
        this.distanceLabel = new DistanceLabel(this.scene);
    }
    
    // Getters for properties that might be accessed by Game (though Game should mostly use methods)
    get playerMesh() {
        return this.playerVisuals.playerMesh;
    }

    setHoverDistanceLabel(info) {
        this.distanceLabel.set(info);
    }

    setActivePath(pathNodes) {
        this.pathVisuals.setActivePath(pathNodes);
    }

    pruneTrail(playerPos) {
        this.pathVisuals.pruneTrail(playerPos);
    }

    addChunkVisuals(chunkData, prevChunkData = null, nextChunkData = null) {
        const group = addChunkVisualsToScene(
            this.scene,
            this.assets,
            this.terrainVisuals,
            this.meshMap,
            this.chunkGroups,
            chunkData,
            prevChunkData,
            nextChunkData
        );

        // Collect ground and water meshes for collision
        const groundMeshes = this.groundMeshes;
        const waterMeshes = this.waterMeshes;

        group.traverse(obj => {
            if (obj.isMesh && obj.userData) {
                if (obj.userData.isGround && !groundMeshes.includes(obj)) {
                    groundMeshes.push(obj);
                }
                if (obj.userData.isWater && !waterMeshes.includes(obj)) {
                    waterMeshes.push(obj);
                }
            }
        });

        return group;
    }

    pruneChunks(minIdx, maxIdx) {
        const toRemove = [];
        for (const [index, group] of this.chunkGroups) {
            if (index < minIdx || index > maxIdx) {
                toRemove.push(index);
            }
        }

        toRemove.forEach(index => {
            const group = this.chunkGroups.get(index);

            // Remove meshes from collision arrays
            group.traverse(obj => {
                if (obj.isMesh && obj.userData) {
                    if (obj.userData.isGround) {
                        this.groundMeshes = this.groundMeshes.filter(m => m !== obj);
                    }
                    if (obj.userData.isWater) {
                        this.waterMeshes = this.waterMeshes.filter(m => m !== obj);
                    }
                }
            });

            this.scene.remove(group);
            
            group.traverse(obj => {
                if (obj.userData && obj.userData.id) {
                    this.meshMap.delete(obj.userData.id);
                }
                if (obj.geometry && !obj.geometry.userData.isShared) {
                    obj.geometry.dispose();
                }
            });
            
            this.chunkGroups.delete(index);
        });
    }

    createPlayer(startPos) {
        this.playerVisuals.create(startPos);
    }

    panCamera(dx, dy) {
        // Sensitivity based on zoom level
        const factor = this.zoom * 0.15;
        
        // Use camera direction projected on ground for intuitive ground-plane panning
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        
        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        
        // dx > 0 (Drag Right) -> Move camera Left (World moves Right)
        // dy > 0 (Drag Down) -> Move camera Forward (World moves Down / Pull far content closer)
        right.multiplyScalar(-dx * factor);
        forward.multiplyScalar(dy * factor);
        
        this.panFocus.add(right).add(forward);
    }

    updatePlayerPosition(pos) {
        const time = this.clock.getElapsedTime();
        this.playerVisuals.updatePosition(
            pos, 
            this.groundMeshes, 
            this.waterMeshes, 
            this.environment.followLight,
            time
        );
    }

    updateCamera(targetPos) {
        if (this.isFollowingPlayer) {
            // Smoothly interpolate focus point to avoid camera flipping when refocusing from a distance
            this.panFocus.lerp(targetPos, 0.1);
        }

        // Offset scaled by zoom. Base offset provides a good 3rd person angle.
        // At zoom 1.0 -> (0, 25, 25)
        // At zoom 0.2 -> (0, 5, 5) -> Close over the shoulder feel
        const offset = new THREE.Vector3(0, 25, 25).multiplyScalar(this.zoom);
        const idealPos = this.panFocus.clone().add(offset);
        
        // Increased smoothing (lower lerp factor) to reduce jitter
        this.camera.position.lerp(idealPos, 0.05);
        this.camera.lookAt(this.panFocus);
    }

    getIntersectedNode(x, y) {
        this.mouse.x = (x / window.innerWidth) * 2 - 1;
        this.mouse.y = -(y / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Performance Fix: Only raycast against node meshes
        // Raycasting against the entire scene (including high-poly terrain) on every mouse move causes stutter
        const candidates = Array.from(this.meshMap.values());
        const intersects = this.raycaster.intersectObjects(candidates, false);

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            if (obj.userData && obj.userData.isNode) {
                return obj.userData;
            }
        }
        return null;
    }

    render() {
        const time = this.clock.getElapsedTime();

        if (this.assets.waterMaterial.userData.shader) {
            this.assets.waterMaterial.userData.shader.uniforms.uTime.value = time;
        }

        if (this.assets.grassMaterial.userData.shader) {
            this.assets.grassMaterial.userData.shader.uniforms.uTime.value = time;
        }

        // Animate floating nodes
        for (const mesh of this.meshMap.values()) {
            if (mesh.userData.isFloating) {
                const waveH = getWaterWaveHeight(mesh.position.x, mesh.position.z, time);
                const targetY = mesh.userData.baseY + waveH;
                
                // Prevent clipping into ground
                if (mesh.userData.minY !== undefined) {
                    mesh.position.y = Math.max(targetY, mesh.userData.minY);
                } else {
                    mesh.position.y = targetY;
                }
            }
        }

        // Animate trail
        this.pathVisuals.update(time);

        // Delegated day/night cycle
        this.environment.update(time);
        
        this.renderer.render(this.scene, this.camera);
    }

    // Removed updateDayNightCycle() {}
    
    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    clear() {
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
        this.meshMap.clear();
        this.chunkGroups.clear();
        this.groundMeshes = [];
        this.waterMeshes = [];
    }
}