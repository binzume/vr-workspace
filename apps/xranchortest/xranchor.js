
AFRAME.registerComponent('xranchor', {
	schema: {
		anchorName: { default: '' },
		saveEvent: { default: 'click' },
	},
	_anchor: null,
	_transform: null,
	_save: false,
	init() {
		let features = this.el.sceneEl.getAttribute('webxr')?.optionalFeatures || [];
		if (!features.includes('anchors')) {
			features.push('anchors');
			this.el.sceneEl.setAttribute('webxr', {optionalFeatures: features});
		}
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
			this._onreset = ()=> {
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
			let anchorPose = new XRRigidTransform(this.el.object3D.position,  this.el.object3D.quaternion);
			xrFrame.createAnchor(anchorPose, space).then((anchor) => {
				console.log("Anchor created");
				this._anchor?.delete();
				this._anchor = anchor;
				let oldid = this._getUUID();
				if (oldid) {
					let xrSession = this.el.sceneEl.renderer.xr.getSession();
					xrSession.deletePersistentAnchor(oldid).then(()=> {
						console.log('Deleted', oldid);
						if (this._getUUID() == oldid) {
							this._updateUUID(null);
						}
					});
				}
				anchor.requestPersistentHandle().then(id=> {
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
