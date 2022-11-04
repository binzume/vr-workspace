// import { THREE } from "aframe";

AFRAME.registerSystem('xranchor', {
	/** @type {Record<string, {uuid:string, anchor: XRAnchor|null, transform?: XRRigidTransform}>} */
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

		let features = this.el.sceneEl.getAttribute('webxr')?.optionalFeatures || [];
		if (!features.includes('anchors')) {
			features.push('anchors');
			this.el.sceneEl.setAttribute('webxr', { optionalFeatures: features });
		}

		let renderer = this.el.sceneEl.renderer;
		let sessionstart = () => {
			this.restoreAnchors();
			renderer.xr.getReferenceSpace()?.addEventListener('reset', ev=> this._needUpdate = true);
		};
		if (renderer.xr.getReferenceSpace()) {
			sessionstart();
		} else {
			renderer.xr.addEventListener( 'sessionstart', () => sessionstart());
		}
	},
	tick(t) {
		if (!this._needUpdate) {
			return;
		}
		let xrFrame = this.el.sceneEl.renderer.xr.getFrame();
		let space = this.el.sceneEl.renderer.xr.getReferenceSpace();
		if (xrFrame == null || space == null) {
			return;
		}
		this._needUpdate = false;

		for (let info of Object.values(this._anchors)) {
			if (info.anchor) {
				let pose = xrFrame.getPose(info.anchor.anchorSpace, space);
				info.transform = pose.transform;
			}
		}
		for (let [relname, obj] of Object.entries(this._objects)) {
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
	_save() {
		let uuids = Object.keys(this._anchors);
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
		if (obj == null) {
			delete this._objects[name];
			delete this._relanchors[name];
			this._save();
			return;
		}
		this._objects[name] = obj;
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
	registerRelativeAnchor(name, obj) {
		this._objects[name] = obj;
		if ( this.el.sceneEl.renderer.xr.getSession()) {
			this._needUpdate = true;
		}
	},
});


AFRAME.registerComponent('xranchor', {
	schema: {
		anchorName: { default: '' },
		saveEvent: { default: 'click' },
	},
	init() {
		let sys = this.el.sceneEl.systems.xranchor;
		sys.registerRelativeAnchor(this.data.anchorName || this.el.id, this.el.object3D);
		if (this.data.saveEvent) {
			this.el.addEventListener(this.data.saveEvent, (ev) => {
				sys.updateRelativeAnchor(this.data.anchorName || this.el.id, this.el.object3D);
			});
		}
	},
});

