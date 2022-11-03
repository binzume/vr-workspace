// import { THREE } from "aframe";

AFRAME.registerSystem('xranchor', {
	/** @type {Record<string, {uuid:string, anchor: XRAnchor|null, transform?: XRRigidTransform}>} */
	_anchors: {},
	/** @type {Record<string, {anchors:{uuid:string, matrix: number[]}[]}>} */
	_relanchors: {},
	/** @type {Record<string, THREE.Object3D>} */
	_binds: {},
	_onreset: null,
	_needUpdate: false,
	_creating: false,
	init() {
		this._anchors = {};
		this._relanchors = {};
		this._binds = {};

		let features = this.el.sceneEl.getAttribute('webxr')?.optionalFeatures || [];
		if (!features.includes('anchors')) {
			features.push('anchors');
			this.el.sceneEl.setAttribute('webxr', { optionalFeatures: features });
		}
		this.el.sceneEl.addEventListener('enter-vr', (ev) => {
			this.restoreAnchors();
		});
		this.el.sceneEl.addEventListener('exit-vr', (ev) => {
			let space = this.el.sceneEl.renderer.xr.getReferenceSpace();
			console.log(space);
			if (space && this._onreset) {
				space.removeEventListener('reset', this._onreset);
			}
		});
		this.restoreAnchors();
	},
	tick(t) {
		if (!this._needUpdate) {
			return;
		}
		let xrFrame = this.el.sceneEl.renderer.xr.getFrame();
		let space = this.el.sceneEl.renderer.xr.getReferenceSpace();
		if (xrFrame == null || space == null) {
			console.log('xranchor system: wait for xrFrame');
			return;
		}
		this._needUpdate = false;

		if (!this._onreset) {
			this._onreset = () => {
				this._needUpdate = true;
				console.log('xranchor system: reset');
			};
			space.addEventListener('reset', this._onreset);
		}

		for (let info of Object.values(this._anchors)) {
			if (info.anchor) {
				let pose = xrFrame.getPose(info.anchor.anchorSpace, space);
				info.transform = pose.transform;
			}
		}
		for (let [relname, obj] of Object.entries(this._binds)) {
			if (this._relanchors[relname]) {
				for (let a of this._relanchors[relname].anchors) {
					if (this._anchors[a.uuid]?.transform) {
						let mat = new THREE.Matrix4().fromArray(this._anchors[a.uuid].transform.matrix);
						obj.matrixWorld.fromArray(a.matrix).premultiply(mat).decompose(obj.position,obj.quaternion, new THREE.Vector3());
						break;
					}
				}
			}
		}


		if (Object.keys(this._anchors).length == 0  && !this._creating) {
			console.log('xranchor system: createAnchor');
			this._creating = true;
			let anchorPose = new XRRigidTransform();
			xrFrame.createAnchor(anchorPose, space).then((anchor) => {
				console.log("xranchor system: Anchor created");
				anchor.requestPersistentHandle().then(id => {
					console.log("xranchor system: uuid=" + id);
					this._addAnchor(id, anchor);
					this._creating = false;
				});
			});
		}
	},
	restoreAnchors() {
		let xrSession = this.el.sceneEl.renderer.xr.getSession();
		if (xrSession == null) {
			return;
		}
		this._relanchors = JSON.parse(localStorage.getItem('xranchorRels') || '{}');
		for (let id of (localStorage.getItem('xranchorUUIDs') || '').split(',').filter(s => s != '')) {
			this._anchors[id] = { uuid: id, anchor: null };
			xrSession.restorePersistentAnchor(id).then(anchor => {
				this._anchors[id].anchor = anchor;
				this._needUpdate = true;
			});
		}
	},
	_addAnchor(id, anchor) {
		if (!this._anchors[id]) {
			this._anchors[id] = { uuid: id, anchor: anchor };
			this._needUpdate = true;
			this._save();
		}
	},
	_getAvailableAnchor() {
		for (let info of Object.values(this._anchors)) {
			if (info.anchor) {
				return info;
			}
		}
		return null;
	},
	_save() {
		let uuids = Object.keys(this._anchors);
		localStorage.setItem('xranchorUUIDs', uuids.join(','));
		localStorage.setItem('xranchorRels', JSON.stringify(this._relanchors));
	},
	clear() {
		this._relanchors = {};
		this._save();
	},
	/**
	 * @param {string} name 
	 * @param {THREE.Object3D} obj
	 */
	 updateRelativeAnchor(name, obj) {
		if (obj == null) {
			delete this._binds[name];
			delete this._relanchors[name];
			this._save();
			return;
		}
		this._binds[name] = obj;
		let relanchor = { anchors: [] };
		for (let info of Object.values(this._anchors)) {
			if (info.transform) {
				obj.updateMatrixWorld();
				let mat = new THREE.Matrix4().fromArray(info.transform.matrix).invert().multiply(obj.matrixWorld);
				relanchor.anchors.push({ uuid: info.uuid, matrix: mat.toArray() });
			}
		}
		this._relanchors[name] = relanchor;
		console.log('updateRelativeAnchor', relanchor.anchors.length);
		this._save();
	},
	/**
	* @param {string} name 
	* @param {THREE.Object3D} obj
	*/
	bindRelativeAnchor(name, obj) {
		this._binds[name] = obj;
		this._needUpdate = true;
	},
});


AFRAME.registerComponent('xranchor', {
	schema: {
		anchorName: { default: '' },
		saveEvent: { default: 'click' },
	},
	init() {
		let sys = this.el.sceneEl.systems.xranchor;
		sys.bindRelativeAnchor(this.data.anchorName || this.el.id, this.el.object3D);
		if (this.data.saveEvent) {
			this.el.addEventListener(this.data.saveEvent, (ev) => {
				sys.updateRelativeAnchor(this.data.anchorName || this.el.id, this.el.object3D);
			});
		}
	},
});



AFRAME.registerComponent('xranchor-legacy', {
	schema: {
		anchorName: { default: '' },
		saveEvent: { default: 'click' },
	},
	_anchor: null,
	_save: false,
	init() {
		//let features = this.el.sceneEl.getAttribute('webxr')?.optionalFeatures || [];
		//if (!features.includes('anchors')) {
		//	features.push('anchors');
		//	this.el.sceneEl.setAttribute('webxr', {optionalFeatures: features});
		//}
		console.log('xranchor: sys', this.system != null);

		this.el.sceneEl.addEventListener('enter-vr', (ev) => {
			console.log('restore');
			this.restore();
		});
		this.el.sceneEl.addEventListener('exit-vr', (ev) => {
			let space = this.el.sceneEl.renderer.xr.getReferenceSpace();
			console.log(space);
			if (this._onreset) {
				space?.removeEventListener('reset', this._onreset);
			}
		});
		if (this.data.saveEvent) {
			this.el.addEventListener(this.data.saveEvent, (ev) => {
				// this.system?.updateRelativeAnchor(this.data.anchorName, this.el.object3D);
				this.save();
			});
		}
		this.pause();
	},
	tick(t) {
		let xrFrame = this.el.sceneEl.renderer.xr.getFrame();
		let space = this.el.sceneEl.renderer.xr.getReferenceSpace();
		if (xrFrame == null || space == null) {
			return;
		}
		this.pause();

		if (!this._onreset) {
			this._onreset = () => {
				this.play();
				console.log('reset');
			};
			space.addEventListener('reset', this._onreset);
		}

		if (this._anchor != null) {
			console.log("Anchor proc1: ", this._anchor);
			let pose = xrFrame.getPose(this._anchor.anchorSpace, space);
			console.log(pose.transform);
			this.el.object3D.position.copy(pose.transform.position);
			this.el.object3D.quaternion.copy(pose.transform.orientation);
			return;
		}

		if (this._save) {
			this._save = false;
			let anchorPose = new XRRigidTransform(this.el.object3D.position, this.el.object3D.quaternion);
			xrFrame.createAnchor(anchorPose, space).then((anchor) => {
				console.log("Anchor created");
				this._anchor?.delete();
				this._anchor = anchor;
				let oldid = this._getUUID();
				if (oldid) {
					let xrSession = this.el.sceneEl.renderer.xr.getSession();
					xrSession.deletePersistentAnchor(oldid).then(() => {
						console.log('Deleted', oldid);
						if (this._getUUID() == oldid) {
							this._updateUUID(null);
						}
					});
				}
				anchor.requestPersistentHandle().then(id => {
					this._updateUUID(id);
				});
			});
		}
	},
	_updateUUID(id) {
		let name = this.data.anchorName;
		console.log(name, id);
		let xranchors = JSON.parse(localStorage.getItem('xranchors') || '{}');
		if (id == null) {
			delete xranchors[name];
		} else {
			xranchors[name] = { uuid: id };
		}
		localStorage.setItem('xranchors', JSON.stringify(xranchors));
	},
	_getUUID() {
		let name = this.data.anchorName;
		let xranchors = JSON.parse(localStorage.getItem('xranchors') || '{}');
		return xranchors[name]?.uuid;
	},
	async save() {
		if (!this.el.sceneEl.is('vr-mode') && !this.el.sceneEl.is('ar-mode')) {
			return;
		}
		this._anchor?.delete();
		this._anchor = null;
		this._save = true;
		this.play();
	},
	async restore() {
		let anchorId = this._getUUID();
		if (!anchorId) {
			return;
		}
		let xrSession = this.el.sceneEl.renderer.xr.getSession();
		xrSession.restorePersistentAnchor(anchorId).then(anchor => {
			this._anchor?.delete();
			this._anchor = anchor;
			this.play();
		});
	}
});
