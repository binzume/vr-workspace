'use strict';

AFRAME.registerComponent('task-manager', {
	schema: {},
	init() {
		this.el.addEventListener('app-start', async (ev) => {
			this._appManager = ev.detail.appManager;
			this._initRunningAppList();
			this.el.addEventListener('app-save-state', async (ev) => {
				ev.detail.skip();
			});
		}, { once: true });
	},
	remove() {
		clearInterval(this._updateTimer);
	},
	_initRunningAppList() {
		this._elByName('kill-all-button').addEventListener('click', (ev) => {
			this._appManager.killAll();
		});
		this._elByName('save-session-button').addEventListener('click', (ev) => {
			let sessionJson = JSON.stringify(this._appManager.saveWorkspace());
			localStorage.setItem('taskmgr-session01', sessionJson);
			console.log(sessionJson);
		});
		this._elByName('load-session-button').addEventListener('click', (ev) => {
			let sessionJson = localStorage.getItem('taskmgr-session01');
			if (sessionJson) {
				this._appManager.restoreWorkspace(JSON.parse(sessionJson));
			}
		});

		this.listEl = this._elByName('running-app-list');
		let listEl = this.listEl;
		let list = listEl.components.xylist;
		let self = this;
		list.setAdapter({
			create() {
				let xyrect = self.el.components.xyrect;
				let containerWidth = xyrect.width;
				let el = document.createElement('a-xybutton');
				el.setAttribute('width', containerWidth - 1);
				el.setAttribute('height', 0.4);
				el.setAttribute('xyrect', {});
				el.setAttribute('xylabel', { wrapCount: 28, align: 'left', renderingMode: 'canvas' });
				let unloadButton = document.createElement('a-xybutton');
				unloadButton.setAttribute('width', 0.3);
				unloadButton.setAttribute('height', 0.3);
				unloadButton.setAttribute('position', { x: (containerWidth / 2) - 0.2, y: 0, z: 0.05 });
				unloadButton.setAttribute('label', "X");
				unloadButton.addEventListener('click', (ev) => {
					let app = self._runnings[el.dataset.index];
					app.el.parentNode.removeChild(app.el);
					self._updateRunningAppList();
				});
				el.appendChild(unloadButton);
				return el;
			},
			bind(position, el, contents) {
				let app = contents[position];
				el.dataset.index = position;
				el.setAttribute('xylabel', { value: app.name });
			}
		});
		listEl.addEventListener('clickitem', (ev) => {
			this._runnings[ev.detail.index].el.focus();
		});

		this._updateRunningAppList();
		this._updateTimer = setInterval(() => this._updateRunningAppList(), 1000);
	},
	_updateRunningAppList() {
		let apps = [];
		for (let el of this._appManager.getRunningApps()) {
			let name = el.tagName;
			if (el.components.vrapp && el.components.vrapp.app) {
				name = el.components.vrapp.app.name;
			}
			if (el.components.xywindow) {
				name += ": " + el.components.xywindow.data.title;
			}
			apps.push({ el: el, name: name });
		}
		this._runnings = apps;
		this.listEl.components.xylist.setContents(apps);
	},
	/**
	 * @param {string} name 
	 */
	_elByName(name) {
		return (this.el.querySelector("[name=" + name + "]"));
	}
});
