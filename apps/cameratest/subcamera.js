"use strict";

AFRAME.registerComponent('camera-app-window', {
	schema: {},
	init() {
		this.app = this.el.parentElement;
	},
	remove() {
		this.app.parentElement.removeChild(this.app);
	}
});

AFRAME.registerComponent('sub-camera', {
	schema: {
		width: { default: 800 },
		height: { default: 600 },
	},
	init() {
		let width = this.data.width, height = this.data.height;
		this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
		this.el.setObject3D('sub-camera', this.camera);
	},
	update() {
		if (this.renderTarget) {
			this.renderTarget.dispose();
		}

		let width = this.data.width, height = this.data.height;
		this.camera.aspect = width / height;
		this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
			magFilter: THREE.NearestFilter,
			minFilter: THREE.NearestFilter,
			wrapS: THREE.ClampToEdgeWrapping,
			wrapT: THREE.ClampToEdgeWrapping
		});
		this.el.emit('camera-connected', { renderTarget: this.renderTarget });
	},
	tick() {
		let xr = this.el.sceneEl.renderer.xr.enabled;
		this.el.sceneEl.renderer.xr.enabled = false;
		let org = this.el.sceneEl.renderer.getRenderTarget();
		this.el.sceneEl.renderer.setRenderTarget(this.renderTarget);
		this.el.sceneEl.renderer.render(this.el.sceneEl.object3D, this.camera);
		this.el.sceneEl.renderer.setRenderTarget(org);
		this.el.sceneEl.renderer.xr.enabled = xr;
	},
	remove() {
		if (this.renderTarget) {
			this.renderTarget.dispose();
		}
		this.el.removeObject3D('sub-camera');
	}
});

AFRAME.registerComponent('camera-src', {
	schema: { type: 'selector', default: null },
	init() {
		this.data.addEventListener('camera-connected', ev => {
			this.el.setAttribute('material', 'src', ev.detail.renderTarget.texture);
		});
	},
	update() {
		if (this.data == null || this.data.components == null) {
			return;
		}
		let subCamera = this.data.components['sub-camera'];
		if (subCamera && subCamera.renderTarget) {
			this.el.setAttribute('material', 'src', subCamera.renderTarget.texture);
		}
	}
});
