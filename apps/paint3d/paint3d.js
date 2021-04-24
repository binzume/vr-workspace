"use strict";

AFRAME.registerComponent('paint3d', {
	schema: {},
	init() {
		let cursors = this.cursors = this.el.sceneEl.querySelectorAll('[cursor]');
		for (let el of cursors) {
			// el.setAttribute('paint3d-cursor', {});
		}
		for (let b of this.el.querySelectorAll('.paint3d-color')) {
			b.addEventListener('click', ev => {
				ev.detail.cursorEl.setAttribute('paint3d-cursor', { lineColor: b.getAttribute('color') });
			});
		}
		for (let b of this.el.querySelectorAll('.paint3d-size')) {
			b.addEventListener('click', ev => {
				ev.detail.cursorEl.setAttribute('paint3d-cursor', { lineWidth: b.getAttribute('label') });
			});
		}
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
		for (let el of this.el.sceneEl.querySelectorAll('[paint3d-cursor]')) {
			el.removeAttribute('paint3d-cursor');
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

AFRAME.registerComponent('paint3d-cursor', {
	dependencies: ['cursor'],
	schema: {
		timeoutMs: { default: 10000 },
		lineColor: { default: '#00ff00' },
		lineWidth: { default: 1 },
		lineDistance: { default: 0.05 },
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
		let dragging = false;
		let _this = this;
		let el = this.el;

		let maxVerts = this.data.timeoutMs / 10;
		let count = 0;
		let vertices = new Float32Array(maxVerts * 3);
		let verticesAttr = new THREE.BufferAttribute(vertices, 3);
		let geometry = new THREE.BufferGeometry();
		let points = [];

		geometry.setAttribute('position', verticesAttr);
		geometry.setDrawRange(0, count);
		let material = new THREE.LineBasicMaterial({
			color: new THREE.Color(this.data.lineColor),
			linewidth: this.data.lineWidth,
		});
		let line = new THREE.Line(geometry, material);
		this._canvasObj.add(line);

		let cancelEvelt = ev1 => ev1.target != ev.target && ev1.stopPropagation();
		let lastPos = null;
		let dragFun = this._dragFun = () => {
			let ray = this.el.components.raycaster.raycaster.ray;
			let p = ray.direction.clone().multiplyScalar(this.data.lineDistance).add(ray.origin);
			if (lastPos && lastPos.distanceTo(p) < this.data.lineDistance / 25) {
				return;
			}
			if (lastPos && !dragging) {
				dragging = true;
				window.addEventListener('mouseenter', cancelEvelt, true);
				window.addEventListener('mouseleave', cancelEvelt, true);
			}
			lastPos = p;
			if (count < maxVerts) {
				points.push(p);
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
		};
		dragFun();
		this.play();

		let mouseup = (ev) => {
			this.sourceEl.removeEventListener(this.upevent, mouseup);
			this._dragFun = null;
			if (dragging) {
				window.removeEventListener('mouseenter', cancelEvelt, true);
				window.removeEventListener('mouseleave', cancelEvelt, true);
			}
			// dragFun();
			let cameraMatInv = this.el.sceneEl.camera.matrixWorldInverse;
			points.forEach(p => p.applyMatrix4(cameraMatInv));

			if (points.length > 3) {
				let cancelClick = ev => ev.stopPropagation();
				window.addEventListener('click', cancelClick, true);
				setTimeout(() => window.removeEventListener('click', cancelClick, true), 0);
			} else {
				this._canvasObj.undo();
			}
		};
		this.sourceEl.addEventListener(this.upevent, mouseup);
	},
});
