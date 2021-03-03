// @ts-check
'use strict';

/**
 * @param {ContentInfo} content 
 */
function bvhContentHandler(content) {
	if (content.name.toLowerCase().endsWith('.bvh')) {
		let activeModel = document.activeElement && document.activeElement.hasAttribute('vrm') && document.activeElement;
		if (activeModel) {
			activeModel.setAttribute('vrm-bvh', 'src', content.url);
			return true;
		}
	}
	return false;
};

AFRAME.registerComponent('vrm-select', {
	init() {
		let el = this.el;
		el.setAttribute('tabindex', 0);
		el.addEventListener('focus', (ev) => this._setStageColor('#88ff88'));
		el.addEventListener('blur', (ev) => this._setStageColor('white'));
		el.addEventListener('click', ev => el.focus());
		el.focus();

		el.addEventListener('app-launch', async (ev) => {
			let content = ev.detail.content;
			if (content) {
				if (content.url == null && content.fetch) {
					content.url = URL.createObjectURL(await (await content.fetch()).blob());
				}
				el.setAttribute('vrm', { src: content.url });
			}
			// Install .bvh handler
			if (ev.detail.appManager && !ev.detail.appManager.contentHandlers.includes(bvhContentHandler)) {
				ev.detail.appManager.contentHandlers.push(bvhContentHandler);
			}
		}, { once: true });

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
			} else if (ev.detail.name == 'V') {
				// saVe
				if (el.hasAttribute('vrm-poser')) {
					let poseJson = JSON.stringify(el.components.vrm.avatar.getPose(true));
					localStorage.setItem('vrm-pose01', poseJson);
					console.log(poseJson);
				}
			} else if (ev.detail.name == 'A') {
				// loAd
				let poseJson = localStorage.getItem('vrm-pose01');
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

AFRAME.registerComponent('vrm-control-panel', {
	schema: {},
	init() {
		this._elByName('blink-toggle').addEventListener('change', (ev) => {
			if (!this.vrmEl) { return; }
			this.vrmEl.setAttribute('vrm', 'blink', ev.detail.value);
		});
		this._elByName('lookat-toggle').addEventListener('change', (ev) => {
			if (!this.vrmEl) { return; }
			this.vrmEl.setAttribute('vrm', 'lookAt', ev.detail.value ? 'a-camera' : null);
		});
		this._elByName('first-person-toggle').addEventListener('change', (ev) => {
			if (!this.vrmEl) { return; }
			this.vrmEl.setAttribute('vrm', 'firstPerson', ev.detail.value);
		});
		this._elByName('physics-toggle').addEventListener('change', (ev) => {
			if (!this.vrmEl) { return; }
			this.vrmEl.setAttribute('vrm', 'enablePhysics', ev.detail.value);
		});
		this._elByName('skeleton-toggle').addEventListener('change', (ev) => {
			if (!this.vrmEl) { return; }
			if (ev.detail.value) {
				this.vrmEl.setAttribute('vrm-skeleton', {});
			} else {
				this.vrmEl.removeAttribute('vrm-skeleton');
			}
		});
		this._elByName('pose-edit-toggle').addEventListener('change', (ev) => {
			if (!this.vrmEl) { return; }
			if (ev.detail.value) {
				this.vrmEl.removeAttribute('vrm-bvh');
				this.vrmEl.setAttribute('vrm-poser', {});
			} else {
				this.vrmEl.removeAttribute('vrm-poser');
			}
		});

		// Pose save/load/reset
		let poseNames = ['pose01', 'pose02', 'pose03'];
		this._elByName('pose-save-button').setAttribute('values', poseNames.join(','));
		this._elByName('pose-save-button').addEventListener('change', (ev) => {
			if (!this.vrmEl) { return; }
			let poseJson = JSON.stringify(this.vrmEl.components.vrm.avatar.getPose(true));
			localStorage.setItem('vrm-' + ev.detail.value, poseJson);
		});

		this._elByName('pose-load-button').setAttribute('values', poseNames.join(','));
		this._elByName('pose-load-button').addEventListener('change', (ev) => {
			if (!this.vrmEl) { return; }
			let poseJson = localStorage.getItem('vrm-' + ev.detail.value);
			if (poseJson) {
				this.vrmEl.removeAttribute('vrm-bvh');
				if (this.vrmEl.hasAttribute('vrm-poser')) {
					this.vrmEl.components['vrm-poser'].setPoseData(JSON.parse(poseJson));
				} else {
					this.vrmEl.components.vrm.avatar.setPose(JSON.parse(poseJson));
				}
			}
		});
		this._elByName('pose-reset-button').addEventListener('click', (ev) => {
			if (!this.vrmEl) { return; }
			this.vrmEl.removeAttribute('vrm-bvh');
			this.vrmEl.components.vrm.avatar.restPose();
		});

		this._elByName('unload-button').addEventListener('click', (ev) => {
			if (!this.vrmEl) { return; }
			this.vrmEl.parentNode.removeChild(this.vrmEl);
			this._setVrmEl(document.querySelector('[vrm]'));
		});

		this._initBlendShapeList();

		this._onFocusInEvent = (ev) => {
			if (ev.target.hasAttribute('vrm')) {
				this._setVrmEl(ev.target);
			}
		};
		this._onModelLoaded = (ev) => this._setAvatar(ev.detail.avatar);
		document.body.addEventListener('focusin', this._onFocusInEvent);
		this._setVrmEl(document.querySelector('[vrm]'));
	},
	remove() {
		document.body.removeEventListener('focusin', this._onFocusInEvent);
		this._setVrmEl(null);
	},
	_setVrmEl(vrmEl) {
		if (this.vrmEl) {
			this.vrmEl.removeEventListener('model-loaded', this._onModelLoaded);
		}
		this.vrmEl = vrmEl;
		if (vrmEl == null) {
			return;
		}
		vrmEl.addEventListener('model-loaded', this._onModelLoaded);
		if (vrmEl.components.vrm.avatar) {
			this._setAvatar(vrmEl.components.vrm.avatar);
		}
		let attrs = vrmEl.getAttribute('vrm');
		if (!attrs) {
			return;
		}
		// @ts-ignore
		this._elByName('blink-toggle').value = attrs.blink;
		// @ts-ignore
		this._elByName('lookat-toggle').value = attrs.lookAt != null;
		// @ts-ignore
		this._elByName('physics-toggle').value = attrs.enablePhysics;
		// @ts-ignore
		this._elByName('first-person-toggle').value = attrs.firstPerson;
		// @ts-ignore
		this._elByName('pose-edit-toggle').value = vrmEl.hasAttribute('vrm-poser');
		// @ts-ignore
		this._elByName('skeleton-toggle').value = vrmEl.hasAttribute('vrm-skeleton');
	},
	_setAvatar(avatar) {
		this.vrm = avatar;
		this._elByName('blend-shape-list').components.xylist.setContents(Object.keys(this.vrm.blendShapes));
	},
	_initBlendShapeList() {
		let listEl = this._elByName('blend-shape-list');
		let list = listEl.components.xylist;
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
		this._elByName('blend-shape-reset').addEventListener('click', (ev) => {
			this.vrm.resetBlendShape();
			list.setContents(Object.keys(this.vrm.blendShapes));
		});
	},
	/**
	 * @param {string} name 
	 */
	_elByName(name) {
		return (this.el.querySelector("[name=" + name + "]"));
	}
});
