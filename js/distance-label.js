import * as THREE from 'three';

export class DistanceLabel {
    constructor(scene) {
        this.sprite = null;
        this.canvas = null;
        this.ctx = null;
        this.texture = null;
        this.lastText = '';

        this._createSprite('0 km');
        scene.add(this.sprite);
        this.sprite.visible = false;
    }

    _createSprite(initialText) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // Make the label purely overlay UI: no depth writes/tests, no tone mapping
        const material = new THREE.SpriteMaterial({ 
            map: texture, 
            transparent: true,
            depthWrite: false,
            depthTest: false,
            toneMapped: false
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(6, 3, 1);
        sprite.renderOrder = 999; // ensure it renders on top

        this.canvas = canvas;
        this.ctx = ctx;
        this.texture = texture;
        this.sprite = sprite;

        this._drawText(initialText);
    }

    _drawText(text) {
        const { canvas, ctx, texture } = this;
        if (!ctx || !canvas || !texture) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 40px Segoe UI';

        ctx.shadowColor = 'rgba(68,170,255,0.8)';
        ctx.shadowBlur = 18;
        ctx.fillStyle = 'rgba(200,230,255,0.95)';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        texture.needsUpdate = true;
    }

    set(info) {
        if (!this.sprite) return;

        if (!info) {
            this.sprite.visible = false;
            return;
        }

        const { startPos, endPos, distanceKm } = info;
        const mid = startPos.clone().add(endPos).multiplyScalar(0.5);
        mid.y += 2.0;

        this.sprite.position.copy(mid);
        
        // Only redraw texture if text actually changed to prevent stutter
        const text = `${distanceKm} km`;
        if (this.lastText !== text) {
            this._drawText(text);
            this.lastText = text;
        }

        this.sprite.visible = true;
    }
}

