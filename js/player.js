"use strict";

if (typeof AFRAME === 'undefined') {
	throw 'AFRAME is not loaded.';
}

class ItemList {
	constructor(itemPath, sortBy, sortOrder) {
		this.apiUrl = "../api/";
		this.sort = [sortBy, sortOrder];
		this.itemPath = itemPath;
		this.offset = 0;
		this.total = 0;
		this.items = [];
		this.loadPromise = null;
		this.name = "";
		this.mediaSelector = null;
	}
	getOrNull(position) {
		if (position < this.offset || position >= this.offset + this.items.length) return null;
		return this.items[position - this.offset];
	}
	get(position) {
		var item = this.getOrNull(position);
		if (item != null) {
			return Promise.resolve(item);
		}
		if (position < 0 || position >= this.total) throw "Out of Range error.";
		return this.load(Math.max(position - 10, 0)).then(() => this.getOrNull(position));
	}
	load(offset) {
		if (this.loadPromise !== null) return this.loadPromise;
		let params = "?offset=" + offset;
		if (this.sort[0]) params += "&orderBy=" + this.sort[0];
		if (this.sort[1]) params += "&order=" + this.sort[1];
		this.loadPromise = new Promise((resolve, reject) => {
			getJson(this.apiUrl + this.itemPath + params, (result) => {
				this.loadPromise = null;
				if (result && result.meta.status == 200) {
					this.offset = offset;
					this.total = result.total;
					this.items = result.items;
					this.name = result.name || this.itemPath;
					resolve();
				} else {
					reject();
				}
			});
		});
		return this.loadPromise;
	}
	clear() {
		this.offset = 0;
		this.total = 0;
		this.items = [];
	}
}

class LocalList {
	constructor(listName) {
		this.itemPath = "$FAV";
		this.name = "Favorites";
		this.listName = listName;
		this.items = [];
		let s = localStorage.getItem(listName);
		if (s !== null) {
			this.items = JSON.parse(s);
		}
		this.total = this.items.length;
	}
	getOrNull(position) {
		return this.items[position];
	}
	get(position) {
		return Promise.resolve(this.items[position]);
	}
	load(offset) {
		return Promise.resolve({ total: this.items.length });
	}
	addItem(item) {
		if (this.contains(item.name)) return;
		this.items.push(item);
		this.total = this.items.length;
		localStorage.setItem(this.listName, JSON.stringify(this.items));
	}
	setSort(sortBy, sortOrder) {
		let r = sortOrder === "a" ? 1 : -1;
		if (sortBy === "name") {
			this.items.sort((a, b) => a.name.localeCompare(b.name) * r);
		}
	}
	contains(name) {
		return this.items.some(item => item.name === name);
	}
	clear() {
		this.items = [];
		this.total = 0;
		localStorage.removeItem(this.listName);
	}
}

class MediaPlayer {
	constructor(element, controlName) {
		this.el = element;
		this.controlEl = element.querySelector(controlName) || element;
		this.touchToPlay = false;
		this.init();
	}
	init() {
		this.screen = this._byName("screen");
		this.mediaEl = document.querySelector("#imageData0");

		this.controlEl.setAttribute("visible", false);

		this.screen.addEventListener('click', (e) => this.togglePause());
		this.el.addEventListener('mouseenter', (e) => {
			this.controlEl.setAttribute("visible", true);
			if (this.el.components.xywindow) {
				this.el.components.xywindow.controls.setAttribute("visible", true);
			}
		});
		this.el.addEventListener('mouseleave', (e) => {
			if (e.target != this.screen) return;
			this.controlEl.setAttribute("visible", false);
			if (this.el.components.xywindow) {
				this.el.components.xywindow.controls.setAttribute("visible", false);
			}
		});

		this._byName("stereomode").addEventListener('click', (e) => {
			this.toggleStereoMode();
		});

		this._byName("playpause").addEventListener('click', (e) => this.togglePause());
		this._byName("next").addEventListener('click', (e) => this.movePos(1));
		this._byName("prev").addEventListener('click', (e) => this.movePos(-1));

		this._byName("bak10s").addEventListener('click', (e) => {
			this.mediaEl.currentTime -= 10;
		});
		this._byName("fwd10s").addEventListener('click', (e) => {
			this.mediaEl.currentTime += 10;
		});
		this._byName("seek").addEventListener('change', (e) => {
			this.mediaEl.currentTime = e.detail;
		});
		this._byName("playbackRate").addEventListener('change', (e) => {
			this._byName("playbackRateText").setAttribute("value", e.detail.toFixed(1));
			if (this.mediaEl) {
				this.mediaEl.playbackRate = e.detail;
			}
			localStorage.setItem('playbackRate', e.detail.toFixed(1));
		});
		var rate = parseFloat(localStorage.getItem('playbackRate'));
		if (!isNaN(rate)) {
			this._byName("playbackRate").setAttribute("xyrange", "value", rate);
			this._byName("playbackRateText").setAttribute("value", rate.toFixed(1));
		}
	}
	_byName(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
	update() {
		if (this.mediaEl.duration) {
			this._byName("seek").setAttribute('max', this.mediaEl.duration);
			this._byName("seek").components.xyrange.setValue(this.mediaEl.currentTime);
		}
	}
	resize(width, height) {
		console.log("media size: " + width + "x" + height);
		let maxw = 25, maxh = 25;
		let w = maxw;
		let h = height / width * w;
		if (h > maxh) {
			h = maxh;
			w = width / height * h;
		}

		this.screen.setAttribute("width", w);
		this.screen.setAttribute("height", h);
		this.el.setAttribute("width", w);
		this.el.setAttribute("height", h);
	}
	playContent(f) {
		console.log("play: " + f.url + " " + f.contentType);
		if (this.el.components.xywindow && f.name) {
			this.el.setAttribute("xywindow", "title", f.name);
		}
		this.screen.removeAttribute("material"); // to avoid texture leaks.
		this.screen.setAttribute('material', { shader: "flat", src: "#loading", transparent: false, npot: true });

		var dataElem;
		if (f.contentType == "video") {
			dataElem = element("video", [], { src: f.url, autoplay: true, controls: false, loop: true, id: "testestest" });
			dataElem.addEventListener('loadeddata', (e) => {
				this.resize(dataElem.videoWidth, dataElem.videoHeight);
				this.screen.setAttribute("src", "#" + dataElem.id);
				this.screen.setAttribute('material', { shader: "flat", src: "#" + dataElem.id, transparent: false });
			});
			dataElem.playbackRate = this._byName("playbackRate").getAttribute("xyrange").value;
		} else {
			dataElem = element("img", [], { src: f.url });
			dataElem.addEventListener('load', (e) => {
				this.resize(dataElem.naturalWidth, dataElem.naturalHeight);
				this.screen.setAttribute('material', { shader: "flat", src: "#" + dataElem.id, transparent: f.url.endsWith(".png"), npot: true });
			});
		}
		dataElem.id = "imageData" + new Date().getTime().toString(16) + Math.floor(Math.random() * 65536).toString(16);

		// replace
		var parent = this.mediaEl.parentNode;
		if (this.mediaEl.id != "imageData0") parent.removeChild(this.mediaEl);
		element_append(parent, dataElem);
		this.mediaEl = dataElem;

		this.touchToPlay = false;
		if (f.contentType == "video") {
			var p = dataElem.play();
			if (p instanceof Promise) {
				p.catch(error => {
					this.touchToPlay = true;
				});
			}
		}
	}
	toggleStereoMode() {
		if (!this.screen.hasAttribute("stereo-texture")) {
			this.screen.setAttribute("stereo-texture", {});
		} else if (this.screen.getAttribute("stereo-texture").mode == "side-by-side") {
			this.screen.setAttribute("stereo-texture", { mode: "top-and-bottom" });
		} else {
			this.screen.removeAttribute("stereo-texture");
		}
	}
	movePos(d) {
		if (this.mediaSelector == null) return;
		this.mediaSelector.movePos(d);
	}
	togglePause() {
		if (this.mediaEl.tagName == "IMG") {
			return;
		}
		if (this.touchToPlay || this.mediaEl.paused) {
			this.mediaEl.play();
			this.touchToPlay = false;
		} else {
			this.mediaEl.pause();
		}
	}
	dispose() {
		this.screen.removeAttribute("material"); // to avoid texture leaks.
		if (this.mediaEl) this.mediaEl.parentNode.removeChild(this.mediaEl);
	}
}

class MediaSelector {
	constructor(element) {
		this.el = element;
		this.itemlist = new ItemList();
		this.currentPos = -1;
		this.sortOrder = null;
		this.sortBy = null;
		this.item = {};
		this.init();
	}
	init() {
		var videolist = this._byName('medialist').components.xylist;
		videolist.setCallback(function (parent, data) {
			//console.log("create elem");
			var el = document.createElement('a-plane');
			el.setAttribute("width", 4.0);
			el.setAttribute("height", 1.0);
			el.setAttribute("xyrect", {});
			el.setAttribute("xycanvas", { width: 512, height: 128 });
			return el;
		}, function (position, el, data) {
			var ctx = el.components.xycanvas.canvas.getContext("2d");
			ctx.clearRect(0, 0, 512, 128);

			data.get(position).then((item) => {
				if (el.dataset.listPosition != position || item == null) {
					return;
				}
				ctx.font = "24px bold sans-serif";
				ctx.fillStyle = "white";
				ctx.fillText(item.name, 0, 23);
				el.components.xycanvas.updateTexture();

				if (!item.thumbnailUrl) return;
				var image = new Image();
				image.src = item.thumbnailUrl;
				image.onload = function () {
					if (el.dataset.listPosition != position) {
						return;
					}
					var dw = 200, dh = 128 - 24;
					var sx = 0, sy = 0, sw = image.width, sh = image.height;
					if (sh / sw > dh / dw) {
						sy = (sh - dh / dw * sw) / 2;
						sh -= sy * 2;
					}
					ctx.drawImage(image, sx, sy, sw, sh, 0, 24, dw, dh);
					el.components.xycanvas.updateTexture();
				};
			});
		});
		videolist.itemClicked = (pos, ev) => {
			this.currentPos = pos | 0;
			this.itemlist.get(pos).then(item => {
				if (item.type === "list" || item.type === "tag") {
					var mediaList = instantiate('mediaList');
					mediaList.setAttribute("media-selector", "path", item.path || "tags/" + item.name);
					return;
				}
				this.el.sceneEl.systems["media-player"].playContent(item, this);
			});
		};
	}
	load(path, pos) {
		console.log("load list: ", path, pos);
		this.item = { type: "list", path: path, name: path };
		this._loadList(path, pos);
	}
	setSort(sortBy, sortOrder) {
		this.sortBy = sortBy;
		this.sortOrder = sortOrder;
		this._loadList(this.itemlist.itemPath);
	}
	_loadList(path, pos) {
		if (path === "$FAV") {
			this.itemlist = favList;
			favList.setSort(this.sortBy, this.sortOrder);
		} else {
			this.itemlist = new ItemList(path, this.sortBy, this.sortOrder);
		}
		this.currentPos = pos | 0;
		this.itemlist.load(this.currentPos).then(() => {
			var mediaList = this._byName('medialist').components.xylist;
			mediaList.setContents(this.itemlist, this.itemlist.total);
			this.el.setAttribute("xywindow", "title", this.itemlist.name);
			this.item.name = this.itemlist.name;
			this.item.thumbnailUrl = (this.itemlist.getOrNull(0) || {}).thumbnailUrl;
			if (pos != null) {
				this.currentPos--;
				this.movePos(1);
			}
		});
	}
	_byName(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
	movePos(d) {
		this.currentPos += d;
		if (this.currentPos >= 0 && this.currentPos < this.itemlist.total) {
			this.itemlist.get(this.currentPos).then(item => {
				if (item.contentType == "image" || item.contentType == "video") {
					this.el.sceneEl.systems["media-player"].playContent(item, this);
				} else {
					// skip
					this.movePos(d);
				}
			});
		} else {
			this.currentPos = this.currentPos < 0 ? this.itemlist.total : -1;
		}
	}
	checkUrlFragment() {
		if (location.hash) {
			var fragment = location.hash.slice(1);
			var m = fragment.match(/tag:(.+)/);
			var st = fragment.match(/start:(\d+)/);
			if (m) {
				this.load("tags/" + m[1], st && st[1]);
				return true;
			}
		}
		return false;
	}
}


var favList = new LocalList("favoriteItems");

AFRAME.registerComponent('media-selector', {
	schema: {
		path: { default: "" }
	},
	init: function () {
		this.mediaSelector = new MediaSelector(this.el);
		this._getEl('favlist-button').addEventListener('click', (e) => {
			this.mediaSelector.load("$FAV");
		});
		this._getEl('fav-button').addEventListener('click', (e) => {
			if (this.mediaSelector.item) favList.addItem(this.mediaSelector.item);
		});
		this._getEl('tags-button').addEventListener('click', (e) => {
			this.mediaSelector.load("tags", null);
		});
		this._getEl('sort-name-button').addEventListener('click', (e) => {
			this.mediaSelector.setSort("name", (this.mediaSelector.sortBy == "name" && this.mediaSelector.sortOrder == "a") ? "d" : "a");
		});
		this._getEl('sort-updated-button').addEventListener('click', (e) => {
			this.mediaSelector.setSort("updated", (this.mediaSelector.sortBy == "updated" && this.mediaSelector.sortOrder == "d") ? "a" : "d");
		});
	},
	update: function () {
		if (this.data.path !== "") {
			this.mediaSelector.load(this.data.path);
		} else if (!this.mediaSelector.checkUrlFragment()) {
			this.mediaSelector.load("tags/_ALL_ITEMS");
		}
	},
	remove: function () {
	},
	_getEl(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
});


AFRAME.registerSystem('media-player', {
	init: function () {
		this.currentPlayer = null;
	},
	playContent: function (item, mediaSelector) {
		if (this.currentPlayer === null) {
			instantiate('mediaPlayerTemplate').addEventListener('loaded', e => {
				this.currentPlayer.mediaSelector = mediaSelector;
				this.currentPlayer.playContent(item);
			}, false);
		} else {
			this.currentPlayer.mediaSelector = mediaSelector;
			this.currentPlayer.playContent(item);
		}
	},
	registerPlayer: function (player) {
		this.selectPlayer(player);
	},
	unregisterPlayer: function (player) {
		if (player == this.currentPlayer) {
			this.currentPlayer = null;
		}
	},
	selectPlayer: function (player) {
		this.currentPlayer = player;
	}
});

AFRAME.registerComponent('media-player', {
	schema: {
		control: { type: "string" }
	},
	init: function () {
		this.mediaPlayer = new MediaPlayer(this.el, this.data.control);
		this.intervalId = setInterval(() => this.mediaPlayer.update(), 500);
		this.system.registerPlayer(this.mediaPlayer);
		this.onclicked = ev => {
			this.system.selectPlayer(this.mediaPlayer);
		};
		this.el.addEventListener('click', this.onclicked);
	},
	remove: function () {
		clearInterval(this.intervalId);
		this.system.unregisterPlayer(this.mediaPlayer);
		this.mediaPlayer.dispose();
		this.el.removeEventListener('click', this.onclicked);
	}
});

AFRAME.registerComponent('stereo-texture', {
	schema: {
		mode: { default: "side-by-side", oneOf: ["side-by-side", "top-and-bottom"] }
	},
	init: function () {
		this._componentChanged = this._componentChanged.bind(this);
		this._checkVrMode = this._checkVrMode.bind(this);
		this.el.addEventListener('componentchanged', this._componentChanged, false);
		this.el.sceneEl.addEventListener('enter-vr', this._checkVrMode, false);
		this.el.sceneEl.addEventListener('exit-vr', this._checkVrMode, false);
	},
	update: function () {
		this._reset();
		if (this.el.getObject3D("mesh") === null) return;
		let luv = this._makeObj(1, "stereo-left").geometry.getAttribute("uv");
		let ruv = this._makeObj(2, "stereo-right").geometry.getAttribute("uv");
		if (this.data.mode == "side-by-side") {
			luv.setArray(luv.array.map((v, i) => i % 2 == 0 ? v / 2 : v));
			ruv.setArray(ruv.array.map((v, i) => i % 2 == 0 ? v / 2 + 0.5 : v));
		} else if (this.data.mode == "top-and-bottom") {
			luv.setArray(luv.array.map((v, i) => i % 2 == 1 ? v / 2 + 0.5 : v));
			ruv.setArray(ruv.array.map((v, i) => i % 2 == 1 ? v / 2 : v));
		}
		luv.needsUpdate = true;
		ruv.needsUpdate = true;

		this.el.getObject3D("mesh").visible = false;
		this._checkVrMode();
	},
	remove: function () {
		this.el.removeEventListener('componentchanged', this._componentChanged, false);
		this.el.sceneEl.removeEventListener('enter-vr', this._checkVrMode, false);
		this.el.sceneEl.removeEventListener('exit-vr', this._checkVrMode, false);
		this._reset();
	},
	_checkVrMode: function () {
		let leftObj = this.el.getObject3D("stereo-left");
		if (leftObj != null) {
			this.el.sceneEl.is('vr-mode') ? leftObj.layers.disable(0) : leftObj.layers.enable(0);
		}
	},
	_makeObj: function (layer, name) {
		let obj = this.el.getObject3D("mesh").clone();
		obj.geometry = obj.geometry.clone();
		obj.layers.set(layer);
		this.el.setObject3D(name, obj);
		return obj;
	},
	_reset: function () {
		if (this.el.getObject3D("stereo-left") != null) {
			this.el.getObject3D("mesh").visible = true;
			this.el.removeObject3D("stereo-left");
			this.el.removeObject3D("stereo-right");
		}
	},
	_componentChanged: function (ev) {
		if (ev.detail.name === 'geometry' || ev.detail.name === 'material') {
			this.update();
		}
	}
});

AFRAME.registerComponent('simple-clock', {
	schema: {},
	init: function () {
		this.intervalId = setInterval(() => this.el.setAttribute("value", this.formatTime(new Date())), 1000);
	},
	formatTime: function (t) {
		let d2 = n => ("0" + n).substr(-2);
		return [t.getFullYear(), d2(t.getMonth() + 1), d2(t.getDate())].join("-") + " " +
			[d2(t.getHours()), d2(t.getMinutes()), d2(t.getSeconds())].join(":");
	},
	remove: function () {
		clearInterval(this.intervalId);
	}
});


AFRAME.registerComponent('main-menu', {
	schema: {
	},
	init: function () {
		this._getEl('openMediaSelector').addEventListener('click', (e) => {
			instantiate('mediaList');
		});
		this._getEl('openVncClient').addEventListener('click', (e) => {
			instantiate('vncClient');
		});
		this._getEl('openMediaPlayer').addEventListener('click', (e) => {
			instantiate('mediaPlayerTemplate');
		});
		this._getEl('exitVRButton').addEventListener('click', (e) => {
			document.querySelector('a-scene').exitVR();
		});
	},
	remove: function () {
	},
	_getEl(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
});

AFRAME.registerComponent('menu-on-click', {
	schema: {
		template: { type: 'string', default: "" },
		distance: { type: 'number', default: 10 },
		check: { type: 'string', default: "[main-menu]" },
		offsetY: { type: 'number', default: 0 },
	},
	init: function () {
		this.el.classList.add("clickable");
		this.el.addEventListener('click', (ev) => {
			if (this.data.check !== "" && document.querySelector(this.data.check)) {
				return;
			}
			var menuEl = instantiate(this.data.template);
			if (!ev.detail.cursorEl || !ev.detail.cursorEl.components.raycaster) {
				return;
			}
			var raycaster = ev.detail.cursorEl.components.raycaster.raycaster;
			var rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), raycaster.ray.direction);
			menuEl.object3D.quaternion.copy(rot);
			var d = raycaster.ray.direction.clone().multiplyScalar(this.data.distance);
			menuEl.setAttribute("position", raycaster.ray.origin.clone().add(d).add(new THREE.Vector3(0, this.data.offsetY, 0)));
		});
	}
});

AFRAME.registerComponent('debug-log', {
	schema: {
		timestamp: { default: true },
		lines: { default: 12 }
	},
	init: function () {
		this.log = [];
		this.logEl = this.el.querySelector("[name=debug-text]");
		this.orgLog = console.log;
		console.log = (msg) => {
			this.orgLog(msg);
			let header = "";
			if (this.data.timestamp) {
				let now = new Date();
				header = "[" + now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds() + "]: ";
			}
			this.log.push(header + msg);
			if (this.log.length > this.data.lines) this.log.shift();
			this.logEl.setAttribute("value", this.log.join("\n"));
		};
	},
	remove: function () {
		console.log = this.orgLog;
	}
});

AFRAME.registerComponent('position-controls', {
	schema: {
		arrowKeys: { default: "" },
		rotationSpeed: { default: 0.1 }
	},
	init: function () {
		if (this.data.arrowkeys == "rotation") {
			document.addEventListener('keydown', ev => {
				let rot = this.data.rotationSpeed;
				switch (ev.code) {
					case "ArrowRight":
						this.el.object3D.rotateY(-rot);
						break;
					case "ArrowLeft":
						this.el.object3D.rotateY(rot);
						break;
					case "ArrowDown":
						this.el.object3D.rotateX(-rot);
						break;
					case "ArrowUp":
						this.el.object3D.rotateX(rot);
						break;
					case "Space":
						this.el.setAttribute("rotation", { x: 0, y: 0, z: 0 });
						break;
				}
			});
		}
		document.addEventListener('wheel', ev => {
			this.el.object3D.translateZ(ev.deltaY * 0.01);
		});
		this.el.addEventListener('gripdown', ev => {
			document.querySelectorAll("[xy-drag-control]").forEach(el => {
				el.setAttribute("xy-drag-control", { mode: "move" });
			});
		});
		this.el.addEventListener('gripup', ev => {
			document.querySelectorAll("[xy-drag-control]").forEach(el => {
				el.setAttribute("xy-drag-control", { mode: "grab" });
			});
		});
		this.el.querySelectorAll('[laser-controls]').forEach(el => el.addEventListener('axismove', ev => {
			let speed = 0.2;
			this.el.object3D.translateX(ev.detail.axis[0] * speed);
			this.el.object3D.translateZ(ev.detail.axis[1] * speed);
		}));
	}
});

AFRAME.registerShader('gridground', {
	schema: {
		color: { type: 'color', is: 'uniform', default: "#ffff00" }
	},
	init: function (data) {
		this.attributes = this.initVariables(data, 'attribute');
		this.uniforms = THREE.UniformsUtils.merge([this.initVariables(data, 'uniform'), THREE.UniformsLib.fog]);
		this.material = new THREE.ShaderMaterial({
			uniforms: this.uniforms,
			vertexShader: this.vertexShader,
			fragmentShader: this.fragmentShader,
			fog: true,
			blending: THREE.AdditiveBlending
		});
	},
	vertexShader: `
	varying vec2 vUv;
	#include <common>
	#include <color_pars_vertex>
	#include <fog_pars_vertex>
	#include <clipping_planes_pars_vertex>
	#define DISTANCE
	void main() {
		#include <color_vertex>
		#include <begin_vertex>
		#include <project_vertex>
		#include <worldpos_vertex>
		#include <clipping_planes_vertex>
		#include <fog_vertex>
		vUv = worldPosition.xz;
	}`,
	fragmentShader: `
	uniform vec3 diffuse;
	uniform vec3 color;
	uniform float opacity;
	varying vec2 vUv;
	#include <common>
	#include <color_pars_fragment>
	#include <fog_pars_fragment>
	#include <clipping_planes_pars_fragment>
	void main() {
		#include <clipping_planes_fragment>
		vec2 gpos = abs(mod(vUv * 0.5, 1.0) - vec2(0.5,0.5));
		float l = max(pow(0.5, gpos.x * 300.0), pow(0.5, gpos.y * 300.0)) * pow(0.5, length(gpos) * 10.0);
		if (l < 0.1) {
			discard;
		}
		vec4 diffuseColor = vec4( color * l, 1.0 );
		#include <color_fragment>
		gl_FragColor = diffuseColor;
		#include <fog_fragment>
	}`
});

function instantiate(id, parent) {
	var p = document.createElement('div');
	p.innerHTML = document.querySelector('#' + id).innerHTML;
	var el = p.firstElementChild;
	(parent || document.querySelector("a-scene")).appendChild(el);
	return el;
}

function playContent(item) {
	document.querySelector('a-scene').systems["media-player"].playContent(item, null);
}

window.addEventListener('DOMContentLoaded', (function (e) {
	document.querySelector("[main-menu]") || instantiate('mainMenuTemplate');
	if (location.hash) {
		instantiate('mediaList');
	}

	document.addEventListener('keydown', (function (e) {
		let mediaPlayer = document.querySelector('a-scene').systems["media-player"].currentPlayer;
		if (!mediaPlayer) return;
		switch (e.code) {
			case "ArrowRight":
				mediaPlayer.movePos(1);
				break;
			case "ArrowLeft":
				mediaPlayer.movePos(-1);
				break;
			case "Space":
				mediaPlayer.togglePause();
				break;
		}
	}));

	document.querySelectorAll('[laser-controls]').forEach(el => el.addEventListener('bbuttondown', ev => {
		let mediaPlayer = document.querySelector('a-scene').systems["media-player"].currentPlayer;
		if (mediaPlayer) mediaPlayer.movePos(-1);
	}));
	document.querySelectorAll('[laser-controls]').forEach(el => el.addEventListener('abuttondown', ev => {
		let mediaPlayer = document.querySelector('a-scene').systems["media-player"].currentPlayer;
		if (mediaPlayer) mediaPlayer.movePos(1);
	}));
}), false);
