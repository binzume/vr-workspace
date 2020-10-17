"use strict";

AFRAME.registerComponent('vrm-select', {
	init() {
		let el = this.el;
		el.setAttribute('tabindex', 0);
		el.addEventListener('focus', (ev) => this._setStageColor('#88ff88'));
		el.addEventListener('blur', (ev) => this._setStageColor('white'));
		el.addEventListener('click', ev => el.focus());
		el.focus();

		document.querySelectorAll('[laser-controls]').forEach(el => {
			let g = el.getAttribute('generic-tracked-controller-controls');
			if (!g || g.defaultModel) {
				el.setAttribute('static-body', "shape:sphere;sphereRadius:0.05");
			}
		});

		el.addEventListener('gesture', async (ev) => {
			console.log('vrm gesture', ev);
			if (ev.detail.name == 'O') {
				// destroy vrm
				el.parentNode.removeChild(el);
				el.destroy();
				el = null;
			}
			if (ev.detail.name == 'B') {
				// Bone edit
				if (el.hasAttribute('vrm-poser')) {
					el.removeAttribute('vrm-poser');
				} else {
					el.removeAttribute('vrm-bvh');
					el.setAttribute('vrm-poser', {});
				}
			} else if (ev.detail.name == 'RECT') {
				let blendShapeWindow = await instantiate('app-vrm-blendShape');
				blendShapeWindow.setAttribute('pose-editor-window', 'vrm', el);
			} else if (ev.detail.name == 'V') {
				// saVe
				if (el.hasAttribute('vrm-poser')) {
					let poseJson = JSON.stringify(el.components.vrm.avatar.getPose(true));
					localStorage.setItem('vrm-pose0', poseJson);
					console.log(poseJson);
				}
			} else if (ev.detail.name == 'A') {
				// loAd
				let poseJson = localStorage.getItem('vrm-pose0');
				if (poseJson) {
					el.removeAttribute('vrm-bvh');
					el.components.vrm.avatar.setPose(JSON.parse(poseJson));
				}
			}
		});
	},
	_setStageColor(color) {
		this.el.querySelector('.stage').setAttribute('material', { color: color });
	}
});

AFRAME.registerComponent('pose-editor-window', {
	schema: {
		vrm: { type: 'selector', default: '[vrm]' },
	},
	init() {
		let listEl = this.el.querySelector('[name=item-list]');
		let list = this.list = listEl.components.xylist;
		let self = this;
		list.setAdapter({
			create() {
				let el = document.createElement('a-plane');
				el.setAttribute('width', 3);
				el.setAttribute('height', 0.48);
				el.setAttribute('color', 'black');
				el.setAttribute('xyrect', {});
				let sliderEl = document.createElement('a-xyrange');
				sliderEl.setAttribute('width', 1.5);
				sliderEl.setAttribute('position', { x: 0.8, y: 0, z: 0.05 });
				sliderEl.addEventListener('change', (ev) => {
					self.vrm.setBlendShapeWeight(el.getAttribute('xylabel').value, ev.detail.value * 0.01);
				});
				el.appendChild(sliderEl);
				return el;
			},
			bind(position, el, contents) {
				el.setAttribute('xylabel', { value: contents[position], wrapCount: 16, renderingMode: 'canvas' });
				el.querySelector('a-xyrange').value = self.vrm.getBlendShapeWeight(contents[position]) * 100;
			}
		});
		this.el.querySelector('[name=reset-all-morph]').addEventListener('click', (ev) => {
			self.vrm.resetBlendShape();
			this.list.setContents(this.blendShapeNames);
		});
		this.onModelLoaded = (ev) => this.updateAvatar(ev.detail.avatar);
	},
	update() {
		this.remove();
		this.vrmEl = this.data.vrm;
		this.vrmEl.addEventListener('model-loaded', this.onModelLoaded);
		if (this.vrmEl.components.vrm.avatar) {
			this.updateAvatar(this.vrmEl.components.vrm.avatar);
		}
	},
	updateAvatar(avatar) {
		this.vrm = avatar;
		this.blendShapeNames = Object.keys(avatar.blendShapes);
		this.list.setContents(this.blendShapeNames);
	},
	remove() {
		if (this.vrmEl) {
			this.vrmEl.removeEventListener('model-loaded', this.onModelLoaded);
		}
	}
});
