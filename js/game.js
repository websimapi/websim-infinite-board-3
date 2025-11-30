import * as THREE from 'three';
import { BoardGenerator } from './board-gen.js';
import { Storage } from './storage.js';
import { Graphics } from './graphics.js';

export class Game {
    constructor() {
        this.graphics = new Graphics(document.body);
        this.generator = new BoardGenerator();
        
        this.chunks = new Map();
        this.currentNode = null;
        this.isMoving = false;
        this.moveProgress = 0;
        this.startMovePos = new THREE.Vector3();
        this.targetMovePos = new THREE.Vector3();
        this.moveDuration = 0;     // seconds needed for current move
        this.moveElapsed = 0;      // seconds elapsed in current move
        this.clock = new THREE.Clock(); // for time-based movement

        // Queued multi-step path (list of remaining nodes to visit)
        this.pathQueue = [];

        this.score = 0;
        this.scoreEl = document.getElementById('score');
        
        this.init();
        
        window.addEventListener('resize', () => this.graphics.resize());
        
        // Touch/Click handling
        const canvas = this.graphics.renderer.domElement;
        canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
        
        document.getElementById('reset-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent click-through to board
            this.reset();
        });

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    async init() {
        const savedState = Storage.getPlayerState();
        
        // Always ensure chunk 0
        await this.ensureChunk(0);
        
        let startNode = this.chunks.get(0).nodes.find(n => n.id === 'node_start');

        if (savedState && savedState.currentNodeId) {
            this.score = savedState.score || 0;
            this.updateScoreUI();
            
            // Load necessary chunk
            const chunkIdx = this.getChunkIndexFromNodeId(savedState.currentNodeId);
            await this.ensureChunk(chunkIdx);
            // Load previous chunk for edges if needed
            if (chunkIdx > 0) await this.ensureChunk(chunkIdx - 1);
            
            // Verify node exists in this version of the world
            const mesh = this.graphics.meshMap.get(savedState.currentNodeId);
            if (mesh) {
                this.currentNode = mesh.userData;
            } else {
                // Fallback if node not found (e.g. version change invalidating ID)
                console.warn("Saved node not found, resetting to start.");
                this.currentNode = startNode;
                this.score = 0;
            }
        } else {
            this.currentNode = startNode;
        }

        this.graphics.createPlayer(new THREE.Vector3(this.currentNode.x, this.currentNode.y, this.currentNode.z));
        this.graphics.updateCamera(new THREE.Vector3(this.currentNode.x, this.currentNode.y, this.currentNode.z));
        
        this.checkChunkLoad();

        // Generate background chunks (visual only)
        this.ensureChunk(-1);
        this.ensureChunk(-2);
    }

    getChunkIndexFromNodeId(id) {
        if(id === 'node_start') return 0;
        const parts = id.split('_'); 
        if(parts[0].startsWith('c')) {
            return parseInt(parts[0].substring(1));
        }
        return 0;
    }

    async ensureChunk(index) {
        if (this.chunks.has(index)) return;

        let chunkData = Storage.getChunk(index);
        
        if (!chunkData) {
            let prevExitNodes = [];
            if (index > 0) {
                if (!this.chunks.has(index - 1)) await this.ensureChunk(index - 1);
                prevExitNodes = this.chunks.get(index - 1).exitNodes;
            }
            chunkData = this.generator.generateChunk(index, prevExitNodes);
            Storage.saveChunk(index, chunkData);
        }

        this.chunks.set(index, chunkData);
        
        // Visualize current chunk and refresh neighbors to ensure smooth seams
        const prevChunk = this.chunks.get(index - 1);
        const nextChunk = this.chunks.get(index + 1);

        this.graphics.addChunkVisuals(chunkData, prevChunk, nextChunk);

        // Update neighbors if they exist
        if (prevChunk) {
            const prevPrev = this.chunks.get(index - 2);
            this.graphics.addChunkVisuals(prevChunk, prevPrev, chunkData);
        }

        if (nextChunk) {
            const nextNext = this.chunks.get(index + 2);
            this.graphics.addChunkVisuals(nextChunk, chunkData, nextNext);
        }
    }

    buildGraph() {
        const nodesById = new Map();
        const adjacency = new Map();

        for (const chunk of this.chunks.values()) {
            for (const node of chunk.nodes) {
                nodesById.set(node.id, node);
                if (!adjacency.has(node.id)) {
                    adjacency.set(node.id, []);
                }
            }
        }

        for (const chunk of this.chunks.values()) {
            for (const edge of chunk.edges) {
                const a = nodesById.get(edge.from);
                const b = nodesById.get(edge.to);
                if (!a || !b) continue;
                const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
                adjacency.get(a.id).push({ id: b.id, weight: dist });
                adjacency.get(b.id).push({ id: a.id, weight: dist });
            }
        }

        return { nodesById, adjacency };
    }

    computeShortestPath(startId, endId) {
        const { nodesById, adjacency } = this.buildGraph();
        if (!nodesById.has(startId) || !nodesById.has(endId)) return null;

        const dist = new Map();
        const prev = new Map();
        const visited = new Set();

        for (const id of nodesById.keys()) {
            dist.set(id, Infinity);
        }
        dist.set(startId, 0);

        while (true) {
            let currentId = null;
            let best = Infinity;
            for (const [id, d] of dist) {
                if (!visited.has(id) && d < best) {
                    best = d;
                    currentId = id;
                }
            }
            if (currentId === null) break;
            if (currentId === endId) break;

            visited.add(currentId);
            const neighbors = adjacency.get(currentId) || [];
            for (const { id: nbId, weight } of neighbors) {
                if (visited.has(nbId)) continue;
                const alt = dist.get(currentId) + weight;
                if (alt < dist.get(nbId)) {
                    dist.set(nbId, alt);
                    prev.set(nbId, currentId);
                }
            }
        }

        if (!prev.has(endId) && startId !== endId) return null;

        const pathIds = [];
        let u = endId;
        pathIds.unshift(u);
        while (prev.has(u)) {
            u = prev.get(u);
            pathIds.unshift(u);
        }

        // Map to node objects
        const pathNodes = pathIds.map(id => nodesById.get(id)).filter(Boolean);
        return pathNodes.length >= 2 ? pathNodes : null;
    }

    onPointerDown(event) {
        if (this.isMoving) return;
        if (event.button !== 0) return; // Only Left Click to move
        event.preventDefault();
        
        const node = this.graphics.getIntersectedNode(event.clientX, event.clientY);
        if (node && node.id !== this.currentNode.id) {
            this.attemptMove(node);
        }
    }

    onPointerMove(event) {
        event.preventDefault();

        // If moving, we lock the path visuals to the committed path.
        if (this.isMoving) {
            const node = this.graphics.getIntersectedNode(event.clientX, event.clientY);
            // Only update distance label if hovering over the target we are walking to
            if (node && this.currentNode && node.id === this.currentNode.id && this.graphics.playerMesh) {
                const startPos = this.graphics.playerMesh.position.clone();
                const endPos = this.targetMovePos.clone();
                const distanceMeters = startPos.distanceTo(endPos);
                const distanceKm = (distanceMeters / 1000).toFixed(2);
                this.graphics.setHoverDistanceLabel({
                    startPos,
                    endPos,
                    distanceKm
                });
            } else {
                this.graphics.setHoverDistanceLabel(null);
            }
            // Do NOT update active path or calculate new paths while moving
            return;
        }

        // If we don't have a current node yet, nothing to compare
        if (!this.currentNode) {
            this.graphics.setHoverDistanceLabel(null);
            this.graphics.setActivePath(null);
            return;
        }

        const node = this.graphics.getIntersectedNode(event.clientX, event.clientY);
        if (!node) {
            this.graphics.setHoverDistanceLabel(null);
            this.graphics.setActivePath(null);
            return;
        }

        if (node.id === this.currentNode.id) {
            this.graphics.setHoverDistanceLabel(null);
            this.graphics.setActivePath(null);
            return;
        }

        // Compute shortest path from current node to hovered node
        const path = this.computeShortestPath(this.currentNode.id, node.id);
        if (!path) {
            this.graphics.setHoverDistanceLabel(null);
            this.graphics.setActivePath(null);
            return;
        }

        // Draw glow along the whole path
        this.graphics.setActivePath(path);

        // Total distance along the path
        let totalMeters = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            const va = new THREE.Vector3(a.x, a.y, a.z);
            const vb = new THREE.Vector3(b.x, b.y, b.z);
            totalMeters += va.distanceTo(vb);
        }

        const distanceKm = (totalMeters / 1000).toFixed(2);
        const startPos = new THREE.Vector3(this.currentNode.x, this.currentNode.y, this.currentNode.z);
        const endPos = new THREE.Vector3(node.x, node.y, node.z);

        this.graphics.setHoverDistanceLabel({
            startPos,
            endPos,
            distanceKm
        });
    }

    areNodesConnected(nodeA, nodeB) {
        const idxA = this.getChunkIndexFromNodeId(nodeA.id);
        const idxB = this.getChunkIndexFromNodeId(nodeB.id);

        let relevantEdges = [];
        if (this.chunks.has(idxA)) relevantEdges.push(...this.chunks.get(idxA).edges);
        if (this.chunks.has(idxB) && idxB !== idxA) {
            relevantEdges.push(...this.chunks.get(idxB).edges);
        }

        return relevantEdges.some(e =>
            (e.from === nodeA.id && e.to === nodeB.id) ||
            (e.from === nodeB.id && e.to === nodeA.id)
        );
    }

    attemptMove(targetNode) {
        const path = this.computeShortestPath(this.currentNode.id, targetNode.id);
        if (!path || path.length < 2) return;

        // Queue all steps except the current node
        this.pathQueue = path.slice(1);

        // Show full chosen path glow
        this.graphics.setActivePath(path);

        // Start with first step
        const nextNode = this.pathQueue.shift();
        if (nextNode) {
            this.startMove(nextNode);
        }
    }

    startMove(targetNode) {
        this.isMoving = true;
        this.moveProgress = 0;
        this.moveElapsed = 0;
        this.startMovePos.set(this.currentNode.x, this.currentNode.y, this.currentNode.z);
        this.targetMovePos.set(targetNode.x, targetNode.y, targetNode.z);
        
        // Calculate realistic travel time (Naismith's Rule)
        // 5km/h base speed on flat ground (~1.4 m/s)
        // +1 hour for every 600m of ascent (+6s per meter)
        
        const horizontalDist = Math.hypot(
            this.targetMovePos.x - this.startMovePos.x,
            this.targetMovePos.z - this.startMovePos.z
        );
        const heightDiff = this.targetMovePos.y - this.startMovePos.y;
        
        const baseTime = horizontalDist / 1.4;
        const ascentTime = Math.max(0, heightDiff) * 6.0;
        
        // Real time walking duration
        this.moveDuration = Math.max(0.5, baseTime + ascentTime); 
        
        this.currentNode = targetNode;
        this.score++;
        this.updateScoreUI();
        
        Storage.savePlayerState({
            score: this.score,
            currentNodeId: this.currentNode.id
        });
        
        this.checkChunkLoad();
    }
    
    checkChunkLoad() {
        const currentChunkIdx = this.getChunkIndexFromNodeId(this.currentNode.id);
        // Load chunks ahead to support further view distance
        for (let i = 1; i <= 4; i++) {
            this.ensureChunk(currentChunkIdx + i);
        }

        // Ensure back chunks for seams
        this.ensureChunk(currentChunkIdx - 1);
        this.ensureChunk(currentChunkIdx - 2);

        // Prune distant chunks
        // Keep 2 behind, 4 ahead
        this.graphics.pruneChunks(currentChunkIdx - 2, currentChunkIdx + 4);
    }

    updateScoreUI() {
        this.scoreEl.innerText = `Steps: ${this.score}`;
    }

    animate() {
        requestAnimationFrame(this.animate);

        if (!this.graphics.playerMesh) return;

        const delta = this.clock.getDelta();
        
        let logicalPos = new THREE.Vector3();

        if (this.isMoving) {
            // Time-based movement for consistent walking speed
            this.moveElapsed += delta;
            const t = Math.min(1, this.moveElapsed / this.moveDuration);
            
            if (t >= 1) {
                this.isMoving = false;
                // Snap to exact target coordinates to ensure state matches visuals
                logicalPos.copy(this.targetMovePos);
                
                // Final prune to ensure any remaining dots at this step are cleared
                this.graphics.pruneTrail(this.graphics.playerMesh.position);

                // If more steps are queued, continue automatically
                if (this.pathQueue && this.pathQueue.length > 0) {
                    const nextNode = this.pathQueue.shift();
                    if (nextNode) {
                        this.startMove(nextNode);
                        // If starting new move immediately, update logicalPos to start
                        logicalPos.copy(this.startMovePos);
                    }
                } else {
                    // No more steps, clear active path glow
                    this.graphics.setActivePath(null);
                }
            } else {
                // Linear interpolation allows visual position to match logical progress 1:1
                logicalPos.lerpVectors(this.startMovePos, this.targetMovePos, t);
                this.graphics.pruneTrail(logicalPos);
            }
        } else {
            // Not moving, stay at current node
             if (this.currentNode) {
                 logicalPos.set(this.currentNode.x, this.currentNode.y, this.currentNode.z);
             } else {
                 logicalPos.copy(this.graphics.playerMesh.position);
             }
        }
        
        this.graphics.updatePlayerPosition(logicalPos);
        
        const camTarget = this.graphics.playerMesh.position;
            
        this.graphics.updateCamera(camTarget);
        this.graphics.render();
    }

    reset() {
        if(confirm("Reset progress?")) {
            Storage.clearAll();
            location.reload();
        }
    }
}