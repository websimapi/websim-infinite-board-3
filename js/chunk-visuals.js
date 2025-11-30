import * as THREE from 'three';
import { Terrain } from './board-gen.js';

/**
 * Adds chunk visuals (terrain, water, nodes, trails) to the scene.
 * 
 * @param {THREE.Scene} scene 
 * @param {AssetManager} assets 
 * @param {TerrainVisuals} terrainVisuals 
 * @param {Map} meshMap 
 * @param {Map} chunkGroups 
 * @param {THREE.Raycaster} raycaster 
 * @param {Object} chunkData 
 * @param {Object|null} prevChunkData 
 * @param {Object|null} nextChunkData 
 * @returns {THREE.Group}
 */
export function addChunkVisualsToScene(
    scene,
    assets,
    terrainVisuals,
    meshMap,
    chunkGroups,
    chunkData,
    prevChunkData = null,
    nextChunkData = null
) {
    // Remove existing chunk visual if updating
    if (chunkGroups.has(chunkData.index)) {
        const oldGroup = chunkGroups.get(chunkData.index);
        scene.remove(oldGroup);
        // Cleanup meshes from meshMap that belong to this chunk
        chunkData.nodes.forEach(node => meshMap.delete(node.id));
        // Dispose geometries
        oldGroup.traverse(o => {
            if (o.geometry && 
                o.geometry !== assets.nodeGeometry && 
                o.geometry !== assets.waterGeometry &&
                o.geometry !== assets.trailDotGeometry
            ) {
                o.geometry.dispose();
            }
        });
        chunkGroups.delete(chunkData.index);
    }

    const group = new THREE.Group();

    // 0. Prepare Path Segments (Merging current edges and next chunk edges)
    const pathSegments = [];

    const processEdge = (edge, nodesSource, otherNodesSource) => {
        let startNode = nodesSource.find(n => n.id === edge.from);
        if (!startNode) {
            const mesh = meshMap.get(edge.from);
            if (mesh) startNode = mesh.userData;
        }

        let endNode = nodesSource.find(n => n.id === edge.to);
        if (!endNode && otherNodesSource) {
            endNode = otherNodesSource.find(n => n.id === edge.to);
        }

        if (startNode && endNode) {
            pathSegments.push({
                sx: startNode.x, sy: startNode.y, sz: startNode.z,
                ex: endNode.x, ey: endNode.y, ez: endNode.z,
                lenSq: (endNode.x - startNode.x) ** 2 + (endNode.z - startNode.z) ** 2
            });
        }
    };

    chunkData.edges.forEach(edge => processEdge(edge, chunkData.nodes));

    if (nextChunkData) {
        nextChunkData.edges.forEach(edge => processEdge(edge, chunkData.nodes, nextChunkData.nodes));
    }

    // 1. Generate Terrain Strips (Center, Left, Right)
    // Collect all nodes that might affect terrain height
    const allNodes = [...chunkData.nodes];
    if (prevChunkData) allNodes.push(...prevChunkData.nodes);
    if (nextChunkData) allNodes.push(...nextChunkData.nodes);

    const terrainMeshes = [];
    // 3 strips covering 750m width
    const centerTerrain = terrainVisuals.generateTerrainStrip(chunkData.index, 0, true, pathSegments, allNodes);
    const leftTerrain = terrainVisuals.generateTerrainStrip(chunkData.index, -250, false, null, null);
    const rightTerrain = terrainVisuals.generateTerrainStrip(chunkData.index, 250, false, null, null);

    // Tag for identification
    centerTerrain.userData = { isGround: true };
    leftTerrain.userData = { isGround: true };
    rightTerrain.userData = { isGround: true };

    terrainMeshes.push(centerTerrain, leftTerrain, rightTerrain);

    group.add(centerTerrain);
    group.add(leftTerrain);
    group.add(rightTerrain);

    // 2. Add Water Plane
    const waterMesh = new THREE.Mesh(assets.waterGeometry, assets.waterMaterial);
    // Center water properly on the 250m chunk
    waterMesh.position.set(0, Terrain.WATER_LEVEL, -chunkData.index * 250 - 125);
    waterMesh.receiveShadow = true;
    waterMesh.userData = { isWater: true };
    group.add(waterMesh);

    // Raycasts for trails should also consider water
    terrainMeshes.push(waterMesh);

    // 2.5. Grass Generation (Instanced)
    const centerZ = -chunkData.index * 250 - 125;
    const biome = Terrain.getBiome(centerZ);
    
    // Generate grass in GRASS and FOREST biomes
    if (biome === 'GRASS' || biome === 'FOREST') {
        const grassCount = biome === 'GRASS' ? 4000 : 1500; // Less grass in forest (maybe trees take space)
        const dummy = new THREE.Object3D();
        const instancedGrass = new THREE.InstancedMesh(assets.grassGeometry, assets.grassMaterial, grassCount);
        
        instancedGrass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Optimization: Do not cast shadows from grass for performance, only receive
        instancedGrass.receiveShadow = true; 
        
        let grassIdx = 0;
        const chunkWidth = 700; // Cover center + neighbors loosely
        const startZ = -chunkData.index * 250;
        const depth = 250;

        for (let i = 0; i < grassCount; i++) {
            const x = (Math.random() - 0.5) * chunkWidth;
            const z = startZ - Math.random() * depth;
            
            // Limit to roughly relevant horizontal area
            if (Math.abs(x) > 370) continue;

            const slope = Terrain.getSlope(x, z);
            // Grass grows on flat or gentle slopes
            if (slope > 0.6) continue;

            const hInfo = terrainVisuals.getModifiedHeight(x, z, pathSegments, allNodes);
            
            // Not underwater, not on paths
            if (hInfo.y < Terrain.WATER_LEVEL + 0.3) continue;
            if (hInfo.weight > 0.2) continue; // 0.2 threshold clears grass from path edges

            // Position
            dummy.position.set(x, hInfo.y, z);
            
            // Random Scale & Rotation
            const s = 0.7 + Math.random() * 0.6;
            dummy.scale.set(s, s * (0.8 + Math.random() * 0.4), s);
            dummy.rotation.set(
                (Math.random() - 0.5) * 0.1, // Slight X tilt
                Math.random() * Math.PI * 2, // Random Y rotation
                (Math.random() - 0.5) * 0.1  // Slight Z tilt
            );
            
            dummy.updateMatrix();
            instancedGrass.setMatrixAt(grassIdx++, dummy.matrix);
        }

        instancedGrass.count = grassIdx;
        instancedGrass.instanceMatrix.needsUpdate = true;

        if (grassIdx > 0) {
            group.add(instancedGrass);
        }
    }

    // 3. Nodes
    chunkData.nodes.forEach(node => {
        const mesh = new THREE.Mesh(assets.nodeGeometry, assets.nodeMaterial.clone());
        mesh.position.set(node.x, node.y + 0.2, node.z);
        mesh.userData = { isNode: true, id: node.id, ...node };

        // Identify floating nodes
        if (Math.abs(node.y - (Terrain.WATER_LEVEL + 0.2)) < 0.1) {
            mesh.userData.isFloating = true;
            mesh.userData.baseY = mesh.position.y;
            
            // Calculate exact visual ground height at this location to prevent clipping
            const hInfo = terrainVisuals.getModifiedHeight(node.x, node.z, pathSegments, allNodes);
            // Mesh is height 0.5 centered (extends +/- 0.25). 
            // We want bottom of mesh (y-0.25) to be at or above ground (hInfo.y).
            // So min center y = hInfo.y + 0.25.
            mesh.userData.minY = hInfo.y + 0.25;
        }

        if (node.id === 'node_start') {
            mesh.material.emissive.setHex(0x00ff88);
        }

        group.add(mesh);
        meshMap.set(node.id, mesh);
    });

    // Ensure matrices are updated for accurate raycasting
    centerTerrain.updateMatrixWorld();
    leftTerrain.updateMatrixWorld();
    rightTerrain.updateMatrixWorld();
    waterMesh.updateMatrixWorld();

    scene.add(group);
    chunkGroups.set(chunkData.index, group);
    return group;
}