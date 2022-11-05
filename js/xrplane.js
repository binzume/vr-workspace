
AFRAME.registerSystem('xrplane-preview', {
	/** @type {Set<XRPlane>} */
	_planes: null,
	/** @type {THREE.LineBasicMaterial} */
	_material: null,
	_tickCount: 0,
	init() {
		this._planes = new Set();
		let webxr = this.el.sceneEl.getAttribute('webxr') || {};
		let features = webxr.optionalFeatures ||= [];
		if (!features.includes('plane-detection')) {
			features.push('plane-detection');
			this.el.sceneEl.setAttribute('webxr', webxr);
		}
		this._material = new THREE.LineBasicMaterial({
			color: 0xffffff,
			linewidth: 1,
		});
	},
	tick(t) {
		if (this._tickCount++ % 60) {
			return;
		}
		let frame = this.el.sceneEl.renderer.xr.getFrame();
		if (frame == null || frame.detectedPlanes == null) {
			return;
		}
		let space = this.el.sceneEl.renderer.xr.getReferenceSpace();
		for (let plane of /** @type {Set<XRPlane>} */ (frame.detectedPlanes)) {
			if (!this._planes.has(plane)) {
				console.log('added', plane);
				this._planes.add(plane);
				let pose = frame.getPose(plane.planeSpace, space);
				let points = plane.polygon.map(p => new THREE.Vector3().copy(p));
				let geometry = new THREE.BufferGeometry().setFromPoints( points );
				let line = new THREE.Line(geometry, this._material);
				line.position.copy(pose.transform.position);
				line.quaternion.copy(pose.transform.orientation);
				this.el.object3D.add(line);
			}
		}
	},
});
