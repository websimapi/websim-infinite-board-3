import * as THREE from 'three';

export class Environment {
    constructor(scene) {
        this.scene = scene;
        
        // Fog
        this.scene.fog = new THREE.FogExp2(0x0b0b14, 0.0008);
        this.scene.background = new THREE.Color(0x0b0b14);

        // Lighting
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.scene.add(this.ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.0);
        this.sunLight.position.set(150, 200, 150);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 1000;
        const shadowSize = 300;
        this.sunLight.shadow.camera.left = -shadowSize;
        this.sunLight.shadow.camera.right = shadowSize;
        this.sunLight.shadow.camera.top = shadowSize;
        this.sunLight.shadow.camera.bottom = -shadowSize;
        this.sunLight.shadow.bias = -0.0005;
        this.scene.add(this.sunLight);

        // Follow light (for player)
        this.followLight = new THREE.PointLight(0x44aaff, 0.5, 100);
        this.followLight.position.set(0, 20, 0);
        this.scene.add(this.followLight);
    }

    update(time) {
        const dayDuration = 24 * 60;
        const t = (time % dayDuration) / dayDuration;

        const angle = (t * Math.PI * 2) - Math.PI / 2;
        const orbitRadius = 100;
        const sunY = Math.sin(angle) * orbitRadius;
        const sunX = Math.cos(angle) * orbitRadius;

        this.sunLight.position.set(sunX, sunY, 30);
        this.sunLight.lookAt(0, 0, 0);

        const colorDay = new THREE.Color(0x87CEEB);
        const colorSunset = new THREE.Color(0xFD5E53);
        const colorNight = new THREE.Color(0x050515);

        const targetBg = new THREE.Color();
        const sunHeight = Math.sin(angle);

        if (sunHeight > 0.2) {
            targetBg.copy(colorDay);
            this.sunLight.intensity = 1.2;
            this.ambientLight.intensity = 0.5;
            this.followLight.intensity = 0.2;
        } else if (sunHeight > -0.2) {
            const p = (sunHeight + 0.2) / 0.4;
            targetBg.lerpColors(colorNight, colorDay, p);

            if (sunHeight < 0.1 && sunHeight > -0.1) {
                targetBg.lerp(colorSunset, 0.5);
            }

            this.sunLight.intensity = Math.max(0, sunHeight * 1.2);
            this.ambientLight.intensity = 0.1 + p * 0.4;
            this.followLight.intensity = 1.0 - p * 0.8;
        } else {
            targetBg.copy(colorNight);
            this.sunLight.intensity = 0;
            this.ambientLight.intensity = 0.1;
            this.followLight.intensity = 1.2;
        }

        this.scene.background.lerp(targetBg, 0.05);
        this.scene.fog.color.copy(this.scene.background);
    }
}