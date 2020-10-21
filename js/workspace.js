// @ts-check
"use strict";

/// <reference path="../node_modules/@types/aframe/index.d.ts" />
/** 
 * @typedef {{id:string; name:string; type:string; url:string; hidden:boolean; wid:string|null;}} AppInfo
 * @typedef {{name: string; type: string; url: string; fetch:((pos?:number)=>Promise<Response>)?;}} ContentInfo
 */
class AppManager {
	constructor() {
		/** @type {AppInfo[]} */
		this.apps = [];
		/** @type {((c:ContentInfo) => boolean)[]} */
		this.contentHandlers = [];
	}

	/**
	 * @param {string} selector
	 */
	loadApps(selector) {
		/** @type {AppInfo[]} */
		let apps = [];
		for (let el of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll(selector))) {
			if (el.id) {
				let type = el.dataset.apptype || 'app';
				let hidden = el.classList.contains('hidden');
				let app = { id: el.id, name: el.innerText.trim(), type: type, url: el.href, hidden: hidden, wid: el.dataset.wid };
				apps.push(app);
			}
		}
		try {
			let s = localStorage.getItem('vrApps');
			if (s !== null) {
				apps = apps.concat(JSON.parse(s));
			}
		} catch (e) {
			console.log('error', e);
		}
		this.apps = apps;
	}

	/**
	 * @param {string} id 
	 */
	async launch(id) {
		let app = this.getAppById(id);
		if (app == null) {
			console.log('app not found:' + id);
			return null;
		}
		if (app.wid && document.getElementById(app.wid)) {
			console.log('already exists:' + app.wid);
			return null;
		}
		let el = await instantiate(app.id);
		if (app.wid) {
			el.id = app.wid;
		}
		if (el && el.tagName == 'A-XYWINDOW' && !el.hasAttribute('window-locator')) {
			el.setAttribute('window-locator', '');
		}
		return el;
	}

	/**
	 * @param {string} id 
	 * @returns {AppInfo}
	 */
	getAppById(id) {
		return this.apps.find(app => app.id == id);
	}

	/**
	 * @param {AppInfo} app
	 * @param {boolean} save
	 */
	install(app, save) {
		if (this.getAppById(app.id) != null) {
			return false;
		}
		this.apps.push(app);
		return true;
	}

	/**
	 * @param {ContentInfo} contentInfo
	 */
	openContent(contentInfo) {
		for (let handler of this.contentHandlers) {
			if (handler(contentInfo)) {
				return true;
			}
		}
		return false;
	}
}

globalThis.appManager = new AppManager();

AFRAME.registerComponent('main-menu', {
	schema: {},
	init: function () {
		this._elByName('exitVRButton').addEventListener('click', (ev) => {
			this.el.sceneEl.exitVR();
		});
	},
	_elByName(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
});

AFRAME.registerComponent('apps-panel', {
	schema: {},
	init: function () {
		this._elByName('close-button').addEventListener('click', (ev) => {
			this.el.parentNode.removeChild(this.el);
		});
		let windowWidth = this.el.getAttribute('width');
		let cols = Math.floor(windowWidth / 1.2);
		let itemWidth = windowWidth / cols;
		let itemHeight = itemWidth;
		let listEl = this._elByName('apps-panel-list');
		let list = listEl.components.xylist;
		list.setLayout({
			size(itemCount) {
				return { width: itemWidth * cols, height: itemHeight * Math.ceil(itemCount / cols) };
			},
			*targets(viewport) {
				let position = Math.floor((-viewport[0]) / itemHeight) * cols;
				let end = Math.ceil((-viewport[1]) / itemHeight) * cols;
				while (position < end) {
					yield position++;
				}
			},
			layout(el, position) {
				let x = (position % cols) * itemWidth, y = - Math.floor(position / cols) * itemHeight;
				let xyrect = el.components.xyrect;
				let pivot = xyrect ? xyrect.data.pivot : { x: 0.5, y: 0.5 };
				el.setAttribute("position", { x: x + pivot.x * xyrect.width, y: y - pivot.y * xyrect.height, z: 0 });
			}
		});
		let apps = appManager.apps.filter(app => !app.hidden);
		list.setAdapter({
			selector: this,
			create(parent) {
				var el = document.createElement('a-xybutton');
				el.setAttribute("width", itemWidth);
				el.setAttribute("height", itemHeight);
				return el;
			}, bind(position, el, data) {
				el.setAttribute('label', apps[position].name);
			}
		});
		listEl.addEventListener('clickitem', async (/** @type {CustomEvent} */ ev) => {
			this.el.parentNode.removeChild(this.el);
			appManager.launch(apps[ev.detail.index].id);
		});
		list.setContents(apps);
	},
	/**
	 * @param {string} name 
	 */
	_elByName(name) {
		return /** @type {import("aframe").Entity} */ (this.el.querySelector("[name=" + name + "]"));
	}
});

AFRAME.registerComponent('search-box', {
	init() {
		let searchButton = this.el.querySelector('a-xybutton');
		let searchKeyword = /** @type {HTMLInputElement} */ (this.el.querySelector('a-xyinput'));
		searchButton.addEventListener('click', (ev) => {
			this._search(searchKeyword.value);
		});

		searchKeyword.addEventListener('keydown', ( /** @type {KeyboardEvent} */ ev) => {
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
	_intervalId: 0,
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
	log: [],
	orgLog: null,
	init() {
		this.orgLog = console.log;
		console.log = this._addLog.bind(this);

		this._onerror = this._onerror.bind(this);
		window.addEventListener('error', this._onerror);
		window.addEventListener('unhandledrejection', this._onerror);
	},
	_addLog(...msg) {
		this.orgLog(...msg);
		let header = '';
		if (this.data.timestamp) {
			let now = new Date();
			header = "[" + now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds() + "]: ";
		}
		this.log.push(header + msg.map(m => String(m)).join(' '));
		if (this.log.length > this.data.lines) this.log.shift();
		let logEl = this.el.querySelector('[name=debug-text]');
		logEl.setAttribute('value', this.log.join("\n"));
	},
	_onerror(ev) {
		this._addLog("ERROR: " + ev.reason ? (ev.reason.message + ' ' + ev.reason.stack) : (ev.message + ev.filename + ':' + ev.line));
	},
	remove() {
		window.removeEventListener('error', this._onerror);
		window.removeEventListener('unhandledrejection', this._onerror);
		console.log = this.orgLog;
	}
});

AFRAME.registerComponent('camera-control', {
	schema: {
		homePosition: { type: 'vec3', default: { x: 0, y: 0, z: 1 } },
		vrHomePosition: { type: 'vec3', default: { x: 0, y: 0, z: 0 } }
	},
	dragging: false,
	init() {
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
	init() {
		let data = this.data;
		let el = this.el;
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
		let changed = [];
		el.addEventListener('gripdown', ev => {
			document.querySelectorAll("[xy-drag-control]").forEach(el => {
				el.components['xy-drag-control'].postProcess = (targetObj, /** @type {CustomEvent} */ ev) => {
					let { origin, direction } = ev.detail.raycaster.ray;
					let direction0 = ev.detail.prevRay.direction;
					let targetPosition = targetObj.getWorldPosition(new THREE.Vector3());
					let d = direction.clone().sub(direction0);
					let f = targetPosition.distanceTo(origin) * 2;
					targetObj.position.add(direction.clone().multiplyScalar(-d.y * f));
				};
				changed.push([el, Object.assign({}, el.getAttribute('xy-drag-control'))]);
			});
		});
		el.addEventListener('gripup', ev => {
			changed.forEach(([el, dragControl]) => {
				if (el.components['xy-drag-control']) {
					el.components['xy-drag-control'].postProcess = null;
				}
			});
			changed = [];
		});
		el.querySelectorAll('[laser-controls]').forEach(el => el.addEventListener('thumbstickmoved', (/** @type {CustomEvent} */ ev) => {
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

AFRAME.registerComponent('launch-on-click', {
	schema: {
		appid: { type: 'string', default: '' },
		align: { type: 'string', default: '' }
	},
	init() {
		this.el.addEventListener('click', async (/** @type {CustomEvent} */ ev) => {
			let el = await appManager.launch(this.data.appid);
			if (!el) {
				return;
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
		interval: { default: 0.1 }
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
/**
 * 
 * @param {string} id 
 * @param {*} [parent]
 */
async function instantiate(id, parent) {
	let template = document.getElementById(id);
	let apptype = template.dataset.apptype;
	let base = new URL(location.href);
	let modules = [];
	if (template instanceof HTMLAnchorElement) {
		let url = template.href;
		let assets = document.querySelector('a-assets');
		let response = await new Promise((resolve, reject) => assets.fileLoader.load(url.replace(/#.*$/, ''), resolve, null, reject));
		let doc = new DOMParser().parseFromString(response, 'text/html');
		let baseEl = doc.createElement('base');
		baseEl.setAttribute('href', url);
		doc.head.append(baseEl);
		base = new URL(url);

		for (let img of /** @type {NodeListOf<HTMLImageElement>} */(doc.querySelectorAll('a-assets>img'))) {
			if (img.id && !document.getElementById(img.id)) {
				img.src = img.src; // apply base url.
				assets.appendChild(document.importNode(img, false));
			}
		}
		for (let script of /** @type {NodeListOf<HTMLScriptElement>} */(doc.querySelectorAll('script.required'))) {
			modules.push(script.src);
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
			modules.push((new URL(mod, base)).toString());
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
	return /** @type {import("aframe").Entity} */ (first);
}

window.addEventListener('DOMContentLoaded', async (ev) => {
	appManager.loadApps('#applications>a');
	appManager.contentHandlers.push((item) => {
		let ext = '';
		let m = item.name.match(/\.(\w+)$/);
		if (m) {
			ext = m[1].toLowerCase();
		}
		if (['vrm', 'glb'].includes(ext)) {
			(async () => {
				let el = await appManager.launch('app-vrm');
				if (item.url == null && item.fetch) {
					item.url = URL.createObjectURL(await (await item.fetch()).blob());
				}
				el.setAttribute('vrm', { src: item.url });
			})();
			return true;
		}
		if (['bvh'].includes(ext)) {
			let activeModel = document.activeElement && document.activeElement.hasAttribute('vrm') && document.activeElement;
			if (activeModel) {
				activeModel.setAttribute('vrm-bvh', { src: item.url });
				return true;
			}
		}
		return false;
	});

	(await instantiate('mainMenuTemplate')).id = 'mainMenu';

	// gesture
	document.body.addEventListener('gesture', async (/** @type {CustomEvent} */ ev) => {
		console.log(ev.detail.name);
		if (ev.detail.name == 'L') {
			let menu = /** @type {import("aframe").Entity} */(document.getElementById('mainMenu'));
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
			let mediaList = await window.appManager.launch('app-media-selector');
			mediaList.setAttribute('media-selector', { path: m[1], storage: 'MEDIA' });
			let play = fragment.match(/play:(\d+)/);
			if (play) {
				mediaList.components['media-selector'].mediaSelector.movePos(play[1]);
			}
		}
	}
}, { once: true });
