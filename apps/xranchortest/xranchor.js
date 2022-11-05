
AFRAME.registerSystem('xranchor', {
	/** @type {Record<string, {uuid:string, anchor: XRAnchor|null, matrix?: THREE.Matrix4}>} */
	_anchors: {},
	/** @type {Record<string, {anchors:{uuid:string, matrix: number[]}[]}>} */
	_relanchors: {},
	/** @type {Record<string, THREE.Object3D>} */
	_objects: {},
	_needUpdate: false,
	_creating: false,
	init() {
		this._anchors = {};
		this._relanchors = {};
		this._objects = {};

		let webxr = this.el.sceneEl.getAttribute('webxr') || {};
		let features = webxr.optionalFeatures ||= [];
		if (!features.includes('anchors')) {
			features.push('anchors');
			this.el.sceneEl.setAttribute('webxr', webxr);
		}

		let renderer = this.el.sceneEl.renderer;
		let onsessionstart = () => {
			this.restoreAnchors();
			renderer.xr.getReferenceSpace()?.addEventListener('reset', ev => this._needUpdate = true);
		};
		if (renderer.xr.getReferenceSpace()) {
			onsessionstart();
		} else {
			renderer.xr.addEventListener('sessionstart', onsessionstart);
		}
	},
	tick(t) {
		if (!this._needUpdate) {
			return;
		}
		let frame = this.el.sceneEl.renderer.xr.getFrame();
		if (frame == null) {
			return;
		}
		this._needUpdate = false;

		// Update anchor matrix
		let space = this.el.sceneEl.renderer.xr.getReferenceSpace();
		for (let a of Object.values(this._anchors)) {
			if (a.anchor) {
				let pose = frame.getPose(a.anchor.anchorSpace, space);
				a.matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
			}
		}
		this._updateObjectTransforms();

		if (Object.keys(this._anchors).length == 0 && !this._creating) {
			this._creating = true;
			this.createAnchor(frame, space).finally(_ => this._creating = false);
		}
	},
	/**
	 * @param {XRFrame} frame 
	 * @param {XRReferenceSpace} space 
	 */
	async createAnchor(frame, space) {
		console.log('xranchor system: createAnchor');
		let anchorPose = new XRRigidTransform();
		let anchor = await frame.createAnchor(anchorPose, space);
		let id = anchor.requestPersistentHandle ? (await anchor.requestPersistentHandle()) : '_';
		console.log("xranchor system: Anchor created", id);
		this._addAnchor(id, anchor);
	},
	async restoreAnchors() {
		let xrSession = this.el.sceneEl.renderer.xr.getSession();
		this._relanchors = JSON.parse(localStorage.getItem('xranchorRels') || '{}');
		let ids = (localStorage.getItem('xranchorUUIDs') || '').split(',').filter(s => s != '');
		await Promise.allSettled(ids.map(id => {
			this._anchors[id] = { uuid: id, anchor: null };
			xrSession.restorePersistentAnchor(id).then(anchor => {
				this._anchors[id].anchor = anchor;
				this._needUpdate = true;
			});
		}));
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
	_updateObjectTransforms() {
		for (let [relname, obj] of Object.entries(this._objects)) {
			if (this._relanchors[relname]) {
				for (let a of this._relanchors[relname].anchors) {
					if (this._anchors[a.uuid]?.matrix) {
						obj.matrixWorld
							.fromArray(a.matrix)
							.premultiply(this._anchors[a.uuid].matrix)
							.decompose(obj.position, obj.quaternion, new THREE.Vector3());
						break;
					}
				}
			}
		}
	},
	_save() {
		let uuids = Object.keys(this._anchors).filter(id => id != '_');
		localStorage.setItem('xranchorUUIDs', uuids.join(','));
		localStorage.setItem('xranchorRels', JSON.stringify(this._relanchors));
	},
	clear() {
		this._relanchors = {};
		this._objects = {};
		this._save();
	},
	/**
	 * @param {string} name 
	 * @param {THREE.Object3D} obj
	 */
	updateRelativeAnchor(name, obj) {
		this._objects[name] = obj;
		let relanchor = { anchors: [] };
		for (let info of Object.values(this._anchors)) {
			if (info.matrix) {
				obj.updateMatrixWorld();
				let mat = info.matrix.clone().invert().multiply(obj.matrixWorld);
				relanchor.anchors.push({ uuid: info.uuid, matrix: mat.toArray() });
			}
		}
		this._relanchors[name] = relanchor;
		this._save();
	},
	/**
	* @param {string} name 
	* @param {THREE.Object3D} obj
	*/
	registerRelativeAnchor(name, obj) {
		this._objects[name] = obj;
		this._updateObjectTransforms();
	},
	/**
	* @param {string} name 
	* @param {boolean} permanent 
	*/
	unregisterRelativeAnchor(name, permanent = false) {
		delete this._objects[name];
		if (permanent) {
			delete this._relanchors[name];
			this._save();
		}
	},
});

AFRAME.registerComponent('xranchor', {
	schema: {
		anchorName: { default: '' },
		saveEvent: { default: '' },
	},
	init() {
		let sys = this.el.sceneEl.systems.xranchor;
		sys.registerRelativeAnchor(this.data.anchorName || this.el.id, this.el.object3D);
		if (this.data.saveEvent) {
			this.el.addEventListener(this.data.saveEvent, (ev) => this.updateAnchor());
		}
	},
	updateAnchor() {
		let sys = this.el.sceneEl.systems.xranchor;
		sys.updateRelativeAnchor(this.data.anchorName || this.el.id, this.el.object3D);
	},
	remove() {
		let sys = this.el.sceneEl.systems.xranchor;
		sys.unregisterRelativeAnchor(this.data.anchorName || this.el.id);
	}
});

