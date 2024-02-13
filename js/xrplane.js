AFRAME.registerSystem('xrplane-preview', {
	/** @type {Set<XRPlane>} */
	_planes: null,
	_line: false,
	/** @type {THREE.Material} */
	_material: null,
	/** @type {THREE.LineBasicMaterial} */
	_lineMaterial: null,
	/** @type {THREE.Group} */
	_rootObject: null,
	_tickCount: 0,
    /** @type {{driver: any}} */
	_physics: null,
	_physicsBodies: [],
	init() {
		this._planes = new Set();
		let webxr = this.el.sceneEl.getAttribute('webxr') || {};
		let features = webxr.optionalFeatures ||= [];
		if (!features.includes('plane-detection')) {
			features.push('plane-detection');
			this.el.sceneEl.setAttribute('webxr', webxr);
		}
		if (this._line) {
			this._lineMaterial = new THREE.LineBasicMaterial({
				color: 0x00ff00,
				linewidth: 2,
			});
		}
		this._material = new THREE.MeshBasicMaterial({
			colorWrite: false,
		});
		this._rootObject = new THREE.Group();
		this.el.setObject3D('xrplanes', this._rootObject);

		let renderer = this.el.sceneEl.renderer;
		let onsessionstart = () => {
			this._resetPlanes();
			renderer.xr.getReferenceSpace()?.addEventListener('reset', ev => this._resetPlanes());
		};
		if (renderer.xr.getReferenceSpace()) {
			onsessionstart();
		} else {
			renderer.xr.addEventListener('sessionstart', onsessionstart);
		}
	},
	tick(t) {
		if (this._tickCount++ % 60) {
			return;
		}
		let frame = this.el.sceneEl.renderer?.xr?.getFrame?.();
		this._updatePlanes(frame);
	},
	_resetPlanes() {
		this._planes.clear();
		this._rootObject.clear();
		if (this._physics) {
			for (let body of this._physicsBodies) {
				this._physics.driver.removeBody(body);
			}
			this._physicsBodies = [];
		}
	},
	_updatePlanes(/** @type {XRFrame} */ frame) {
		if (frame?.detectedPlanes == null) {
			return;
		}

		if (!this._physics && globalThis.CANNON && this.el.sceneEl.systems.physics && this.el.sceneEl.systems.physics.driver) {
			this._physics = { driver: this.el.sceneEl.systems.physics.driver };
		}

		let space = this.el.sceneEl.renderer.xr.getReferenceSpace();
		for (let plane of /** @type {Set<XRPlane>} */ (frame.detectedPlanes)) {
			// TODO: combine objects
			if (!this._planes.has(plane)) {
				console.log('added', plane);
				this._planes.add(plane);
				let points = plane.polygon.map(p => new THREE.Vector3().copy(p));
				let pose = frame.getPose(plane.planeSpace, space);
				if (this._line) {
					let geometry = new THREE.BufferGeometry().setFromPoints( points );
					let line = new THREE.Line(geometry, this._lineMaterial);
					line.position.copy(pose.transform.position);
					line.quaternion.copy(pose.transform.orientation);
					this._rootObject.add(line);
				}
				if (points.length > 3) {
					let verts = [];
					verts.push(points[0], points[1], points[2]);
					verts.push(points[0], points[2], points[3]);
					let minX = 999, maxX = -999, minY = 999, maxY = -999;
					for (let p of points) {
						minX = Math.min(minX, p.x);
						maxX = Math.max(maxX, p.x);
						minY = Math.min(minY, p.z);
						maxY = Math.max(maxY, p.z);
					}
					let w = maxX - minX, h = maxY - minY;
					// let geometry = new THREE.BoxGeometry(w, 0.05, h);
					let geometry = new THREE.BufferGeometry().setFromPoints( verts );
					let wall = new THREE.Mesh(geometry, this._material);
					wall.position.copy(pose.transform.position);
					wall.quaternion.copy(pose.transform.orientation);
					wall.renderOrder = -1;
					this._rootObject.add(wall);

					if (this._physics) {
						let body = new CANNON.Body({
							type: CANNON.Body.STATIC,
							mass: 0,
						});
						body.addShape(new CANNON.Box(new CANNON.Vec3(w/2,0.05,h/2)),  new CANNON.Vec3(0, 0.05 ,0));
						body.position.copy(pose.transform.position);
						body.quaternion.copy(pose.transform.orientation);
						this._physics.driver.addBody(body);
						this._physicsBodies.push(body);
					}
				}
			}
		}
	},
});
