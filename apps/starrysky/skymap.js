"use strict";

async function instantiate(id, parent) {
	let template = document.getElementById(id);
	let wrapper = document.createElement('div');
	wrapper.innerHTML = template.innerHTML;
	var el = wrapper.firstElementChild;
	(parent || document.querySelector('a-scene')).appendChild(el);
	return el;
}

AFRAME.registerComponent('instantiate-on-click', {
	schema: {
		template: { type: 'string', default: '' },
		id: { type: 'string', default: '' }
	},
	init() {
		this.el.addEventListener('click', async (ev) => {
			if (this.data.id && document.getElementById(this.data.id)) {
				this._updateRotation(document.getElementById(this.data.id));
				return;
			}
			let el = await instantiate(this.data.template);
			if (this.data.id) {
				el.id = this.data.id;
			}
			if (!ev.detail.cursorEl || !ev.detail.cursorEl.components.raycaster) {
				return;
			}
			var raycaster = ev.detail.cursorEl.components.raycaster.raycaster;
			var rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), raycaster.ray.direction);
			var origin = raycaster.ray.origin;

			el.addEventListener('loaded', (ev) => {
				// @ts-ignore
				let pos = new THREE.Vector3(0, 0, el.getAttribute('position').z).applyQuaternion(rot);
				// @ts-ignore
				el.setAttribute('position', pos.add(origin));
				this._updateRotation(el);
			}, { once: true });
		});
	},
	_updateRotation(el) {
		let cameraPosition = el.sceneEl.camera.getWorldPosition(new THREE.Vector3());
		let targetPosition = el.object3D.getWorldPosition(new THREE.Vector3());
		let tr = new THREE.Matrix4().lookAt(cameraPosition, targetPosition, new THREE.Vector3(0, 1, 0));
		el.object3D.setRotationFromMatrix(tr);
	}
});

AFRAME.registerComponent('sky-pointer', {
	schema: {
		event: { default: "gripdown" },
		lineColor: { default: '#3060a0' }
	},
	init: function () {
		let sphereEl = document.querySelector("[celestial-sphere]");
		let component = 'celestial-cursor';
		this.el.addEventListener(this.data.event, ev => {
			let c = sphereEl.getAttribute(component);
			if (!c || c.raycaster != this.el) {
				sphereEl.setAttribute(component, { raycaster: this.el });
				this.el.setAttribute('line', { color: '#3050b0' });
			} else {
				sphereEl.removeAttribute(component);
				this.el.setAttribute('line', { color: this.data.lineColor });
			}
		});
	}
});

AFRAME.registerComponent('starrysky-menu', {
	schema: {
	},
	init() {
		let sphereEl = document.querySelector("[celestial-sphere]");
		this.timer = setInterval(() => this._refreshTime(), 1000);
		this._byName('constellations').addEventListener('click', (e) => {
			let v = !sphereEl.getAttribute("celestial-sphere").constellation;
			sphereEl.setAttribute("celestial-sphere", "constellation", v);
			this._byName('constellations').querySelector("a-plane")?.setAttribute("material", "diffuse", v ? 0x44aaff : 0xffffff);
		});
		this._byName('drawgrid').addEventListener('click', (e) => {
			let v = !sphereEl.getAttribute("celestial-sphere").grid;
			sphereEl.setAttribute("celestial-sphere", "grid", v);
			this._byName('drawgrid').querySelector("a-plane")?.setAttribute("material", "diffuse", v ? 0x44aaff : 0xffffff);
			if (sphereEl.components['celestial-sphere'].constellationBounds) sphereEl.components['celestial-sphere'].constellationBounds.visible = v;
		});
		this._byName('drawsol').addEventListener('click', (e) => {
			let v = !sphereEl.getAttribute("celestial-sphere").solarsystem;
			sphereEl.setAttribute("celestial-sphere", "solarsystem", v);
			this._byName('drawsol').querySelector("a-plane")?.setAttribute("material", "diffuse", v ? 0x44aaff : 0xffffff);
		});
		this._byName('speed').addEventListener('change', ev => {
			sphereEl.setAttribute("celestial-sphere", "speed", [1, 60, 300, 3600, 0][ev.detail.index]);
		});
		this._byName('time-now').addEventListener('click', (e) => {
			sphereEl.setAttribute("celestial-sphere", "timeMs", Date.now());
		});
		this._byName('time-uy').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setFullYear(d.getFullYear() + 1));
		});
		this._byName('time-dy').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setFullYear(d.getFullYear() - 1));
		});
		this._byName('time-um').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setMonth(d.getMonth() + 1));
		});
		this._byName('time-dm').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setMonth(d.getMonth() - 1));
		});
		this._byName('time-ud').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setDate(d.getDate() + 1));
		});
		this._byName('time-dd').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setDate(d.getDate() - 1));
		});
		this._byName('time-uh').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setHours(d.getHours() + 1));
		});
		this._byName('time-dh').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setHours(d.getHours() - 1));
		});
		this._byName('time-ui').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setMinutes(d.getMinutes() + 1));
		});
		this._byName('time-di').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setMinutes(d.getMinutes() - 1));
		});
		this._byName('time-us').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setSeconds(d.getSeconds() + 1));
		});
		this._byName('time-ds').addEventListener('click', (e) => {
			this._modifyTime(sphereEl, d => d.setSeconds(d.getSeconds() - 1));
		});
		this._byName('selector').addEventListener('click', ev => {
			let component = 'celestial-cursor';
			let v = !sphereEl.hasAttribute(component);
			if (v) {
				sphereEl.setAttribute(component, { raycaster: ev.detail.cursorEl });
			} else {
				sphereEl.removeAttribute(component);
			}
			this._byName('selector').querySelector("a-plane")?.setAttribute("material", "diffuse", v ? 0x44aaff : 0xffffff);
		});
	},
	remove() {
		clearInterval(this.timer);
	},
	_modifyTime(sphereEl, f) {
		let d = new Date(sphereEl.getAttribute("celestial-sphere").timeMs);
		f(d);
		sphereEl.setAttribute("celestial-sphere", "timeMs", d.getTime());
		this._refreshTime();
	},
	_refreshTime() {
		let t = new Date(document.querySelector("[celestial-sphere]").getAttribute("celestial-sphere").timeMs);
		let d2 = n => ("0" + n).substr(-2);
		let timeStr = [t.getFullYear(), d2(t.getMonth() + 1), d2(t.getDate())].join("-") + " " +
			[d2(t.getHours()), d2(t.getMinutes()), d2(t.getSeconds())].join(":");
		this._byName('time-text').setAttribute("value", timeStr);
	},
	_byName(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
});

AFRAME.registerComponent('celestial-cursor', {
	schema: {
		raycaster: { type: 'selector', default: "[raycaster]" }
	},
	init() {
		let sphereEl = document.querySelector('[celestial-sphere]');
		this.sphere = sphereEl.components['celestial-sphere'];
		this.orgconstellation = this.sphere.data.constellation;
		this.balloonEl = document.createElement('a-entity');
		this.el.sceneEl.appendChild(this.balloonEl);
		this.labelEl = document.createElement('a-xylabel');
		this.labelEl.setAttribute("xyrect", { width: 4, height: 0.4 });
		this.labelEl.setAttribute("xylabel", { align: "left", xOffset: 2.2 });
		this.labelEl.setAttribute("position", { x: 0, y: 0.2, z: 0 });
		this.coodEl = document.createElement('a-xylabel');
		this.coodEl.setAttribute("xyrect", { width: 4, height: 0.4 });
		this.coodEl.setAttribute("xylabel", { align: "left", xOffset: 2.2 });
		this.coodEl.setAttribute("position", { x: 0, y: -0.2, z: 0 });
		this.balloonEl.appendChild(this.labelEl);
		this.balloonEl.appendChild(this.coodEl);
		sphereEl.setAttribute('celestial-sphere', 'constellation', true);
		this.selected = null;
	},
	tick() {
		let raycaster = this.data.raycaster.components.raycaster.raycaster;
		let coord = this.sphere.getCoord(raycaster.ray.direction);
		let starData = this.sphere.findStar(raycaster.ray.direction, 0.9998);
		if (starData) {
			coord = [starData.ra, starData.dec];
			this.sphere.setCursor(starData.ra, starData.dec);
		} else {
			this.sphere.clearCursor();
		}
		let c = this.sphere.getConstellation(coord[0], coord[1]);
		if (c !== this.selected) {
			this.selected = c;
			this.sphere.selectConstellation(c ? c.name : null);
		}
		let displayName = c ? (navigator.language.startsWith("ja") ? c.nameJa : c.nameEn) + ` (${c.name})` : "";
		if (starData) {
			let starName = (navigator.language.startsWith("ja") ? starData.nameJa || starData.nameEn : starData.nameEn);
			if (starData.type == "solar") {
				displayName = starName;
			} else {
				displayName = starName + " :" + displayName;
			}
		}
		let defformat = (d, s) => {
			let dd = Math.abs(d), d1 = Math.floor(dd), d2 = Math.floor((dd - d1) * 60);
			return `${d1}${s}${("0" + d2).slice(-2)}`;
		};
		this.coodEl.setAttribute('value', "RA:" + defformat(coord[0] * 24 / 360, "h") + "m Dec:"
			+ (coord[1] < 0 ? "-" : "+") + defformat(coord[1], " ") + "'");
		this.labelEl.setAttribute('value', displayName);
		let ray = raycaster.ray;
		this.balloonEl.object3D.position.copy(ray.origin.clone().add(ray.direction.clone().multiplyScalar(10)));
		this.balloonEl.object3D.lookAt(ray.origin);
	},
	remove: function () {
		this.el.sceneEl.removeChild(this.balloonEl);
		this.sphere.selectConstellation(null);
		this.sphere.el.setAttribute('celestial-sphere', 'constellation', this.orgconstellation);
	}
});
