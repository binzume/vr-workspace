// @ts-check
'use strict';

/**
 * @param {ContentInfo} content 
 */
function bvhContentHandler(content) {
	if (content.name.toLowerCase().endsWith('.bvh') || content.name.toLowerCase().endsWith('.vmd')) {
		let activeModel = document.activeElement && document.activeElement.hasAttribute('vrm') && document.activeElement;
		if (activeModel) {
			activeModel.setAttribute('vrm-anim', 'src', content.url);
			return true;
		}
	}
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
					el.removeAttribute('vrm-anim');
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
		this.vrmEl = null;
		this.models = [];
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
				this.vrmEl.removeAttribute('vrm-anim');
				this.vrmEl.setAttribute('vrm-poser', {});
			} else {
				this.vrmEl.removeAttribute('vrm-poser');
			}
		});
		this._elByName('drag-toggle').addEventListener('change', (ev) => {
			this.models = this.el.sceneEl.querySelectorAll('[vrm]');
			for (let vrmEl of this.models) {
				for (let el of vrmEl.querySelectorAll('.stage')) {
					ev.detail.value ? el.classList.add('collidable') : el.classList.remove('collidable');
					el.setAttribute('visible', ev.detail.value ? 'true' : 'false');
				}
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
				this.vrmEl.removeAttribute('vrm-anim');
				if (this.vrmEl.hasAttribute('vrm-poser')) {
					this.vrmEl.components['vrm-poser'].setPoseData(JSON.parse(poseJson));
				} else {
					this.vrmEl.components.vrm.avatar.setPose(JSON.parse(poseJson));
				}
			}
		});
		this._elByName('pose-reset-button').addEventListener('click', (ev) => {
			if (!this.vrmEl) { return; }
			this.vrmEl.removeAttribute('vrm-anim');
			this.vrmEl.components.vrm.avatar.restPose();
		});


		this._elByName('pause-button').addEventListener('click', (ev) => {
			if (!this.vrmEl) { return; }
			if (this.vrmEl.components.vrm.avatar.mixer.timeScale > 0) {
				for (let el of this._getTargetEls()) {
					el.components.vrm.avatar.mixer.timeScale = 0;
				}
			} else {
				for (let el of this._getTargetEls()) {
					el.components.vrm.avatar.mixer.timeScale = 1;
				}
			}
		});

		this._elByName('rewind-button').addEventListener('click', (ev) => {
			for (let vrmEl of this._getTargetEls()) {
				vrmEl.components.vrm.avatar.mixer.setTime(0);
			}
		});

		this._timeText = this._elByName('time-text');
		this._onComponentRemoved = this._onComponentRemoved.bind(this);
		this._onComponentChanged = this._onComponentChanged.bind(this);
		this._onModelLoaded = (ev) => this._setAvatar(ev.detail.avatar);

		this._initBlendShapeList();
		this._initModelList();

		this._onFocusInEvent = (ev) => {
			if (ev.target.hasAttribute('vrm')) {
				this._setVrmEl(ev.target);
			}
			this._updateModelList();
		};
		document.body.addEventListener('focusin', this._onFocusInEvent);
		this._setVrmEl(document.querySelector('[vrm]'));
	},
	remove() {
		document.body.removeEventListener('focusin', this._onFocusInEvent);
		for (let el of this.models) {
			el.removeEventListener('componentremoved', this._onComponentRemoved);
		}
		this._setVrmEl(null);
	},
	tick() {
		if (!this.vrmEl || !this.vrmEl.components.vrm.avatar) { return; }
		let t = this.vrmEl.components.vrm.avatar.mixer.time | 0;
		this._timeText.setAttribute('value', `${(t / 60 | 0).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`);
	},
	_setVrmEl(vrmEl) {
		if (this.vrmEl) {
			this.vrmEl.removeEventListener('model-loaded', this._onModelLoaded);
			this.vrmEl.removeEventListener('componentchanged', this._onComponentChanged);
		}
		this.vrmEl = vrmEl;
		if (vrmEl == null) {
			return;
		}
		vrmEl.addEventListener('componentchanged', this._onComponentChanged);
		vrmEl.addEventListener('model-loaded', this._onModelLoaded);
		if (vrmEl.components.vrm && vrmEl.components.vrm.avatar) {
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

		let anim = vrmEl.getAttribute('vrm-anim');
		if (!anim) {
			return;
		}
		let path = decodeURI(anim.src);
		this._elByName('motion-name').setAttribute('value', path.split('/').pop());
	},
	_getTargetEls() {
		// @ts-ignore
		let sync = this._elByName('sync-toggle').value;
		if (sync) return this.models;
		return this.vrmEl ? [this.vrmEl] : [];
	},
	_setAvatar(avatar) {
		this.vrm = avatar;
		this._elByName('blend-shape-list').components.xylist.setContents(Object.keys(this.vrm.blendShapes));
	},
	_onComponentChanged(ev) {
		if (ev.detail.name == 'vrm') {
			this._updateModelList();
		} else if (ev.detail.name == 'vrm-anim') {
			let path = decodeURI(this.vrmEl.components['vrm-anim'].data.src);
			this._elByName('motion-name').setAttribute('value', path.split('/').pop());
			// this.play();
		}
	},
	_onComponentRemoved(ev) {
		if (ev.detail.name == 'vrm') {
			this._updateModelList();
		}
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
	_initModelList() {
		let listEl = this._elByName('model-list');
		let list = listEl.components.xylist;
		let self = this;
		list.setAdapter({
			create() {
				let el = document.createElement('a-plane');
				el.setAttribute('width', 2.5);
				el.setAttribute('height', 0.4);
				el.setAttribute('xyrect', {});
				el.setAttribute('xylabel', { wrapCount: 16, renderingMode: 'canvas' });
				let unloadButton = document.createElement('a-xybutton');
				unloadButton.setAttribute('width', 0.3);
				unloadButton.setAttribute('height', 0.3);
				unloadButton.setAttribute('position', { x: 1.0, y: 0, z: 0.05 });
				unloadButton.setAttribute('label', "X");
				unloadButton.addEventListener('click', (ev) => {
					let vrmEl = self.models[el.dataset.index];
					if (vrmEl == self.vrmEl) {
						self._setVrmEl(null);
					}
					vrmEl.parentNode.removeChild(vrmEl);
					self._updateModelList();
				});
				el.appendChild(unloadButton);
				return el;
			},
			bind(position, el, contents) {
				let path = decodeURI(contents[position].components.vrm.data.src);
				el.dataset.index = position;
				el.setAttribute('color', contents[position] == this.vrmEl ? 'green' : 'black');
				el.setAttribute('xylabel', { value: path.split('/').pop() });
			}
		});
		listEl.addEventListener('clickitem', (ev) => {
			this._setVrmEl(this.models[ev.detail.index]);
			this.models[ev.detail.index].focus();
		});

		this._updateModelList();
	},
	_updateModelList() {
		let listEl = this._elByName('model-list');
		for (let el of this.models) {
			el.removeEventListener('componentremoved', this._onComponentRemoved);
		}
		this.models = this.el.sceneEl.querySelectorAll('[vrm]');
		for (let el of this.models) {
			el.addEventListener('componentremoved', this._onComponentRemoved);
		}
		listEl.components.xylist.setContents(this.models);
	},
	/**
	 * @param {string} name 
	 */
	_elByName(name) {
		return (this.el.querySelector("[name=" + name + "]"));
	}
});
