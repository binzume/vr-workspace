"use strict";

// TODO: Save as glTF.

AFRAME.registerComponent('paint3d', {
	schema: {},
	init() {
		for (let b of this.el.querySelectorAll('.paint3d-color')) {
			b.addEventListener('click', ev => {
				ev.detail.cursorEl.setAttribute('paint3d-brush', { color: b.getAttribute('color') });
			});
		}
		for (let b of this.el.querySelectorAll('.paint3d-size')) {
			b.addEventListener('click', ev => {
				ev.detail.cursorEl.setAttribute('paint3d-brush', { lineWidth: b.getAttribute('label') });
			});
		}
		this._elByName('mode-line').addEventListener('click', ev => {
			ev.detail.cursorEl.setAttribute('paint3d-brush', { mode: "line" });
		});
		this._elByName('mode-points').addEventListener('click', ev => {
			ev.detail.cursorEl.setAttribute('paint3d-brush', { mode: "points" });
		});
		this._elByName('clear-button').addEventListener('click', ev => {
			this.remove();
			this.el.sceneEl.removeAttribute('paint3d-canvas');
		});
		this._elByName('undo-button').addEventListener('click', ev => {
			let canvas = this.el.sceneEl.components['paint3d-canvas'];
			canvas && canvas.undo();
		});
	},
	remove() {
		for (let el of this.el.sceneEl.querySelectorAll('[paint3d-brush]')) {
			el.removeAttribute('paint3d-brush');
		}
	},
	_elByName(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
});

AFRAME.registerComponent('paint3d-canvas', {
	schema: {},
	init() {
		this._rootObj = new THREE.Group();
		this.el.setObject3D('paint3d-canvas', this._rootObj);
	},
	remove() {
		this.el.removeObject3D('paint3d-canvas');
	},
	add(mesh) {
		this._rootObj.add(mesh);
		// setTimeout(() => this._rootObj.remove(mesh), 20000);
	},
	undo() {
		let ro = /** @type {THREE.Group} */(this._rootObj);
		let obj = /** @type {THREE.Mesh} */(ro.children.pop());
		obj && obj.geometry.dispose();
	}
});

AFRAME.registerComponent('paint3d-brush', {
	dependencies: ['cursor'],
	schema: {
		timeoutMs: { default: 10000 },
		color: { default: '#00ff00' },
		mode: { default: 'line' },
		lineWidth: { default: 1 },
		distance: { default: 0.05 },
	},
	init() {
		this.disable = false;
		this.upevent = 'triggerup';
		this.downevent = 'triggerdown';
		this.sourceEl = this.el;
		this.el.sceneEl.setAttribute('paint3d-canvas', {});
		this._canvasObj = this.el.sceneEl.components['paint3d-canvas'];

		if (this.el.components.cursor.data.rayOrigin == 'mouse') {
			this.upevent = 'mouseup';
			this.downevent = 'mousedown';
		}
		this._buttonDown = this._buttonDown.bind(this);
		this.el.addEventListener(this.downevent, this._buttonDown);
	},
	remove() {
		this.el.removeEventListener(this.downevent, this._buttonDown);
	},
	tick() {
		if (this._dragFun) {
			this._dragFun();
		} else {
			// disable tick.
			this.pause();
		}
	},
	_buttonDown(ev) {
		if (!this.el.components.raycaster || this.disable || ev.target != this.el) {
			return;
		}
		this.drawing = false;
		if (this.el.components.raycaster.intersections.length > 0) {
			return;
		}
		let ray = this.el.components.raycaster.raycaster.ray;


		let cancelEvelt = ev1 => ev1.target != ev.target && ev1.stopPropagation();
		let startFn = (o) => {
			if (!this.drawing) {
				this._canvasObj.add(o);
				this.drawing = true;
				window.addEventListener('mouseenter', cancelEvelt, true);
				window.addEventListener('mouseleave', cancelEvelt, true);
			}
		};

		let dragFun = this._begin(startFn);
		if (dragFun == null) {
			return;
		}

		dragFun();
		this._dragFun = dragFun;
		this.play();

		let mouseup = (ev) => {
			this.sourceEl.removeEventListener(this.upevent, mouseup);
			this._dragFun = null;
			// dragFun();
			if (this.drawing) {
				window.removeEventListener('mouseenter', cancelEvelt, true);
				window.removeEventListener('mouseleave', cancelEvelt, true);

				this.drawing = false;
				let cancelClick = ev => ev.stopPropagation();
				window.addEventListener('click', cancelClick, true);
				setTimeout(() => window.removeEventListener('click', cancelClick, true), 0);
			}
		};
		this.sourceEl.addEventListener(this.upevent, mouseup);
	},
	_begin(startFn) {
		let data = this.data;
		if (data.mode == 'line') {
			return this.data.lineWidth <= 4 ? this._beginLine(startFn) : this._beginLine2(startFn);;
		} else if (data.mode == 'points') {
			return this._beginPoints(startFn);;
		}
		return null;
	},
	_beginLine(start) {
		let maxVerts = this.data.timeoutMs / 10;
		let vertices = new Float32Array(maxVerts * 3);
		let verticesAttr = new THREE.BufferAttribute(vertices, 3);
		let geometry = new THREE.BufferGeometry();
		let count = 0;

		geometry.setAttribute('position', verticesAttr);

		let lastPos = null;
		let ray = this.el.components.raycaster.raycaster.ray;
		let dragFun = () => {
			let p = ray.direction.clone().multiplyScalar(this.data.distance).add(ray.origin);
			if (lastPos && lastPos.distanceTo(p) < this.data.distance / 25) {
				return;
			}
			lastPos = p;
			if (count < maxVerts) {
				vertices.set([p.x, p.y, p.z], count * 3);
				let offset = verticesAttr.updateRange.count > 0 ? verticesAttr.updateRange.offset : count * 3;
				count++;
				verticesAttr.needsUpdate = true;
				verticesAttr.updateRange.offset = offset;
				verticesAttr.updateRange.count = count * 3 - offset;
				geometry.setDrawRange(0, count);
				geometry.boundingBox = null;
				geometry.boundingSphere = null;
			}
			if (count >= 2 && !this.drawing) {
				// TODO: Reuse material.
				let material = new THREE.LineBasicMaterial({
					color: new THREE.Color(this.data.color),
					linewidth: this.data.lineWidth,
				});
				let line = new THREE.Line(geometry, material);
				start(line);
			}
		};
		return dragFun;
	},
	_beginLine2(start) {
		let maxVerts = this.data.timeoutMs / 10 * 2;
		let vertices = new Float32Array(maxVerts * 3);
		let verticesAttr = new THREE.BufferAttribute(vertices, 3);
		let indics = new Uint16Array(maxVerts * 3);
		let indicsAttr = new THREE.BufferAttribute(indics, 1);
		let geometry = new THREE.BufferGeometry();
		let count = 0;

		geometry.setAttribute('position', verticesAttr);
		geometry.setIndex(indicsAttr);

		let lastPos = null;
		let ray = this.el.components.raycaster.raycaster.ray;
		let dragFun = () => {
			let p = ray.direction.clone().multiplyScalar(this.data.distance).add(ray.origin);
			if (lastPos && lastPos.distanceTo(p) < this.data.distance / 25) {
				return;
			}
			let p2 = ray.direction.clone().multiplyScalar(this.data.lineWidth * 0.001).add(p);
			lastPos = p;
			if (count * 2 < maxVerts) {
				vertices.set([p.x, p.y, p.z], count * 6);
				vertices.set([p2.x, p2.y, p2.z], count * 6 + 3);
				if (count > 0) {
					indics.set([
						(count - 1) * 2, (count - 1) * 2 + 1, count * 2,
						count * 2 + 1, count * 2, (count - 1) * 2 + 1,
					], count * 6 - 6);
				}
				let offset = verticesAttr.updateRange.count > 0 ? verticesAttr.updateRange.offset : count * 6;
				count++;
				verticesAttr.needsUpdate = true;
				verticesAttr.updateRange.offset = offset;
				verticesAttr.updateRange.count = count * 6 - offset;
				indicsAttr.needsUpdate = true;
				geometry.setDrawRange(0, count * 6);
				geometry.boundingBox = null;
				geometry.boundingSphere = null;
			}
			if (count >= 2 && !this.drawing) {
				// TODO: Reuse material.
				let material = new THREE.MeshBasicMaterial({
					color: new THREE.Color(this.data.color),
					side: THREE.DoubleSide,
				});
				start(new THREE.Mesh(geometry, material));
			}
		};
		return dragFun;
	},
	_beginPoints(start) {
		let maxVerts = this.data.timeoutMs / 10;
		let vertices = new Float32Array(maxVerts * 3);
		let verticesAttr = new THREE.BufferAttribute(vertices, 3);
		let geometry = new THREE.BufferGeometry();
		let count = 0;

		geometry.setAttribute('position', verticesAttr);

		let lastPos = null;
		let ray = this.el.components.raycaster.raycaster.ray;
		let harf = new THREE.Vector3(0.5, 0.5, 0.5);
		let dragFun = () => {
			let p = ray.direction.clone().multiplyScalar(this.data.distance).add(ray.origin);
			if (lastPos && lastPos.distanceTo(p) < this.data.distance / 25) {
				// return;
			}
			lastPos = p;
			if (count < maxVerts) {
				let p0 = new THREE.Vector3().random().sub(harf).multiplyScalar(this.data.lineWidth * 0.005).add(p);
				vertices.set([p0.x, p0.y, p0.z], count * 3);
				let offset = verticesAttr.updateRange.count > 0 ? verticesAttr.updateRange.offset : count * 3;
				count++;
				verticesAttr.needsUpdate = true;
				verticesAttr.updateRange.offset = offset;
				verticesAttr.updateRange.count = count * 3 - offset;
				geometry.setDrawRange(0, count);
				geometry.boundingBox = null;
				geometry.boundingSphere = null;
			}
			if (count >= 10 && !this.drawing) {
				// TODO: Reuse material.
				let material = new THREE.PointsMaterial({
					color: new THREE.Color(this.data.color),
					size: this.data.lineWidth * 0.001,
				});
				start(new THREE.Points(geometry, material));
			}
		};
		return dragFun;
	},
});
