"use strict";

AFRAME.registerComponent('main-menu', {
	schema: {},
	init: function () {
		this._elByName('exitVRButton').addEventListener('click', (ev) => {
			this.el.sceneEl.exitVR();
		});
		let apps = [];
		let appIds = [];
		for (let el of document.querySelectorAll('#applications>a')) {
			if (el.id && el.innerText) {
				apps.push(el.innerText);
				appIds.push(el.id);
			}
		}
		let appsButton = this._elByName('appsButton');
		appsButton.setAttribute('values', apps.join(','));
		appsButton.addEventListener('change', async (ev) => {
			let id = appIds[ev.detail.index];
			let wid = document.getElementById(id).dataset.wid;
			if (wid && document.getElementById(wid)) {
				console.log('already exists:' + wid);
				return;
			}
			let el = await instantiate(id);
			if (wid) {
				el.id = wid;
			}
		});
	},
	_elByName(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
});

AFRAME.registerComponent('search-box', {
	init() {
		let searchButton = this.el.querySelector('a-xybutton');
		let searchKeyword = this.el.querySelector('a-xyinput');
		searchButton.addEventListener('click', (ev) => {
			this._search(searchKeyword.value);
		});

		searchKeyword.addEventListener('keydown', (ev) => {
			if (ev.code == 'Enter' && searchKeyword.value != '') {
				this._search(searchKeyword.value);
			}
		});
	},
	_search(q) {
		this.el.sceneEl.exitVR();
		window.open("https://www.google.com/search?q=" + q);
	}
});

AFRAME.registerComponent('simple-clock', {
	schema: {},
	init() {
		this._intervalId = setInterval(() => this.el.setAttribute('value', this._formatTime(new Date())), 1000);
		this.el.setAttribute('value', this._formatTime(new Date()));
	},
	remove() {
		clearInterval(this._intervalId);
	},
	_formatTime(t) {
		let d2 = n => ("0" + n).substr(-2);
		return [t.getFullYear(), d2(t.getMonth() + 1), d2(t.getDate())].join("-") + " " +
			[d2(t.getHours()), d2(t.getMinutes()), d2(t.getSeconds())].join(":");
	}
});

AFRAME.registerComponent('debug-log', {
	schema: {
		timestamp: { default: true },
		lines: { default: 12 }
	},
	init: function () {
		this.log = [];
		this.logEl = this.el.querySelector('[name=debug-text]');
		this.addlog = (msg) => {
			this.orgLog(msg);
			let header = '';
			if (this.data.timestamp) {
				let now = new Date();
				header = "[" + now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds() + "]: ";
			}
			this.log.push(header + msg);
			if (this.log.length > this.data.lines) this.log.shift();
			this.logEl.setAttribute('value', this.log.join("\n"));
		};

		this.orgLog = console.log;
		console.log = this.addlog;

		this.onerror = (ev) => { this.addlog("ERROR: " + ev.reason ? (ev.reason.message + ' ' + ev.reason.stack) : (ev.message + ev.filename + ':' + ev.line)); }
		window.addEventListener('error', this.onerror);
		window.addEventListener('unhandledrejection', this.onerror);
	},
	remove: function () {
		window.removeEventListener('error', this.onerror);
		window.removeEventListener('unhandledrejection', this.onerror);
		console.log = this.orgLog;
	}
});

AFRAME.registerComponent('camera-control', {
	schema: {
		homePosition: { type: 'vec3', default: { x: 0, y: 0, z: 1 } },
		vrHomePosition: { type: 'vec3', default: { x: 0, y: 0, z: 0 } }
	},
	init() {
		this.dragging = false;
		this.el.sceneEl.addEventListener('exit-vr', ev => this.resetPosition());
		this.el.sceneEl.addEventListener('enter-vr', ev => this.resetPosition());
		this.resetPosition();
		let cursorEl = Array.from(document.querySelectorAll('[cursor]')).find(el => el.getAttribute('cursor').rayOrigin == 'mouse');
		let canvasEl = this.el.sceneEl.canvas;
		let dragX = 0, dragY = 0;
		let lookAt = new THREE.Vector3(0, 0, 0);
		let rotation = new THREE.Euler(0, 0, 0, 'YXZ');
		let distance = lookAt.clone().sub(this.el.getAttribute('position')).length();
		let updateCamera = () => {
			if (this.el.sceneEl.is('vr-mode')) {
				return;
			}
			let cameraObj = this.el.object3D;
			let cameraRot = new THREE.Quaternion().setFromEuler(rotation);
			let cameraVec = new THREE.Vector3(0, 0, 1).applyQuaternion(cameraRot).multiplyScalar(distance);
			let cameraPos = lookAt.clone().add(cameraVec);
			cameraObj.position.copy(cameraObj.parent.worldToLocal(cameraPos));
			cameraObj.quaternion.copy(cameraRot.multiply(cameraObj.parent.getWorldQuaternion(new THREE.Quaternion())));
		};
		this.onMouseMove = (ev) => {
			let targetObj = this.el.object3D;

			let speedFactor = 0.005;
			if (ev.buttons & 6) {
				let v = new THREE.Vector3(dragX - ev.offsetX, -(dragY - ev.offsetY), 0).applyQuaternion(targetObj.quaternion);
				lookAt.add(v.multiplyScalar(speedFactor));
			} else {
				rotation.x += (dragY - ev.offsetY) * speedFactor;
				rotation.y += (dragX - ev.offsetX) * speedFactor;
			}
			updateCamera();
			dragX = ev.offsetX;
			dragY = ev.offsetY;
		};
		canvasEl.addEventListener('mousedown', (ev) => {
			if (!this.dragging && cursorEl && cursorEl.components.cursor.intersectedEl == null) {
				this.dragging = true;
				dragX = ev.offsetX;
				dragY = ev.offsetY;
				canvasEl.addEventListener('mousemove', this.onMouseMove);
			}
		});
		canvasEl.addEventListener('mouseup', (ev) => {
			this.dragging = false;
			canvasEl.removeEventListener('mousemove', this.onMouseMove);
		});
		canvasEl.addEventListener('wheel', ev => {
			let speedFactor = 0.005;
			distance = Math.max(0.1, distance + ev.deltaY * speedFactor);
			updateCamera();
		});
	},
	resetPosition() {
		this.el.sceneEl.querySelector('a-sky').object3D.visible = !this.el.sceneEl.is('ar-mode');
		if (this.el.sceneEl.is('vr-mode')) {
			this.el.setAttribute('position', this.data.vrHomePosition);
		} else {
			this.el.setAttribute('position', this.data.homePosition);
		}
		this.el.setAttribute('rotation', { x: 0, y: 0, z: 0 });
	}
});

AFRAME.registerComponent('position-controls', {
	schema: {
		arrowkeys: { default: "rotation" },
		wasdkeys: { default: "translation" },
		axismove: { default: "translation" },
		speed: { default: 0.1 },
		rotationSpeed: { default: 0.1 }
	},
	init: function () {
		let data = this.data;
		if (data.arrowkeys || data.wasdkeys) {
			let fns = {
				rotation: [
					(o) => o.rotateY(-data.rotationSpeed),
					(o) => o.rotateY(data.rotationSpeed),
					(o) => o.rotateX(-data.rotationSpeed),
					(o) => o.rotateX(data.rotationSpeed),
					(o) => o.quaternion.set(0, 0, 0, 1)
				],
				translation: [
					(o) => o.translateX(-data.speed),
					(o) => o.translateX(data.speed),
					(o) => o.translateZ(data.speed),
					(o) => o.translateZ(-data.speed),
					(o) => o.position.set(0, 0, 0)
				]
			};
			let arrowKeyFns = fns[data.arrowkeys] || [];
			let wasdKeyFns = fns[data.wasdkeys] || [];
			document.addEventListener('keydown', ev => {
				if (document.activeElement != document.body) {
					return;
				}
				switch (ev.code) {
					case "ArrowRight":
						arrowKeyFns[0] && arrowKeyFns[0](this.el.object3D);
						break;
					case "ArrowLeft":
						arrowKeyFns[1] && arrowKeyFns[1](this.el.object3D);
						break;
					case "ArrowDown":
						arrowKeyFns[2] && arrowKeyFns[2](this.el.object3D);
						break;
					case "ArrowUp":
						arrowKeyFns[3] && arrowKeyFns[3](this.el.object3D);
						break;
					case "Space":
						arrowKeyFns[4] && arrowKeyFns[4](this.el.object3D);
						break;
					case "KeyA":
						wasdKeyFns[0] && wasdKeyFns[0](this.el.object3D);
						break;
					case "KeyD":
						wasdKeyFns[1] && wasdKeyFns[1](this.el.object3D);
						break;
					case "KeyS":
						wasdKeyFns[2] && wasdKeyFns[2](this.el.object3D);
						break;
					case "KeyW":
						wasdKeyFns[3] && wasdKeyFns[3](this.el.object3D);
						break;
				}
			});
		}
		this.changed = [];
		this.el.addEventListener('gripdown', ev => {
			document.querySelectorAll("[xy-drag-control]").forEach(el => {
				el.components['xy-drag-control'].postProcess = (targetObj, ev) => {
					let { origin, direction } = ev.detail.raycaster.ray;
					let direction0 = ev.detail.prevRay.direction;
					let targetPosition = targetObj.getWorldPosition(new THREE.Vector3());
					let d = direction.clone().sub(direction0);
					let f = targetPosition.distanceTo(origin) * 2;
					targetObj.position.add(direction.clone().multiplyScalar(-d.y * f));
				};
				this.changed.push([el, Object.assign({}, el.getAttribute('xy-drag-control'))]);
			});
		});
		this.el.addEventListener('gripup', ev => {
			this.changed.forEach(([el, dragControl]) => {
				if (el.components['xy-drag-control']) {
					el.components['xy-drag-control'].postProcess = null;
				}
			});
			this.changed = [];
		});
		this.el.querySelectorAll('[laser-controls]').forEach(el => el.addEventListener('thumbstickmoved', ev => {
			let direction = ev.target.components.raycaster.raycaster.ray.direction;
			if (this.data.axismove == "translation") {
				let rot = Math.atan2(direction.x, direction.z);
				let v = new THREE.Vector3(-ev.detail.x, 0, -ev.detail.y).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
				this.el.object3D.position.add(v.multiplyScalar(this.data.speed));
			} else if (this.data.axismove == "rotation") {
				this.el.object3D.rotateY(-(ev.detail.x) * this.data.rotationSpeed * 0.1);
			} else {
				let rot = Math.atan2(direction.x, direction.z);
				let v = new THREE.Vector3(0, 0, -ev.detail.y).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
				this.el.object3D.position.add(v.multiplyScalar(this.data.speed));
				this.el.object3D.rotateY(-ev.detail.x * this.data.rotationSpeed * 0.1);
			}
		}));
	}
});

AFRAME.registerComponent('instantiate-on-click', {
	schema: {
		template: { type: 'string', default: '' },
		id: { type: 'string', default: '' },
		align: { type: 'string', default: '' }
	},
	init() {
		this.el.addEventListener('click', async (ev) => {
			if (this.data.id && document.getElementById(this.data.id)) {
				return;
			}
			let el = await instantiate(this.data.template);
			if (this.data.id) {
				el.id = this.data.id;
			}
			if (this.data.align == 'raycaster') {
				if (!ev.detail.cursorEl || !ev.detail.cursorEl.components.raycaster) {
					return;
				}
				var raycaster = ev.detail.cursorEl.components.raycaster.raycaster;
				var rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), raycaster.ray.direction);
				var origin = raycaster.ray.origin;

				el.addEventListener('loaded', (ev) => {
					let pos = new THREE.Vector3().add(el.getAttribute('position')).applyQuaternion(rot);
					el.setAttribute('position', pos.add(origin));
					el.components['window-locator'] && el.components['window-locator'].updateRotation();
				}, { once: true });
			}
		});
	}
});

AFRAME.registerComponent('window-locator', {
	schema: {
		applyCameraPos: { default: true },
		updateRotation: { default: true },
		interval: { default: 0.25 }
	},
	init() {
		this.el.sceneEl.addEventListener('enter-vr', ev => {
			this.updateRotation();
		});
		this.el.sceneEl.addEventListener('exit-vr', ev => {
			let q = this.el.sceneEl.camera.getWorldQuaternion(new THREE.Quaternion());
			// let q180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
			this.el.object3D.setRotationFromQuaternion(q);
		});
	},
	update(oldData) {
		let el = this.el;
		let windows = el.sceneEl.systems.xywindow.windows;
		if (el.sceneEl.is('vr-mode') && this.data.updateRotation) {
			this.updateRotation();
		}

		let pos = new THREE.Vector3().copy(el.getAttribute('position'));
		if (!oldData.applyCameraPos && this.data.applyCameraPos) {
			let campos = el.sceneEl.camera.getWorldPosition(new THREE.Vector3());
			campos.y = 0;
			pos.add(campos);
		}

		let dd = this.data.interval;
		let d = el.object3D.getWorldDirection(new THREE.Vector3()).multiplyScalar(dd);
		for (let i = 0; i < 16; i++) {
			if (windows.every(window => window.el == el || window.el.object3D.position.distanceToSquared(pos) > dd * dd)) {
				break;
			}
			pos.add(d);
		}
		el.setAttribute('position', pos);
	},
	updateRotation() {
		let tr = new THREE.Matrix4();
		let cameraPosition = this.el.sceneEl.camera.getWorldPosition(new THREE.Vector3());
		let targetPosition = this.el.object3D.getWorldPosition(new THREE.Vector3());
		tr.lookAt(cameraPosition, targetPosition, new THREE.Vector3(0, 1, 0));
		let q = new THREE.Quaternion().setFromRotationMatrix(tr);
		this.el.object3D.setRotationFromQuaternion(q);
	}
});


// utils
async function instantiate(id, parent) {
	let template = document.getElementById(id);
	let apptype = template.dataset.apptype;
	let base = location.href;
	let modules = [];
	if (template.href) {
		let url = template.href;
		let assets = document.querySelector('a-assets');
		let response = await new Promise((resolve, reject) => assets.fileLoader.load(url.replace(/#.*$/, ''), resolve, null, reject));
		let doc = new DOMParser().parseFromString(response, 'text/html');
		let baseEl = doc.createElement('base');
		baseEl.setAttribute('href', url);
		doc.head.append(baseEl);
		base = new URL(url);

		for (let img of doc.querySelectorAll('a-assets>img')) {
			if (img.id && !document.getElementById(img.id)) {
				img.src = img.src; // apply base url.
				assets.appendChild(document.importNode(img));
			}
		}
		for (let script of doc.querySelectorAll('script.required')) {
			modules.push(new URL(script.src));
		}
		for (let el of doc.querySelectorAll('[gltf-model]')) {
			let attr = el.getAttribute('gltf-model');
			let m = attr.match(/url\(([^\)]+)\)/);
			if (m) {
				el.setAttribute('gltf-model', attr.replace(m[1], new URL(m[1], base)));
			}
		}
		template = doc.getElementById(base.hash.length > 1 ? base.hash.substr(1) : id);

		// TODO: remove this
		if (apptype == 'env') {
			let scene = doc.querySelector('a-scene');
			if (scene && scene.hasAttribute('fog')) {
				document.querySelector('a-scene').setAttribute('fog', scene.getAttribute('fog'));
			}
		}
	}
	// TODO: remove this
	if (apptype == 'env') {
		parent = document.querySelector('#env');
		while (parent.firstChild) {
			parent.removeChild(parent.lastChild);
		}
	}

	let imp = template.dataset.import;
	if (imp) {
		for (let mod of imp.split(';')) {
			modules.push(new URL(mod, base));
		}
	}
	for (let mod of modules) {
		await import(mod);
	}

	// TODO: document.importNode()
	let wrapper = document.createElement('div');
	wrapper.innerHTML = template.innerHTML;
	let first = wrapper.firstElementChild;
	for (let el of Array.from(wrapper.children)) {
		(parent || document.querySelector('a-scene')).appendChild(el);
	}
	return first;
}

/**
 * @param {{name: string; type: string; url: string;}} item 
 */
function openItem(item) {
	let ext = '';
	let m = item.name.match(/\.(\w+)$/);
	if (m) {
		ext = m[1].toLowerCase();
	}

	if (['vrm', 'glb'].includes(ext)) {
		(async () => {
			let el = await instantiate('app-vrm');
			el.setAttribute('vrm', { src: item.url });
		})();
		return true;
	}
	if (['bvh'].includes(ext)) {
		let activeModel = document.activeElement && document.activeElement.hasAttribute('vrm') && document.activeElement;
		if (activeModel) {
			el.setAttribute('vrm-bvh', { src: item.url });
			return true;
		}
	}
	return false;
}

window.addEventListener('DOMContentLoaded', async (ev) => {
	(await instantiate('mainMenuTemplate')).id = 'mainMenu';

	// gesture
	document.body.addEventListener('gesture', async (ev) => {
		console.log(ev.detail.name);
		if (ev.detail.name == 'L') {
			let menu = document.getElementById('mainMenu');
			if (!menu) {
				menu = await instantiate('mainMenuTemplate');
				menu.id = 'mainMenu';
			}
			let distance = 1.5;
			let camera = document.querySelector('a-scene').camera;
			let pos = camera.localToWorld(ev.detail.center.clone().normalize().multiplyScalar(distance));
			let rot = new THREE.Euler().setFromQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())).toVector3().multiplyScalar(180 / Math.PI);
			menu.setAttribute('position', pos);
			menu.setAttribute('rotation', rot);
			menu.setAttribute('scale', { x: 0.2, y: 0.2, z: 0.2 });
		}
		if (document.activeElement && document.activeElement != document.body) {
			document.activeElement.dispatchEvent(new CustomEvent('gesture', { bubbles: false, detail: ev.detail }));
		}
	});

	if (location.hash) {
		let fragment = location.hash.slice(1);
		let m = fragment.match(/list:(.+)/);
		if (m) {
			let mediaList = await instantiate('mediaListTemplate');
			mediaList.setAttribute('media-selector', "path:" + m[1]);
			let play = fragment.match(/play:(\d+)/);
			if (play) {
				mediaList.components['media-selector'].mediaSelector.movePos(play[1]);
			}
		}
	}
}, { once: true });
