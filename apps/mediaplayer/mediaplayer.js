"use strict";

if (typeof AFRAME === 'undefined') {
	throw 'AFRAME is not loaded.';
}

/** 
 * @typedef {{name: string; type: string; url: string; fetch:((pos?:number)=>Promise<Response>)?;}} ContentInfo
 */

class BaseFileList {
	/**
	 * @param {string} itemPath
	 * @param {{[key:string]:string}?} options
	 */
	constructor(itemPath, options) {
		this.itemPath = itemPath;
		this.options = options || {};
		this.size = -1;
		this.name = "";
		this.thumbnailUrl = null;
		this.onupdate = null;
	}

	/**
	 * @returns {Promise<void>}
	 */
	async init() {
		await this.get(0)
	}

	/**
	 * @returns {Promise<ContentInfo>}
	 */
	async get(position) {
		throw 'not implemented';
	}
	notifyUpdate() {
		if (this.onupdate) {
			this.onupdate();
		}
	}
}

class FileListCursor {
	/**
	 * @param {BaseFileList} fileList
	 * @param {number} position
	 * @param {((ContentInfo) => boolean)} filter
	 */
	constructor(fileList, position, filter) {
		this.fileList = fileList;
		this.position = position | 0;
		this.filter = filter;
		this.onpositionchange = null;
	}

	/**
	 * @param {number} ofs
	 */
	async moveOffset(ofs) {
		this.position += ofs | 0;
		while (this.position >= 0 && this.position < this.fileList.size) {
			let item = await this.fileList.get(this.position);
			if (item && this.filter == null || this.filter(item)) {
				this.onpositionchange && this.onpositionchange(this.position);
				return item;
			}
			this.position += ofs < 0 ? -1 : 1;
		}
		this.position = this.position < 0 ? this.fileList.size : -1;
		return null;
	}
}

class ItemList extends BaseFileList {
	/**
	 * @param {string} apiUrl
	 * @param {string} itemPath
	 * @param {{[key:string]:string}?} options
	 */
	constructor(apiUrl, itemPath, options) {
		super(itemPath, options);
		this.thumbnailUrl = null;
		this.offset = 0;
		this.apiUrl = apiUrl;
		this.loadPromise = null;
		this.items = [];
	}
	init() {
		return this._load(0);
	}
	async get(position) {
		let item = this._getOrNull(position);
		if (item != null) {
			return item;
		}
		if (position < 0 || this.size >= 0 && position >= this.size) throw "Out of Range error.";
		await this._load(Math.max(position - 10, 0));
		return this._getOrNull(position);
	}
	async _load(offset) {
		if (this.loadPromise !== null) return await this.loadPromise;

		let baseUrl = (this.apiUrl + this.itemPath).replace(/[^/]+$/, '');
		let convUrl = (path) => {
			if (path == null || path.includes('://')) return path;
			if (!path.startsWith('/')) {
				return baseUrl + path;;
			}
			return path;
		};

		this.loadPromise = (async () => {
			let params = "?offset=" + offset;
			if (this.options.orderBy) params += "&orderBy=" + this.options.orderBy;
			if (this.options.order) params += "&order=" + this.options.order;
			let response = await fetch(this.apiUrl + this.itemPath + params);
			if (response.ok) {
				let result = await response.json();
				for (let item of result.items) {
					item.url = convUrl(item.url);
					item.thumbnailUrl = convUrl(item.thumbnailUrl);
				}
				this.offset = offset;
				this.size = result.total || result.items.length;
				this.items = result.items;
				this.name = result.name || this.itemPath;
				if (!this.thumbnailUrl && result.items[0]) this.thumbnailUrl = result.items[0].thumbnailUrl;
			}
		})();
		try {
			await this.loadPromise;
		} finally {
			this.loadPromise = null;
		}
	}
	getParentPath() {
		return this.itemPath.replace(/\/[^/]+$/, '');
	}
	_getOrNull(position) {
		if (position < this.offset || position >= this.offset + this.items.length) return null;
		return this.items[position - this.offset];
	}
}

class OnMemoryFileList extends BaseFileList {
	constructor(items, options) {
		super('', options);
		this.setItems(items);
	}
	setItems(items) {
		this.items = items;
		let options = this.options;
		if (options.orderBy) {
			this._setSort(options.orderBy, options.order);
		}
		this.size = this.items.length;
	}
	init() {
		return this.get(0)
	}
	get(position) {
		return Promise.resolve(this.items[position]);
	}
	contains(item) {
		return this.items.some(i => i.storage === item.storage && i.path === item.path);
	}
	_setSort(orderBy, order) {
		let r = order === "a" ? 1 : -1;
		if (orderBy === "name") {
			this.items.sort((a, b) => (a.name || "").localeCompare(b.name) * r);
		} else if (orderBy === "updated") {
			this.items.sort((a, b) => (a.updatedTime || "").localeCompare(b.updatedTime) * r);
		} else if (orderBy === "size") {
			this.items.sort((a, b) => ((a.size && b.size) ? a.size - b.size : 0) * r);
		}
	}
}

class LocalList extends OnMemoryFileList {
	constructor(listName, options) {
		let items = [];
		let s = localStorage.getItem(listName);
		if (s !== null) {
			items = JSON.parse(s);
		}
		super(items, options);
		this.itemPath = listName;
		this.name = "Favorites";
	}
	addItem(item, storage = null) {
		if (this.contains(item)) return;
		this.items.push(item);
		this.setItems(this.items);
		localStorage.setItem(this.itemPath, JSON.stringify(this.items));
		this.notifyUpdate();
	}
	removeItem(item, storage = null) {
		let s = storage || item.storage, path = item.path;
		this.items = this.items.filter(i => i.storage != s || i.path != path);
		this.setItems(this.items);
		localStorage.setItem(this.itemPath, JSON.stringify(this.items));
		this.notifyUpdate();
	}
	clear() {
		this.items = [];
		this.size = 0;
		localStorage.removeItem(this.itemPath);
		this.notifyUpdate();
	}
	_getOrNull(position) {
		return this.items[position];
	}
}

class StorageList extends OnMemoryFileList {
	constructor(accessors, options) {
		super([], options);
		this.accessors = accessors || {};
		this.itemPath = '/';
		this.name = "Storage";
		this._update();
	}
	_update() {
		let items = [];
		for (let [k, sa] of Object.entries(this.accessors)) {
			if (sa.shortcuts && Object.keys(sa.shortcuts).length) {
				Object.keys(sa.shortcuts).forEach(n => {
					items.push({ name: n, type: 'folder', storage: k, path: sa.shortcuts[n], updatedTime: '' });
				});
			} else {
				items.push({ name: sa.name, type: 'folder', storage: k, path: sa.root, updatedTime: '' });
			}
		}
		this.setItems(items);
	}
	getList(storage, path, options) {
		let accessor = this.accessors[storage];
		if (!accessor) {
			return null;
		}
		return accessor.getList(path || accessor.root, options);
	}
	addStorage(id, data) {
		this.accessors[id] = data;
		this._update();
		this.notifyUpdate();
	}
}

let storageList = new StorageList(globalThis.storageAccessors);
globalThis.storageAccessors = new Proxy({}, {
	// NOTE: Storage can only be accessed via storageList.
	set: function (obj, prop, value) {
		storageList.addStorage(prop, value);
		return true;
	}
});

storageList.addStorage('Favs', {
	name: "Favorites",
	root: "favoriteItems",
	shortcuts: {},
	getList: (folder, options) => new LocalList("favoriteItems", options)
});

// TODO: settings for each environment.
if (!location.href.includes('.github.io')) {
	storageList.addStorage('MEDIA', {
		name: "Media",
		root: "tags",
		shortcuts: { "Tags": "tags", "All": "tags/.ALL_ITEMS", "Volumes": "volumes" },
		getList: (folder, options) => new ItemList("../api/", folder, options)
	});
}
storageList.addStorage('DEMO', {
	name: "Demo",
	root: "list.json",
	shortcuts: {},
	getList: (folder, options) => new ItemList("https://binzume.github.io/demo-assets/", folder, options)
});

AFRAME.registerComponent('media-selector', {
	schema: {
		storage: { default: "" },
		path: { default: "" },
		sortField: { default: "" },
		sortOrder: { default: "" },
		openWindow: { default: false }
	},
	init() {
		this.itemlist = storageList;
		this.item = {};
		let videolist = this._byName('medialist').components.xylist;
		let itemWidth = 4.0;
		let itemHeight = 1.0;
		let cols = 1;
		let thumbW = 200, thumbH = 128;
		let windowWidth = this.el.getAttribute('width');
		let gridMode = false;
		if (windowWidth >= 4) {
			gridMode = true;
			cols = Math.floor(windowWidth / 1.5);
			itemHeight = itemWidth = windowWidth / cols;
			thumbW = 256 - 4;
			thumbH = 160;
		}
		videolist.setLayout({
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
		videolist.setAdapter({
			selector: this,
			create(parent) {
				//console.log("create elem");
				var el = document.createElement('a-plane');
				el.setAttribute("width", itemWidth);
				el.setAttribute("height", itemHeight);
				el.setAttribute("xyrect", {});
				if (gridMode) {
					el.setAttribute("xycanvas", { width: 256, height: 256 });
				} else {
					el.setAttribute("xycanvas", { width: 512, height: 128 });
				}
				return el;
			}, bind(position, el, data) {
				let canvas = el.components.xycanvas.canvas;
				let ctx = el.components.xycanvas.canvas.getContext("2d");
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				el.components.xycanvas.updateTexture();

				let wrapText = (str, textWidth, ctx) => {
					let lines = [''], ln = 0;
					for (let char of str) {
						if (char == '\n' || ctx.measureText(lines[ln] + char).width > textWidth) {
							lines.push('');
							ln++;
						}
						if (char != '\n') {
							lines[ln] += char;
						}
					}
					return lines;
				};

				let prevSise = this.selector.itemlist.size;
				data.get(position).then((item) => {
					if (el.dataset.listPosition != position || item == null) {
						return;
					}
					if (this.selector.itemlist.size != prevSise) {
						videolist.setContents(this.selector.itemlist, this.selector.itemlist.size); // update size
					}

					if (gridMode) {
						ctx.font = "20px bold sans-serif";
						ctx.fillStyle = "white";
						let n = wrapText(item.name, 250, ctx);
						ctx.fillText(n[0], 0, thumbH + 23);
						if (n[1]) {
							ctx.fillText(n[1], 0, thumbH + 45);
						}

						if (item.updatedTime) {
							ctx.font = "18px sans-serif";
							ctx.fillStyle = "white";
							ctx.fillText(item.updatedTime.substr(0, 16), 0, thumbH + 64);
						}
					} else {
						ctx.font = "20px bold sans-serif";
						ctx.fillStyle = "white";
						ctx.fillText(item.name, 0, 23);

						if (item.updatedTime) {
							ctx.font = "18px sans-serif";
							ctx.fillStyle = "white";
							ctx.fillText(item.updatedTime.substr(0, 16), 210, 50);
						}
					}
					el.components.xycanvas.updateTexture();

					let drawThumbnail = (image) => {
						if (el.dataset.listPosition != position) {
							return;
						}
						let py = gridMode ? 2 : 24;
						let px = gridMode ? 2 : 0;
						let dw = thumbW, dh = thumbH - py;
						let sx = 0, sy = 0, sw = image.width, sh = image.height;
						if (sh / sw > dh / dw) {
							sy = (sh - dh / dw * sw) / 2;
							sh -= sy * 2;
						}
						ctx.drawImage(image, sx, sy, sw, sh, px, py, dw, dh);

						el.components.xycanvas.updateTexture();
					};

					if (!item.thumbnailUrl) {
						if (item.type == 'folder' || item.type == 'list') {
							drawThumbnail(document.querySelector('#mediaplayer-icon-folder'));
						} else {
							drawThumbnail(document.querySelector('#mediaplayer-icon-file'));
						}
						return;
					}
					let image = new Image();
					image.crossOrigin = "anonymous";
					image.referrerPolicy = "origin-when-cross-origin";
					image.onload = function () {
						drawThumbnail(image);
					};
					image.src = item.thumbnailUrl;
				});
			}
		});
		videolist.el.addEventListener('clickitem', async (ev) => {
			let pos = ev.detail.index;
			let item = await this.itemlist.get(pos);
			if (item.url == null && item.type.startsWith("application/")) {
				// HACK: for Google drive.
				let url = item.thumbnailUrl;
				if (url.includes('.googleusercontent.com/')) {
					url = url.replace(/=s\d+$/, '=s1600');
				}
				item = Object.assign({}, item, { fetch: () => fetch(url), type: 'image/jpeg' });
			}
			if (item.url == null && item.size > 0 && this.itemlist.fetch) {
				let list = this.itemlist;
				item = Object.assign({ fetch: (start, end) => list.fetch(item, start, end) }, item);
			}
			console.log(item);
			if (item.type === "list" || item.type === "tag") {
				this._openList(item.storage, item.path);
			} else if (window.appManager && appManager.openContent(item)) {
				// opened
			} else if (item.type == "folder" || item.type == "archive") {
				this._openList(item.storage || this.data.storage, item.path, item.type == "archive");
			} else {
				var cursor = new FileListCursor(this.itemlist, pos, (item) => {
					let t = item.type.split("/")[0];
					return t == "image" || t == "video" || t == "audio";
				});
				this.el.sceneEl.systems["media-player"].playContent(item, cursor);
			}
		});

		this._byName('storage-button').addEventListener('click', ev => {
			this.el.setAttribute("media-selector", { path: '', storage: '_dummy_' });
		});

		this._byName('option-menu').setAttribute('xyselect', 'select', -1);
		this._byName('option-menu').addEventListener('change', (/** @type {CustomEvent} */ev) => {
			if (ev.detail.index == 0) {
				this._openList(this.data.storage, this.data.path, true);
			} else if (ev.detail.index == 1) {
				storageList.getList('Favs').addItem(this.item);
			} else if (ev.detail.index == 2) {
				storageList.getList('Favs').removeItem(this.item);
			}
		});

		this._byName('parent-button').addEventListener('click', (ev) => {
			if (this.itemlist.getParentPath) {
				let parent = this.itemlist.getParentPath();
				if (parent) {
					this._openList(this.data.storage, parent);
				}
			}
		});

		this._byName('sort-option').setAttribute('values', ["Name", "Update", "Size"].join(","));
		this._byName('sort-option').addEventListener('change', (ev) => {
			let field = ["name", "updated", "size"][ev.detail.index];
			let order = (this.data.sortField == field && this.data.sortOrder == "a") ? "d" : "a";
			this.el.setAttribute("media-selector", { sortField: field, sortOrder: order });
		});
	},
	update() {
		let path = this.data.path;
		console.log("load list: ", path);
		this.item = { type: "list", path: path, name: path, storage: this.data.storage };
		this._loadList(path);
	},
	remove() {
		this.itemlist.onupdate = null;
	},
	async _openList(storage, path, openWindow) {
		if ((openWindow || this.data.openWindow) && window.appManager) {
			let mediaList = await window.appManager.launch('app-media-selector');
			let pos = new THREE.Vector3().set(this.el.getAttribute("width") * 1 + 0.3, 0, 0);
			mediaList.setAttribute("rotation", this.el.getAttribute("rotation"));
			mediaList.setAttribute("position", this.el.object3D.localToWorld(pos));
			mediaList.setAttribute('window-locator', { applyCameraPos: false, updateRotation: false });
			mediaList.setAttribute("media-selector", "path:" + path + (storage ? ";storage:" + storage : ""));
		} else {
			this.el.setAttribute("media-selector", "path:" + path + (storage ? ";storage:" + storage : ""));
		}
	},
	_loadList(path) {
		this.itemlist.onupdate = null;
		this.itemlist = storageList.getList(this.data.storage, path, { orderBy: this.data.sortField, order: this.data.sortOrder });
		if (!this.itemlist) {
			storageList._setSort(this.data.sortField, this.data.sortOrder);
			this.itemlist = storageList;
		}
		this.el.setAttribute("title", "Loading...");
		let mediaList = this._byName('medialist').components.xylist;
		mediaList.setContents([]);
		this.itemlist.init().then(() => {
			this.item.name = this.itemlist.name || this.itemlist.itemPath;
			this.item.thumbnailUrl = this.itemlist.thumbnailUrl;
			mediaList.setContents(this.itemlist, this.itemlist.size);
			this.itemlist.onupdate = () => {
				mediaList.setContents(this.itemlist, this.itemlist.size);
			};
			this.el.setAttribute("title", this.item.name);
		});
	},
	_byName(name) {
		return /** @type {import("aframe").Entity} */ (this.el.querySelector("[name=" + name + "]"));
	}
});

AFRAME.registerComponent('media-player', {
	schema: {
		src: { default: "" },
		loop: { default: true },
		playbackRate: { default: 1.0 },
		loadingSrc: { default: "#mediaplayer-loading" },
		mediaController: { default: "media-controller" },
		maxWidth: { default: 25 },
		maxHeight: { default: 25 },
		screen: { default: ".screen" }
	},
	init() {
		this.loadingTimer = null;
		this.screen = this.el.querySelector(this.data.screen);
		this.touchToPlay = false;
		this.system.registerPlayer(this);

		this.onclicked = ev => this.system.selectPlayer(this);
		this.el.addEventListener('click', this.onclicked);
		this.screen.addEventListener('click', ev => this.togglePause());
		this.stereoMode = 0;

		let mediaController = this.data.mediaController;
		this.el.querySelectorAll("[" + mediaController + "]").forEach(controller => {
			controller.components[mediaController].setMediaPlayer(this);
		});

		let showControls = visible => {
			this.el.querySelectorAll("[" + mediaController + "]")
				.forEach(el => el.setAttribute("visible", visible));
			if (this.el.components.xywindow) {
				this.el.components.xywindow.controls.setAttribute("visible", visible);
			}
		}
		showControls(false);
		this.el.addEventListener('mouseenter', ev => { showControls(true); setTimeout(() => showControls(true), 0) });
		this.el.addEventListener('mouseleave', ev => showControls(false));
	},
	update(oldData) {
		if (this.data.src != oldData.src && this.data.src) {
			this.playContent({ url: this.data.src }, null);
		}
		if (this.mediaEl && this.mediaEl.playbackRate !== undefined) {
			this.mediaEl.playbackRate = this.data.playbackRate;
		}
		if (this.mediaEl && this.mediaEl.loop !== undefined) {
			this.mediaEl.loop = this.data.loop;
		}
	},
	resize(width, height) {
		console.log("media size: " + width + "x" + height);
		let w = this.data.maxWidth;
		let h = height / width * w;
		if (h > this.data.maxHeight) {
			h = this.data.maxHeight;
			w = width / height * h;
		}
		if (isNaN(h)) {
			h = 3;
			w = 10;
		}

		this.screen.setAttribute("width", w);
		this.screen.setAttribute("height", h);
		this.el.setAttribute("width", w);
		this.el.setAttribute("height", h);
	},
	playContent(f, listCursor) {
		this.listCursor = listCursor;
		this.el.dispatchEvent(new CustomEvent('media-player-play', { detail: { item: f, cursor: listCursor } }));
		console.log("play: " + f.url + " " + f.type);
		if (this.el.components.xywindow && f.name) {
			this.el.setAttribute("xywindow", "title", f.name);
		}

		clearTimeout(this.loadingTimer);
		this.loadingTimer = setTimeout(() => this._setSrc(this.data.loadingSrc, false), 200);

		/** @type {Element & {[x:string]:any}} TODO clean up type */
		let dataElem;
		if (f.type && f.type.split("/")[0] == "image") {
			dataElem = Object.assign(document.createElement("img"), { crossOrigin: "" });
			dataElem.addEventListener('load', ev => {
				this._setSrc("#" + dataElem.id, (f.url || f.type).endsWith("png"));
				this.resize(dataElem.naturalWidth, dataElem.naturalHeight);
				this.el.dispatchEvent(new CustomEvent('media-player-loaded', { detail: { item: f, event: ev } }));
			});
		} else {
			dataElem = Object.assign(document.createElement("video"), {
				autoplay: true, controls: false, loop: this.data.loop, id: "dummyid", crossOrigin: ""
			});
			dataElem.addEventListener('loadeddata', ev => {
				this._setSrc("#" + dataElem.id, false);
				dataElem.playbackRate = this.data.playbackRate;
				this.resize(dataElem.videoWidth, dataElem.videoHeight);
				this.el.dispatchEvent(new CustomEvent('media-player-loaded', { detail: { item: f, event: ev } }));
			});
			dataElem.addEventListener('ended', ev => {
				this.el.dispatchEvent(new CustomEvent('media-player-ended', { detail: { item: f, event: ev } }));
			});
		}
		dataElem.id = "imageData" + new Date().getTime().toString(16) + Math.floor(Math.random() * 65536).toString(16);
		if (!f.url && f.type.startsWith("video/mp4") && typeof MP4Player !== 'undefined') {
			let options = {
				opener: {
					async open(pos) {
						return (await f.fetch(pos)).body.getReader();
					}
				}
			};
			new MP4Player(dataElem).setBufferedReader(new BufferedReader(options));
		} else if (!f.url && f.fetch) {
			(async () => {
				let url = URL.createObjectURL(await (await f.fetch()).blob())
				dataElem.addEventListener('load', (ev) => {
					URL.revokeObjectURL(url);
				}, { once: true });
				dataElem.src = url;
			})();
		} else {
			dataElem.src = f.url;
		}

		// replace
		var parent = (this.mediaEl || document.querySelector(this.data.loadingSrc)).parentNode;
		if (this.mediaEl) this.mediaEl.parentNode.removeChild(this.mediaEl);
		parent.appendChild(dataElem);
		this.mediaEl = dataElem;

		this.touchToPlay = false;
		if (dataElem.play !== undefined) {
			var p = dataElem.play();
			if (p instanceof Promise) {
				p.catch(error => {
					this.touchToPlay = true;
				});
			}
		}
		this.setStereoMode(this.stereoMode);
	},
	async movePos(d) {
		if (!this.listCursor) {
			return;
		}
		let item = await this.listCursor.moveOffset(d);
		if (item) {
			this.playContent(item, this.listCursor);
		}
	},
	_setSrc(src, transparent) {
		this.screen.removeAttribute("material"); // to avoid texture leaks.
		clearTimeout(this.loadingTimer);
		this.loadingTimer = null;
		this.screen.setAttribute('material', { shader: "flat", src: src, transparent: transparent });
	},
	tick() {
		// workaround for https://bugs.chromium.org/p/chromium/issues/detail?id=1107578
		if (this.mediaEl && this.mediaEl.tagName == "VIDEO" && this.mediaEl.readyState >= this.mediaEl.HAVE_CURRENT_DATA) {
			this.screen.components.material.material.map.needsUpdate = true;
		}
	},
	setStereoMode(idx) {
		this.stereoMode = idx;
		if (idx == 3 || idx == 4) {
			if (!this.sky360) {
				this.orgEnv = document.querySelector('#env');
				if (this.orgEnv) {
					this.orgEnv.parentNode.removeChild(this.orgEnv);
				}
				this.sky360 = document.createElement('a-sky');
				this.sky360.setAttribute('material', { fog: false });
				this.el.sceneEl.appendChild(this.sky360);
			}
			this.sky360.setAttribute("src", "#" + this.mediaEl.id);
		} else {
			if (this.sky360) {
				if (this.orgEnv) {
					this.el.sceneEl.appendChild(this.orgEnv);
				}
				this.sky360 && this.sky360.parentNode.removeChild(this.sky360);
				this.orgEnv = null;
				this.sky360 = null;
			}
		}

		this.screen.removeAttribute("stereo-texture");
		if (this.envbox) {
			this.el.sceneEl.removeChild(this.envbox);
			this.envbox.destroy();
			this.envbox = null;
		}
		this.screen.setAttribute("visible", true);
		if (idx == 0) {
		} else if (idx == 1) {
			this.screen.setAttribute("stereo-texture", { mode: "side-by-side" });
		} else if (idx == 2) {
			this.screen.setAttribute("stereo-texture", { mode: "top-and-bottom" });
		} else if (idx == 3) {
			this.sky360.removeAttribute("stereo-texture");
			this.screen.setAttribute("visible", false);
		} else if (idx == 4) {
			this.sky360.setAttribute("stereo-texture", { mode: "top-and-bottom" });
			this.screen.setAttribute("visible", false);
		} else if (idx == 5) {
			this.envbox = document.createElement('a-cubemapbox');
			this.envbox.setAttribute("src", "#" + this.mediaEl.id);
			this.envbox.setAttribute("stereo-texture", { mode: "side-by-side" });
			this.el.sceneEl.appendChild(this.envbox);
			this.screen.setAttribute("visible", false);
		}
	},
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
	},
	remove: function () {
		clearTimeout(this.loadingTimer);
		this.system.unregisterPlayer(this);
		this.screen.removeAttribute("material"); // to avoid texture leaks.
		if (this.mediaEl) this.mediaEl.parentNode.removeChild(this.mediaEl);
		this.el.removeEventListener('click', this.onclicked);
		this.setStereoMode(0);
	}
});

AFRAME.registerSystem('media-player', {
	shortcutKeys: true,
	currentPlayer: null,
	init() {
		document.addEventListener('keydown', ev => {
			if (this.shortcutKeys && !this.currentPlayer) return;
			switch (ev.code) {
				case "ArrowRight":
					this.currentPlayer.movePos(1);
					break;
				case "ArrowLeft":
					this.currentPlayer.movePos(-1);
					break;
				case "Space":
					this.currentPlayer.togglePause();
					break;
			}
		});
		setTimeout(() => {
			document.querySelectorAll('[laser-controls]').forEach(el => el.addEventListener('bbuttondown', ev => {
				if (this.currentPlayer) this.currentPlayer.movePos(-1);
			}));
			document.querySelectorAll('[laser-controls]').forEach(el => el.addEventListener('abuttondown', ev => {
				if (this.currentPlayer) this.currentPlayer.movePos(1);
			}));
		}, 0);
	},
	async playContent(item, listCursor) {
		if (this.currentPlayer === null) {
			(await window.appManager.launch('app-media-player')).addEventListener('loaded', e => {
				this.currentPlayer.playContent(item, listCursor);
			}, { once: true });
		} else {
			this.currentPlayer.playContent(item, listCursor);
		}
	},
	registerPlayer(player) {
		this.selectPlayer(player);
	},
	unregisterPlayer(player) {
		if (player == this.currentPlayer) {
			this.currentPlayer = null;
		}
	},
	selectPlayer(player) {
		this.currentPlayer = player;
	}
});

// UI for MediaPlayer
AFRAME.registerComponent('media-controller', {
	schema: {},
	init() {
		this.player = null;
		this.continuous = false;
		this.intervalId = null;
		this.continuousTimerId = null;
		this.slideshowInterval = 10000;
		this.videoInterval = 1000;
	},
	remove() {
		clearInterval(this.intervalId);
		clearTimeout(this.continuousTimerId);
	},
	setMediaPlayer(player) {
		// called from media-player
		if (this.player) return;
		this.player = player;
		this.intervalId = setInterval(() => this._updateProgress(), 500);
		var rate = parseFloat(localStorage.getItem('playbackRate'));
		this._updatePlaybackRate(isNaN(rate) ? 1.0 : rate);

		this._byName("playpause").addEventListener('click', ev => this.player.togglePause());
		this._byName("next").addEventListener('click', ev => this.player.movePos(1));
		this._byName("prev").addEventListener('click', ev => this.player.movePos(-1));
		this._byName("bak10s").addEventListener('click', ev => this.player.mediaEl.currentTime -= 10);
		this._byName("fwd10s").addEventListener('click', ev => this.player.mediaEl.currentTime += 10);
		this._byName("seek").addEventListener('change', ev => this.player.mediaEl.currentTime = ev.detail.value);
		this._byName("loopmode").addEventListener('change', ev => this._setLoopMode(ev.detail.index));
		this._byName("stereomode").addEventListener('change', ev => this._setRenderMode(ev.detail.index));
		this._byName("playbackRate").addEventListener('change', ev => {
			this._updatePlaybackRate(ev.detail.value);
			localStorage.setItem('playbackRate', ev.detail.value.toFixed(1));
		});

		this.player.el.addEventListener('media-player-ended', ev => this._continuousPlayNext(this.videoInterval));
		this.player.el.addEventListener('media-player-play', ev => {
			clearTimeout(this.continuousTimerId);
			this._byName("next").setAttribute('visible', this.player.listCursor != null);
			this._byName("prev").setAttribute('visible', this.player.listCursor != null);
		});
		this.player.el.addEventListener('media-player-loaded', ev => {
			let isVideo = this.player.mediaEl.duration != null;
			this._byName("bak10s").setAttribute('visible', isVideo);
			this._byName("fwd10s").setAttribute('visible', isVideo);
			if (!isVideo && this.continuous) {
				this._continuousPlayNext(this.slideshowInterval);
			}
		});
	},
	_continuousPlayNext(delay) {
		clearTimeout(this.continuousTimerId);
		if (this.player.listCursor) {
			this.continuousTimerId = setTimeout(() => this.continuous && this.player.movePos(1), delay);
		}
	},
	_setLoopMode(modeIndex) {
		clearTimeout(this.continuousTimerId);
		if (modeIndex == 0) {
			this.player.el.setAttribute('media-player', 'loop', false);
			this.continuous = false;
		} else if (modeIndex == 1) {
			this.player.el.setAttribute('media-player', 'loop', true);
			this.continuous = false;
		} else {
			this.player.el.setAttribute('media-player', 'loop', false);
			this.continuous = true;
		}
	},
	_setRenderMode(modeIndex) {
		this.player.setStereoMode(modeIndex);
	},
	_updateProgress() {
		if (this.player.mediaEl && this.player.mediaEl.duration) {
			this._byName("seek").setAttribute('max', this.player.mediaEl.duration);
			this._byName("seek").value = this.player.mediaEl.currentTime;
		}
	},
	_updatePlaybackRate(rate) {
		this._byName("playbackRateText").setAttribute("value", rate.toFixed(1));
		this._byName("playbackRate").value = rate;
		this.player.el.setAttribute('media-player', 'playbackRate', rate);
	},
	_byName(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
});


AFRAME.registerComponent('xycanvas', {
	schema: {
		width: { default: 16 },
		height: { default: 16 }
	},
	init() {
		this.canvas = document.createElement("canvas");

		// to avoid texture cache conflict in a-frame.
		this.canvas.id = "_CANVAS" + Math.random();
		let src = new THREE.CanvasTexture(this.canvas);
		this.updateTexture = () => {
			src.needsUpdate = true;
		};

		this.el.setAttribute('material', { shader: "flat", npot: true, src: src, transparent: true });
	},
	update() {
		this.canvas.width = this.data.width;
		this.canvas.height = this.data.height;
	}
});

AFRAME.registerComponent('stereo-texture', {
	schema: {
		mode: { default: "side-by-side", oneOf: ["side-by-side", "top-and-bottom"] },
		swap: { default: false }
	},
	init() {
		this._componentChanged = this._componentChanged.bind(this);
		this._checkVrMode = this._checkVrMode.bind(this);
		this.el.addEventListener('componentchanged', this._componentChanged, false);
		this.el.sceneEl.addEventListener('enter-vr', this._checkVrMode, false);
		this.el.sceneEl.addEventListener('exit-vr', this._checkVrMode, false);
	},
	update() {
		this._reset();
		if (this.el.getObject3D("mesh") === null) return;
		let lg = this._makeObj(1, "stereo-left").geometry;
		let rg = this._makeObj(2, "stereo-right").geometry;
		let luv = lg.getAttribute("uv");
		let ruv = rg.getAttribute("uv");
		let d = this.data.swap ? 0.5 : 0;
		if (this.data.mode == "side-by-side") {
			lg.setAttribute("uv", new THREE.BufferAttribute(luv.array.map((v, i) => i % 2 == 0 ? v / 2 + d : v), luv.itemSize, luv.normalized));
			rg.setAttribute("uv", new THREE.BufferAttribute(ruv.array.map((v, i) => i % 2 == 0 ? v / 2 + 0.5 - d : v), ruv.itemSize, ruv.normalized));
		} else if (this.data.mode == "top-and-bottom") {
			lg.setAttribute("uv", new THREE.BufferAttribute(luv.array.map((v, i) => i % 2 == 1 ? v / 2 + 0.5 - d : v), luv.itemSize, luv.normalized));
			rg.setAttribute("uv", new THREE.BufferAttribute(ruv.array.map((v, i) => i % 2 == 1 ? v / 2 + d : v), ruv.itemSize, ruv.normalized));
		}

		this.el.getObject3D("mesh").visible = false;
		this._checkVrMode();
	},
	remove() {
		this.el.removeEventListener('componentchanged', this._componentChanged, false);
		this.el.sceneEl.removeEventListener('enter-vr', this._checkVrMode, false);
		this.el.sceneEl.removeEventListener('exit-vr', this._checkVrMode, false);
		this._reset();
	},
	_checkVrMode() {
		let leftObj = this.el.getObject3D("stereo-left");
		if (leftObj != null) {
			this.el.sceneEl.is('vr-mode') ? leftObj.layers.disable(0) : leftObj.layers.enable(0);
		}
	},
	_makeObj(layer, name) {
		let obj = this.el.getObject3D("mesh").clone();
		obj.geometry = obj.geometry.clone();
		obj.layers.set(layer);
		this.el.setObject3D(name, obj);
		return obj;
	},
	_reset() {
		if (this.el.getObject3D("stereo-left") != null) {
			this.el.getObject3D("mesh").visible = true;
			this.el.removeObject3D("stereo-left");
			this.el.removeObject3D("stereo-right");
		}
	},
	_componentChanged(ev) {
		if (ev.detail.name === 'geometry' || ev.detail.name === 'material') {
			this.update();
		}
	}
});

AFRAME.registerGeometry('cubemapbox', {
	// TODO: eac https://blog.google/products/google-ar-vr/bringing-pixels-front-and-center-vr-video/
	schema: {
		height: { default: 1, min: 0 },
		width: { default: 1, min: 0 },
		depth: { default: 1, min: 0 },
		eac: { default: false }
	},
	init(data) {
		let d = 0.001;
		let uv = [[
			new THREE.Vector2(d, 1), // px
			new THREE.Vector2(.5 - d, 1),
			new THREE.Vector2(.5 - d, 2.0 / 3),
			new THREE.Vector2(d, 2.0 / 3),
		], [
			new THREE.Vector2(d, 1.0 / 3),  // nx
			new THREE.Vector2(.5 - d, 1.0 / 3),
			new THREE.Vector2(.5 - d, 0),
			new THREE.Vector2(d, 0),
		], [
			new THREE.Vector2(1 - d, 1), // py
			new THREE.Vector2(1 - d, 2.0 / 3),
			new THREE.Vector2(.5 + d, 2.0 / 3),
			new THREE.Vector2(.5 + d, 1),
		], [
			new THREE.Vector2(1 - d, 1.0 / 3), // ny
			new THREE.Vector2(1 - d, 0),
			new THREE.Vector2(.5 + d, 0),
			new THREE.Vector2(.5 + d, 1.0 / 3),
		], [
			new THREE.Vector2(1 - d, 2.0 / 3), // pz
			new THREE.Vector2(1 - d, 1.0 / 3),
			new THREE.Vector2(.5 + d, 1.0 / 3),
			new THREE.Vector2(.5 + d, 2.0 / 3),
		], [
			new THREE.Vector2(d, 2.0 / 3), // nz
			new THREE.Vector2(.5 - d, 2.0 / 3),
			new THREE.Vector2(.5 - d, 1.0 / 3),
			new THREE.Vector2(d, 1.0 / 3),
		]];
		let geometry = new THREE.BoxGeometry(data.width, data.height, data.depth);
		for (let i = 0; i < 6; i++) {
			geometry.faceVertexUvs[0][i * 2] = [uv[i][0], uv[i][1], uv[i][3]];
			geometry.faceVertexUvs[0][i * 2 + 1] = [uv[i][1], uv[i][2], uv[i][3]];
		}
		this.geometry = geometry;
	}
});


AFRAME.registerPrimitive('a-cubemapbox', {
	defaultComponents: {
		material: { side: 'back', fog: false, shader: 'flat' },
		geometry: { primitive: 'cubemapbox', width: 200, height: 200, depth: 200 },
	},
	mappings: {
		src: 'material.src',
		width: 'geometry.width',
		height: 'geometry.height',
		depth: 'geometry.depth',
	}
});


AFRAME.registerComponent('atlas', {
	schema: {
		src: { default: "" },
		index: { default: 0 },
		cols: { default: 1 },
		rows: { default: 1 },
		margin: { default: 0.01 }
	},
	update() {
		let u = (this.data.index % this.data.cols + this.data.margin) / this.data.cols;
		let v = (this.data.rows - 1 - Math.floor(this.data.index / this.data.cols) + this.data.margin) / this.data.rows;
		this.el.setAttribute("material", {
			shader: 'msdf2',
			transparent: true,
			repeat: { x: 1 / this.data.cols - this.data.margin, y: 1 / this.data.rows - this.data.margin },
			src: this.data.src
		});
		this.el.setAttribute("material", "offset", { x: u, y: v });
	},
});

AFRAME.registerShader('msdf2', {
	schema: {
		diffuse: { type: 'color', is: 'uniform', default: "#ffffff" },
		opacity: { type: 'number', is: 'uniform', default: 1.0 },
		src: { type: 'map', is: 'uniform' },
		offset: { type: 'vec2', is: 'uniform', default: { x: 0, y: 0 } },
		repeat: { type: 'vec2', is: 'uniform', default: { x: 1, y: 1 } },
		msdfUnit: { type: 'vec2', is: 'uniform', default: { x: 0.1, y: 0.1 } },
	},
	init: function (data) {
		this.attributes = this.initVariables(data, 'attribute');
		this.uniforms = THREE.UniformsUtils.merge([this.initVariables(data, 'uniform'), THREE.UniformsLib.fog]);
		this.material = new THREE.ShaderMaterial({
			uniforms: this.uniforms,
			flatShading: true,
			fog: true,
			vertexShader: `
			#define USE_MAP
			#define USE_UV
			#include <common>
			#include <uv_pars_vertex>
			#include <color_pars_vertex>
			#include <fog_pars_vertex>
			#include <clipping_planes_pars_vertex>
			uniform vec2 offset;
			uniform vec2 repeat;
			void main() {
				vUv = uv * repeat + offset;
				#include <color_vertex>
				#include <begin_vertex>
				#include <project_vertex>
				#include <worldpos_vertex>
				#include <clipping_planes_vertex>
				#include <fog_vertex>
			}`,
			fragmentShader: `
			// #extension GL_OES_standard_derivatives : enable
			uniform vec3 diffuse;
			uniform float opacity;
			uniform vec2 msdfUnit;
			uniform sampler2D src;
			#define USE_MAP
			#define USE_UV
			#include <common>
			#include <color_pars_fragment>
			#include <uv_pars_fragment>
			#include <fog_pars_fragment>
			#include <clipping_planes_pars_fragment>
			float median(float r, float g, float b) {
				return max(min(r, g), min(max(r, g), b));
			}
			void main() {
				#include <clipping_planes_fragment>
				vec4 texcol = texture2D( src, vUv );
				float sigDist = median(texcol.r, texcol.g, texcol.b) - 0.5;
				sigDist *= dot(msdfUnit, 0.5/fwidth(vUv));

				vec4 diffuseColor = vec4( diffuse, opacity * clamp(sigDist + 0.5, 0.0, 1.0));
				#include <color_fragment>
				#include <alphatest_fragment>
				gl_FragColor = diffuseColor;
				#include <fog_fragment>
			}`
		});
	}
});
