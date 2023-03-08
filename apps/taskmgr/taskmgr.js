'use strict';

AFRAME.registerComponent('task-manager', {
	schema: {},
	init() {
		this.el.addEventListener('app-launch', async (ev) => {
			this._appManager = ev.detail.appManager;
			this._initRunningAppList();
		}, { once: true });
	},
	_initRunningAppList() {
		this._elByName('kill-all-button').addEventListener('click', (ev) => {
			this._appManager.killAll();
		});
		this._elByName('refresh-button').addEventListener('click', (ev) => {
			this._updateRunningAppList();
		});
		this.listEl = this._elByName('running-app-list');
		let listEl = this.listEl;
		let list = listEl.components.xylist;
		let self = this;
		list.setAdapter({
			create() {
				let el = document.createElement('a-xylabel');
				el.setAttribute('width', 4.5);
				el.setAttribute('height', 0.4);
				el.setAttribute('xyrect', {});
				el.setAttribute('xylabel', { wrapCount: 16, renderingMode: 'canvas' });
				let unloadButton = document.createElement('a-xybutton');
				unloadButton.setAttribute('width', 0.3);
				unloadButton.setAttribute('height', 0.3);
				unloadButton.setAttribute('position', { x: 3.0, y: 0, z: 0.05 });
				unloadButton.setAttribute('label', "X");
				unloadButton.addEventListener('click', (ev) => {
					let app = self.runnings[el.dataset.index];
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
			this.runnings[ev.detail.index].el.focus();
		});

		this._updateRunningAppList();
	},
	_updateRunningAppList() {
		let apps = [];
		for (let el of this._appManager.getRunningApps()) {
			let name = el.tagName;
			if (el.components.xywindow) {
				name = el.components.xywindow.data.title;
			}
			apps.push({ el: el, name: name });
		}
		this.runnings = apps;
		this.listEl.components.xylist.setContents(apps);
	},
	/**
	 * @param {string} name 
	 */
	_elByName(name) {
		return (this.el.querySelector("[name=" + name + "]"));
	}
});
