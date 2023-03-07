'use strict';

/// <reference path="../node_modules/@types/aframe/index.d.ts" />
/// <reference path="types.d.ts" />
/** 
 * @typedef {{name: string; type: string; url: string; fetch:((pos?:number)=>Promise<Response>)?; size: number?}} ContentInfo
 * @typedef {{id:string; name:string; type:string; url:string; hidden:boolean; wid:string?;contentTypes:string[]}} AppInfo
 */
class AppManager {
	constructor() {
		/** @type {AppInfo[]} */
		this.apps = [];
		/** @type {((c:ContentInfo, options: object) => boolean)[]} */
		this.contentHandlers = [this.defailtContentHandler.bind(this)];
		/** @type {Set<string>} */
		this.loadedModules = new Set();
	}

	/**
	 * @param {string} selector
	 */
	loadAppList(selector) {
		// TODO: support manifest file.
		/** @type {AppInfo[]} */
		let apps = [];
		for (let el of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll(selector))) {
			if (el.id) {
				let type = el.dataset.apptype || 'app';
				let contentTypes = el.dataset.contentType?.split(',') ?? [];
				let hidden = el.classList.contains('hidden');
				let app = { id: el.id, name: el.innerText.trim(), type: type, url: el.href, hidden: hidden, wid: el.dataset.wid, contentTypes: contentTypes };
				apps.push(app);
			}
		}
		this.apps = apps.concat(this._loadFromLocalStorage());

		for (let script of document.querySelectorAll('head>script')) {
			// @ts-ignore
			if (script.src) {
				// @ts-ignore
				this.loadedModules.add(script.src);
			}
			if (script.id) {
				this.loadedModules.add(script.id);
			}
		}
	}

	/**
	 * @returns {AppInfo[]}
	 */
	_loadFromLocalStorage() {
		try {
			let s = localStorage.getItem('vrApps');
			if (s !== null) {
				return JSON.parse(s);
			}
		} catch (e) {
			console.log('error', e);
		}
		return [];
	}

	/**
	 * @param {string} id 
	 * @param {Element} sceneEl
	 */
	async launch(id, sceneEl = null, options = {}) {
		let app = this.getAppById(id);
		if (app == null) {
			console.log('app not found:' + id);
			return null;
		}
		if (app.wid && document.getElementById(app.wid)) {
			console.log('already exists:' + app.wid);
			return null;
		}
		let el = await this._instantiate(app.url, app.type, sceneEl, app.type == 'env' ? 'env' : app.wid);
		el.setAttribute('vrapp', '');
		if (!options.disableWindowLocator && el && el.tagName == 'A-XYWINDOW' && !el.hasAttribute('window-locator')) {
			el.setAttribute('window-locator', '');
		}
		if (el.hasLoaded) {
			el.emit('app-launch', { appManager: this, app: app, args: options.appArgs, content: options.content }, false);
		} else {
			el.addEventListener('loaded', (ev) => {
				el.emit('app-launch', { appManager: this, app: app, args: options.appArgs, content: options.content }, false);
			}, { once: true });
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
		if (save) {
			let apps = this._loadFromLocalStorage();
			apps.push(app);
			localStorage.setItem('vrApps', JSON.stringify(apps));
		}
		return true;
	}

	/**
	 * @param {ContentInfo} content
	 * @param {object} options
	 */
	openContent(content, options = {}) {
		return this.contentHandlers.some(handler => handler(content, options));
	}

	/**
	 * @param {string} contentType
	 * @param {object} options
	 * @returns {Promise<object>}
	 */
	async newContent(contentType, options = {}) {
		// @ts-ignore
		let storageList = globalThis.storageList;
		// TODO: File select dialog.
		let accessor = Object.values(storageList.accessors).find(a => a.writable && a.writeFile);
		if (!accessor) {
			return Promise.reject('no writable storage');
		}
		let name = (options.defaultName || 'untitled') + '.' + options.extension;
		return Promise.resolve({
			type: contentType,
			name: name,
			update(blob) {
				return accessor.writeFile(name, blob);
			}
		});
	}

	/**
	 * @param {ContentInfo} content
	 * @param {object} options
	 */
	defailtContentHandler(content, options) {
		let contentType = content.type.split(';')[0];
		let app =
			this.apps.find(app => app.contentTypes && app.contentTypes.includes(contentType)) ||
			this.apps.find(app => app.contentTypes && app.contentTypes.some(t =>
				t.includes('*') && new RegExp(t.replace('*', '[^/]+')).test(contentType) // TODO: glob
			));
		if (app) {
			this.launch(app.id, null, Object.assign({ content: content }, options));
			return true;
		}
		return false;
	}

	/**
	 * @param {string} url
	 * @param {string} apptype
	 * @param {*} [parent]
	 * @param {string} [instanceId]
	 * @returns {Promise<AFRAME.AEntity>}
	 */
	async _instantiate(url, apptype, parent, instanceId) {
		let [srcUrl, id] = url.split('#');
		let base = new URL(location.href);
		let srcSceneEl = null;
		let template;
		/** @type {HTMLScriptElement[]} */
		let deferredScripts = [];

		if (srcUrl == '') {
			template = document.getElementById(id);
		} else {
			let assets = document.querySelector('a-assets');
			// @ts-ignore
			let response = await new Promise((resolve, reject) => assets.fileLoader.load(srcUrl, resolve, null, reject));
			let doc = new DOMParser().parseFromString(response.replace(/\$\{baseUrl\}/g, srcUrl.replace(/\/[^/]+$/, '/')), 'text/html');
			let baseEl = doc.createElement('base');
			baseEl.setAttribute('href', srcUrl);
			doc.head.append(baseEl);
			base = new URL(srcUrl);

			for (let script of /** @type {NodeListOf<HTMLScriptElement>} */(doc.querySelectorAll('head>script'))) {
				await this._procScriptEl(script, srcUrl);
			}
			deferredScripts = Array.from(/** @type {NodeListOf<HTMLScriptElement>} */(doc.querySelectorAll('body>script')))

			for (let img of /** @type {NodeListOf<HTMLImageElement>} */(doc.querySelectorAll('a-assets>img'))) {
				if (img.id && !document.getElementById(img.id)) {
					img.src = img.src; // apply base url.
					assets.appendChild(document.importNode(img, false));
				}
			}
			for (let el of doc.querySelectorAll('[gltf-model]')) {
				let attr = el.getAttribute('gltf-model');
				let m = attr.match(/url\(([^\)]+)\)/);
				if (m) {
					el.setAttribute('gltf-model', attr.replace(m[1], new URL(m[1], base)));
				}
			}
			id = id || apptype;
			template = doc.getElementById(id);
			srcSceneEl = doc.querySelector('a-scene');
		}

		if (apptype == 'env') {
			if (srcSceneEl) {
				let sceneEl = parent ? parent.sceneEl : document.querySelector('a-scene');
				for (let attr of ['fog', 'background']) {
					if (srcSceneEl.hasAttribute(attr)) {
						sceneEl.setAttribute(attr, srcSceneEl.getAttribute(attr));
					}
				}
			}
			let old = document.getElementById(instanceId);
			old && old.parentNode.removeChild(old);
		}

		// TODO: document.importNode()
		let wrapper = document.createElement('div');
		wrapper.innerHTML = ['SCRIPT', 'TEMPLATE'].includes(template.tagName) ? template.innerHTML : template.outerHTML;
		let appEl = /** @type {AFRAME.AEntity} */ (wrapper.firstElementChild);
		appEl.id = instanceId || '';
		(parent || document.querySelector('a-scene')).appendChild(appEl);

		for (let script of deferredScripts) {
			await this._procScriptEl(script, srcUrl);
		}

		return appEl;
	}

	/**
	 * 
	 * @param {HTMLScriptElement} script 
	 * @param {string} srcUrl 
	 */
	async _procScriptEl(script, srcUrl) {
		for (let [name, id] of [['aframe-master.min.js', 'script-aframe'], ['xylayout-all.min.js', 'script-xylayout']]) {
			if (!script.id && script.src.includes(name)) {
				console.warn(srcUrl, "id:" + id);
				script.id = id;
			}
		}
		let dedup = (s) => {
			if (!s) { return true; }
			if (this.loadedModules.has(s)) { return false; }
			this.loadedModules.add(s);
			return true;
		}
		if (script.type == 'importmap') { return; }
		if (!dedup(script.id) || !dedup(script.src) || (script.id && document.getElementById(script.id))) { return; }
		await new Promise((resolve, reject) => {
			/** @type {HTMLScriptElement} */
			// @ts-ignore
			let el = document.createElement('script'); // TODO: document.importNode(script, true);
			for (let attr of script.attributes) {
				attr.nodeName != 'src' && el.setAttribute(attr.nodeName, attr.nodeValue);
			}
			el.innerHTML = script.innerHTML;
			if (script.src) {
				el.onload = resolve;
				el.onerror = reject;
				el.src = script.src;
				document.querySelector('head').append(el);
			} else {
				document.querySelector('head').append(el);
				resolve();
			}
		});
	}

	/**
	 * @param {Element} sceneEl
	 * @returns {NodeListOf<Element>}
	 */
	getRunningApps(sceneEl = null) {
		return (sceneEl || document).querySelectorAll('[vrapp]');
	}

	/**
	 * @param {Element} sceneEl
	 */
	killAll(sceneEl = null) {
		for (let appEl of this.getRunningApps(sceneEl)) {
			appEl.parentNode.removeChild(appEl);
		}
	}
}

globalThis.appManager = new AppManager();

AFRAME.registerComponent('vrapp', {
	init() {
		/** @type {AppManager} */
		this.appManager = null;
		this.app = null;
		this.el.addEventListener('app-launch', (ev) => {
			this.appManager = ev.detail.appManager;
			this.app = ev.detail.app;
		}, { once: true });
	}
});

AFRAME.registerComponent('apps-panel', {
	schema: {},
	init() {
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
		listEl.addEventListener('clickitem', async (ev) => {
			this.el.parentNode.removeChild(this.el);
			appManager.launch(apps[ev.detail.index].id);
		});
		list.setContents(apps);
	},
	/**
	 * @param {string} name 
	 */
	_elByName(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
});

AFRAME.registerComponent('main-menu', {
	schema: {},
	init() {
		this._elByName('exitVRButton').addEventListener('click', (ev) => {
			this.el.sceneEl.exitVR();
		});
	},
	_elByName(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
});

AFRAME.registerComponent('launch-on-click', {
	schema: {
		appid: { type: 'string', default: '' },
	},
	init() {
		this.el.addEventListener('click', async (ev) => {
			await appManager.launch(this.data.appid);
		});
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
		let cursorEl = Array.from(this.el.sceneEl.querySelectorAll('[cursor]')).find(el => el.getAttribute('cursor').rayOrigin == 'mouse');
		let canvasEl = this.el.sceneEl.canvas;
		let dragX = 0, dragY = 0;
		let lookAt = new THREE.Vector3(0, 0, 0);
		let rotation = new THREE.Euler(0, 0, 0, 'YXZ');
		let distance = lookAt.clone().sub(this.el.getAttribute('position')).length();
		let updateCamera = () => {
			if (this.el.sceneEl.is('vr-mode') || this.el.sceneEl.is('ar-mode')) {
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
		let renderer = this.el.sceneEl.renderer;
		if (renderer.xr.getReferenceSpace()) {
			renderer.xr.getReferenceSpace()?.addEventListener('reset', ev => this.resetPosition());
		} else {
			renderer.xr.addEventListener('sessionstart', () => renderer.xr.getReferenceSpace()?.addEventListener('reset', ev => this.resetPosition()));
		}
	},
	resetPosition() {
		let sky = this.el.sceneEl.querySelector('a-sky');
		if (sky) {
			sky.object3D.visible = !this.el.sceneEl.is('ar-mode');
		}
		if (this.el.sceneEl.is('vr-mode') || this.el.sceneEl.is('ar-mode')) {
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
			el.sceneEl.querySelectorAll("[xy-drag-control]").forEach(el => {
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
		el.querySelectorAll('[laser-controls]').forEach(el => el.addEventListener('thumbstickmoved', (ev) => {
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
		let windowEls = Array.from(el.sceneEl.querySelectorAll('a-xywindow'));

		let pos = el.object3D.position;
		if (!oldData.applyCameraPos && this.data.applyCameraPos) {
			let cameraRigEl = document.querySelector('#camera-rig');
			let base = new THREE.Vector3();
			cameraRigEl && cameraRigEl.object3D.getWorldPosition(base);
			if (el.sceneEl.is('vr-mode') || el.sceneEl.is('ar-mode')) {
				pos.set(0, 0, pos.z).applyMatrix4(el.sceneEl.camera.matrixWorld);
			} else {
				let camPos = new THREE.Vector3();
				let camRot = new THREE.Quaternion();
				el.sceneEl.camera.matrixWorld.decompose(camPos, camRot, new THREE.Vector3());
				let y = base.y + pos.y;
				pos.applyQuaternion(camRot);
				pos.add(camPos);
				pos.y = y;
			}
			let rect = el.components.xyrect || { width: 1, height: 1 };
			pos.y = Math.max(pos.y, base.y + rect.height * el.object3D.scale.y / 2);
		}

		let dd = this.data.interval;
		let d = el.object3D.getWorldDirection(new THREE.Vector3()).multiplyScalar(dd);
		for (let i = 0; i < 16; i++) {
			if (windowEls.every(windowEl => windowEl == el || windowEl.object3D.position.distanceToSquared(pos) > dd * dd)) {
				break;
			}
			pos.add(d);
		}

		if ((el.sceneEl.is('vr-mode') || el.sceneEl.is('ar-mode')) && this.data.updateRotation) {
			this.updateRotation();
		}
	},
	updateRotation() {
		let camPos = new THREE.Vector3();
		let camRot = new THREE.Quaternion();
		this.el.sceneEl.camera.matrixWorld.decompose(camPos, camRot, new THREE.Vector3());
		let targetPosition = this.el.object3D.getWorldPosition(new THREE.Vector3());
		let tr = new THREE.Matrix4().lookAt(camPos, targetPosition, new THREE.Vector3(0, 1, 0));
		this.el.object3D.setRotationFromMatrix(tr);
	}
});


window.addEventListener('DOMContentLoaded', async (ev) => {
	appManager.loadAppList('#applications>a');

	appManager.launch('main-menu', null, { disableWindowLocator: true });

	let sceneEl = document.querySelector('a-scene');
	if (window.isSecureContext && sceneEl.components['device-orientation-permission-ui']) {
		sceneEl.components['device-orientation-permission-ui'].showHTTPAlert = () => { };
	}

	// gesture
	sceneEl.addEventListener('gesture', async (ev) => {
		console.log(ev.detail.name);
		if (ev.detail.name == 'L' || ev.detail.name == 'CLICK') {
			let menu = sceneEl.querySelector('#mainMenu');
			if (!menu) {
				menu = await appManager.launch('main-menu', null, { disableWindowLocator: true });
			}
			let distance = 1.5;
			let camera = sceneEl.camera;
			let targetObj = menu.object3D;
			let tr = new THREE.Matrix4().copy(targetObj.parent.matrixWorld).invert().multiply(camera.matrixWorld);
			let pos = ev.detail.center.clone().normalize().multiplyScalar(distance).applyMatrix4(tr);

			menu.setAttribute('position', pos);
			if (sceneEl.is('vr-mode') || sceneEl.is('ar-mode')) {
				let cameraPosition = new THREE.Vector3();
				let cameraQuaternion = new THREE.Quaternion();
				let tmp = new THREE.Vector3();

				camera.matrixWorld.decompose(cameraPosition, cameraQuaternion, tmp);
				tr.lookAt(cameraPosition, pos, tmp.set(0, 1, 0));
				targetObj.setRotationFromMatrix(tr);
			}
		}
		if (document.activeElement && document.activeElement != document.body) {
			document.activeElement.dispatchEvent(new CustomEvent('gesture', { bubbles: false, detail: ev.detail }));
		}
	});

	if (location.hash) {
		let fragment = location.hash.slice(1);
		let m = fragment.match(/app:([\w\-]+):?(.+)?/);
		if (m) {
			window.appManager.launch(m[1], null, { appArgs: decodeURI(m[2]) });
		}

		// Deprecated
		m = fragment.match(/list:(.+)/);
		if (m) {
			let mediaList = await window.appManager.launch('app-media-selector');
			mediaList.setAttribute('media-selector', { path: 'MEDIA/' + m[1], sortField: 'updated', sortOrder: 'd' });
			let play = fragment.match(/play:(\d+)/);
			if (play) {
				mediaList.components['media-selector'].mediaSelector.movePos(play[1]);
			}
		}
	}
}, { once: true });
