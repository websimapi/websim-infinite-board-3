import * as THREE from 'three';

export class AssetManager {
    constructor() {
        // Shared Geometries
        this.nodeGeometry = new THREE.CylinderGeometry(5.0, 5.0, 0.5, 32);
        this.nodeGeometry.userData = { isShared: true };
        // Human scale: Radius 0.3m, Total Height 1.8m (Length 1.2m + 2*0.3m caps)
        this.playerGeometry = new THREE.CapsuleGeometry(0.3, 1.2, 4, 8);
        this.playerGeometry.userData = { isShared: true };
        
        // Materials
        this.nodeMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x222233, 
            emissive: 0x44aaff,
            emissiveIntensity: 0.3,
            roughness: 0.2,
            metalness: 0.8
        });

        this.playerMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xff0055,
            emissiveIntensity: 0.8,
            roughness: 0.2
        });

        this.lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0x44aaff, 
            transparent: true, 
            opacity: 0.3 
        });

        this.terrainMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.8,
            metalness: 0.1,
            flatShading: false 
        });

        this.terrainMaterial.onBeforeCompile = (shader) => {
            shader.fragmentShader = `
                varying vec3 vWorldPosition;
                
                // Simplex 2D noise
                vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
                float snoise(vec2 v){
                  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                           -0.577350269189626, 0.024390243902439);
                  vec2 i  = floor(v + dot(v, C.yy) );
                  vec2 x0 = v -   i + dot(i, C.xx);
                  vec2 i1;
                  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
                  vec4 x12 = x0.xyxy + C.xxzz;
                  x12.xy -= i1;
                  i = mod(i, 289.0);
                  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                  + i.x + vec3(0.0, i1.x, 1.0 ));
                  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
                  m = m*m ;
                  m = m*m ;
                  vec3 x = 2.0 * fract(p * C.www) - 1.0;
                  vec3 h = abs(x) - 0.5;
                  vec3 ox = floor(x + 0.5);
                  vec3 a0 = x - ox;
                  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
                  vec3 g;
                  g.x  = a0.x  * x0.x  + h.x  * x0.y;
                  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                  return 130.0 * dot(m, g);
                }

                ${shader.fragmentShader}
            `;

            shader.vertexShader = `
                varying vec3 vWorldPosition;
                ${shader.vertexShader}
            `;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                `
                #include <worldpos_vertex>
                vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
                `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                #include <color_fragment>
                
                // Add high frequency detail noise to mimic HD texture
                float n1 = snoise(vWorldPosition.xz * 0.5); // Macro detail
                float n2 = snoise(vWorldPosition.xz * 4.0); // Micro detail
                float n3 = snoise(vWorldPosition.xz * 15.0); // Fine Grain
                
                float detail = 0.95 + 0.05 * n1 + 0.03 * n2 + 0.02 * n3;
                
                diffuseColor.rgb *= detail;
                `
            );
        };

        // Advanced Water with MeshStandardMaterial for better lighting/shadow support
        this.waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x006677, // Teal-ish base for more realistic depth
            roughness: 0.1,  // Water is smooth
            metalness: 0.1,  // Dielectric
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.waterMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            this.waterMaterial.userData.shader = shader;

            shader.vertexShader = `
                uniform float uTime;
                varying vec3 vWaterPos;
                ${shader.vertexShader}
            `;
            
            // Improved wave vertex displacement
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                
                // Calculate world position for seamless waves across chunks
                vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
                
                float time = uTime * 0.5;
                
                // Sum of sines for organic wave motion
                float y = 0.0;
                
                // Swell
                y += sin(worldPos.x * 0.02 + time * 0.5) * 1.0;
                y += cos(worldPos.z * 0.02 + time * 0.4) * 1.0;
                
                // Detail
                y += sin(worldPos.x * 0.1 + worldPos.z * 0.05 + time) * 0.25;
                y += cos(worldPos.x * 0.05 - worldPos.z * 0.1 + time * 0.9) * 0.25;
                
                // Micro chop
                y += sin(worldPos.x * 0.3 + time * 2.0) * 0.05;
                
                // Bias up
                transformed.y += y * 0.5;
                
                vWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                `
            );

            shader.fragmentShader = `
                uniform float uTime;
                varying vec3 vWaterPos;
                
                // 3D Simplex Noise for animated water surface
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

                float snoise(vec3 v) { 
                    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

                    vec3 i  = floor(v + dot(v, C.yyy) );
                    vec3 x0 = v - i + dot(i, C.xxx) ;

                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min( g.xyz, l.zxy );
                    vec3 i2 = max( g.xyz, l.zxy );

                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;

                    i = mod289(i); 
                    vec4 p = permute( permute( permute( 
                                i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                            + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

                    float n_ = 0.142857142857; 
                    vec3  ns = n_ * D.wyz - D.xzx;

                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z); 

                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_ ); 

                    vec4 x = x_ *ns.x + ns.yyyy;
                    vec4 y = y_ *ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);

                    vec4 b0 = vec4( x.xy, y.xy );
                    vec4 b1 = vec4( x.zw, y.zw );

                    vec4 s0 = floor(b0)*2.0 + 1.0;
                    vec4 s1 = floor(b1)*2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));

                    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

                    vec3 p0 = vec3(a0.xy,h.x);
                    vec3 p1 = vec3(a0.zw,h.y);
                    vec3 p2 = vec3(a1.xy,h.z);
                    vec3 p3 = vec3(a1.zw,h.w);

                    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                    p0 *= norm.x;
                    p1 *= norm.y;
                    p2 *= norm.z;
                    p3 *= norm.w;

                    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                                dot(p2,x2), dot(p3,x3) ) );
                }

                ${shader.fragmentShader}
            `;

            // Inject color and lighting tweaks
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                #include <color_fragment>
                
                float t = uTime * 0.15;
                vec3 pos = vWaterPos * 0.08; 
                
                // Detailed noise for ripples
                float n1 = snoise(vec3(pos.x, pos.z, t));
                float n2 = snoise(vec3(pos.x * 2.5 + t, pos.z * 2.5 - t, t * 1.2));
                float noiseVal = n1 * 0.6 + n2 * 0.4; // Range approx -1 to 1
                
                // Normalize noise roughly to 0..1
                float nNorm = noiseVal * 0.5 + 0.5;

                // Color Ramp
                vec3 shallow = vec3(0.0, 0.35, 0.5);  // Teal
                vec3 deep = vec3(0.0, 0.05, 0.15);    // Dark Blue
                vec3 foam = vec3(0.9, 0.95, 1.0);     // White
                
                vec3 col = mix(deep, shallow, nNorm);
                
                // Sharp foam crests
                float foamMask = smoothstep(0.75, 0.85, nNorm);
                col = mix(col, foam, foamMask * 0.5);
                
                diffuseColor.rgb = col;
                
                // Opacity: Deep parts transparent, foam opaque
                diffuseColor.a = 0.65 + foamMask * 0.3;
                `
            );
            
            // Perturb roughness for sparkling highlights
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <roughnessmap_fragment>',
                `
                #include <roughnessmap_fragment>
                // Make wave crests glossier
                roughnessFactor = 0.15 - (nNorm * 0.1); 
                `
            );
        };

        // Initialize shared water geometry with higher segment count for smoother waves
        this.waterGeometry = new THREE.PlaneGeometry(800, 250, 192, 96);
        this.waterGeometry.rotateX(-Math.PI / 2);
        this.waterGeometry.userData = { isShared: true };

        // Dotted path trail (small glowing spheres)
        this.trailDotGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        this.trailDotGeometry.userData = { isShared: true };
        this.trailDotMaterial = new THREE.MeshBasicMaterial({
            color: 0x44aaff,
            transparent: true,
            opacity: 0.9
        });

        // 3D Grass Blade Geometry (5 vertices, slightly curved)
        // 0: Base Left, 1: Base Right, 2: Mid Left, 3: Mid Right, 4: Tip
        const grassPositions = [
            -0.07, 0.0, 0.0,  // 0
             0.07, 0.0, 0.0,  // 1
            -0.05, 0.5, 0.06, // 2
             0.05, 0.5, 0.06, // 3
             0.0,  1.0, 0.2   // 4
        ];
        
        const grassUVs = [
            0.0, 0.0,
            1.0, 0.0,
            0.0, 0.5,
            1.0, 0.5,
            0.5, 1.0
        ];
        
        const grassIndices = [
            0, 1, 2,
            1, 3, 2,
            2, 3, 4
        ];
        
        this.grassGeometry = new THREE.BufferGeometry();
        this.grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grassPositions, 3));
        this.grassGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(grassUVs, 2));
        this.grassGeometry.setIndex(grassIndices);
        this.grassGeometry.computeVertexNormals();
        this.grassGeometry.userData = { isShared: true };

        // Grass Shader Material
        this.grassMaterial = new THREE.MeshStandardMaterial({
            color: 0x44bb55,
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide,
            flatShading: false
        });

        this.grassMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            this.grassMaterial.userData.shader = shader;

            shader.vertexShader = `
                uniform float uTime;
                varying float vHeight;
                ${shader.vertexShader}
            `;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                
                vHeight = uv.y;
                
                // Get instance world position for consistent wind across the blade
                vec4 instancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                vec4 worldPos = modelMatrix * instancePos;
                
                // Wind Animation
                float t = uTime * 0.8;
                
                // Sample noise based on world position
                float windNoise = sin(worldPos.x * 0.1 + t) * sin(worldPos.z * 0.1 + t * 0.5);
                float windDetail = cos(worldPos.x * 0.5 + worldPos.z * 0.5 + t * 2.0) * 0.2;
                float combinedWind = windNoise + windDetail;
                
                // Bend logic: Only move top vertices
                float bendFactor = pow(vHeight, 1.8);
                
                // Directional sway
                transformed.x += combinedWind * bendFactor * 0.5;
                transformed.z += (sin(t * 1.5 + worldPos.x * 0.2) + 1.0) * 0.3 * bendFactor;
                
                // Taper width at top slightly for nicer shape if not done in geometry
                // (Geometry already tapers)
                `
            );

            shader.fragmentShader = `
                varying float vHeight;
                ${shader.fragmentShader}
            `;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                #include <color_fragment>
                
                // Procedural Gradient: Darker at bottom, lighter/yellower at top
                vec3 darkGreen = vec3(0.02, 0.15, 0.02);
                vec3 lightGreen = diffuseColor.rgb;
                vec3 sunTip = vec3(0.6, 0.7, 0.2);
                
                vec3 finalCol = mix(darkGreen, lightGreen, smoothstep(0.0, 0.6, vHeight));
                finalCol = mix(finalCol, sunTip, smoothstep(0.7, 1.0, vHeight) * 0.4);
                
                diffuseColor.rgb = finalCol;
                `
            );
        };
    }

    dispose() {
        this.nodeGeometry.dispose();
        this.playerGeometry.dispose();
        this.waterGeometry.dispose();
        this.grassGeometry.dispose();
        this.nodeMaterial.dispose();
        this.playerMaterial.dispose();
        this.lineMaterial.dispose();
        this.terrainMaterial.dispose();
        this.waterMaterial.dispose();
        this.grassMaterial.dispose();
        this.trailDotGeometry.dispose();
        this.trailDotMaterial.dispose();
    }
}