"use strict";

class MeshGen {
	constructor() {
		this.alias = {
			sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
			asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan',
			abs: 'Math.abs', log: 'Math.log', log10: 'Math.log10', pi: 'Math.PI', e: 'Math.E',
			linspace: "lib.linspace", arange: "lib.arange", plot: "lib.plot"
		};
		this.preset = {
			x: "linspace(-1, 1, 41)",
			y: "linspace(-1, 1, 41)",
			z: "linspace(-1, 1, 41)",
			color: "([0,1,0])",
		};
		this.preset2 = {
			u: "linspace(0, 2*pi, 41)",
			v: "linspace(0, pi, 21)",
			x: "r * sin(v)*cos(u)",
			z: "r * sin(v)*sin(u)",
			y: "r * cos(v)",
			color: "([u,1,v])",
		};
	}

	/**
	 * @param {string} s 
	 */
	getDepends(s) {
		return Array.from(s.matchAll(/((?<=(^|[^\w.]))[a-z]\w*)/g)).map(a => a[1]);
	}

	/**
	 * @param {string} s 
	 */
	isArray(s) {
		return s.includes('linspace') || s.includes('arange') || s.startsWith('[');
	}

	/**
	 * @param {string} src 
	 */
	getVars(src) {
		let vars = {};
		for (let line of src.split(/[\n;]/)) {
			let eq = line.split('=').map(x => x.trim());
			for (let i = 0; i < eq.length - 1; i++) {
				vars[eq[i]] = eq[eq.length - 1];
			}
		}
		return vars;
	}

	/**
	 * @param {object} vars
	 * @param {string} exp 
	 */
	compile(vars, exp, preloop) {
		vars = Object.assign({}, vars['r'] ? this.preset2 : this.preset, vars);
		let resolved = Object.keys(this.alias);
		let lines = [];
		let nest = 0;
		let resolve = (name) => {
			if (resolved.includes(name)) { return; }
			if (!vars[name]) { throw name; }
			let e = vars[name];
			delete vars[name];
			for (let r of this.getDepends(e)) {
				resolve(r);
			}
			if (this.isArray(e)) {
				preloop && lines.push("  ".repeat(nest) + preloop);
				lines.push("  ".repeat(nest) + `for (let ${name} of ${e}) {`);
				nest++;
			} else {
				lines.push("  ".repeat(nest) + `let ${name} = ${e};`);
			}
			resolved.push(name);
		}
		this.getDepends(exp).forEach(resolve);
		lines.push("  ".repeat(nest) + exp + ";");
		lines.push("}".repeat(nest));
		// @ts-ignore
		return lines.join("\n").replaceAll(/(?<=(^|[^\w.]))[a-z]\w*/g, s => this.alias[s] || s);
	}
	run(src, plot, exp, reset) {
		const lib = {
			linspace: function* (min, max, count = 100) {
				for (let i = 0; i < count; i++) {
					yield min + (max - min) * i / (count - 1);
				}
			},
			arange: function* (start = 0, end = 100, step = 1) {
				for (let i = start; i < end; i += step) {
					yield i;
				}
			},
			plot: plot
		};
		return eval(this.compile(this.getVars(src), exp, reset ? 'reset()' : ''));
	}

	/**
	 * @param {string} src 
	 */
	getPoints(src, options = {}) {
		const points = [];
		const colors = [];
		let lastReset = 0;

		function add_point(p, c = null) {
			if (points.length > 1000000) throw "too many points";
			if (c) { colors.push(c); }
			points.push(p);
		}
		this.run(src, add_point, options.color ? "plot([x,y,z], color)" : "plot([x,y,z])", () => lastReset = points.length);
		let result = { position: points };
		if (options.color) {
			result.color = colors;
		}
		if (options.mesh) {
			let linepoints = points.length - lastReset, lines = points.length / linepoints;
			let indices = [];
			result.meshIndex = indices;
			for (let i = 0; i < lines - 1; i++) {
				for (let j = 0; j < linepoints - 1; j++) {
					indices.push(i * linepoints + j);
					indices.push(i * linepoints + j + 1);
					indices.push((i + 1) * linepoints + j + 1);

					indices.push((i + 1) * linepoints + j);
					indices.push(i * linepoints + j);
					indices.push((i + 1) * linepoints + j + 1);

				}
			}
		}
		if (options.wire) {
			let linepoints = points.length - lastReset, lines = points.length / linepoints;
			let step = options.wireStep || 2;
			let indices = [];
			result.wireIndex = indices;
			for (let i = 0; i < lines; i += step) {
				for (let j = 0; j < linepoints - 1; j++) {
					indices.push(i * linepoints + j);
					indices.push(i * linepoints + j + 1);
				}
			}
			for (let j = 0; j < linepoints; j += step) {
				for (let i = 0; i < lines - 1; i++) {
					indices.push(i * linepoints + j);
					indices.push((i + 1) * linepoints + j);
				}
			}
		}
		return result;
	}
}


AFRAME.registerComponent('calc3d', {
	schema: {},
	init() {
		let replace = { ':=': '=' };
		/** @type {import("aframe").Entity<any> & {value: string}} */
		let inputEl = this._elByName('calc3d-input');
		let targetEl = this.el.sceneEl; // TODO
		inputEl.addEventListener('change', () => {
			let lines = inputEl.value.split('\n');
			if (lines[lines.length - 1].includes("=")) {
				this._elByName('exe-button').setAttribute('label', 'Ent');
			} else {
				this._elByName('exe-button').setAttribute('label', '=');
			}
		});
		for (let b of this.el.querySelectorAll('.calc3d-button')) {
			b.addEventListener('click', ev => {
				let s = b.getAttribute('label');
				inputEl.value += replace[s] || s;
				let editor = inputEl.components.texteditor;
				editor && editor.caret.move(0, s.length);
				inputEl.focus();
			});
		}
		this._elByName('del-button').addEventListener('click', ev =>
			inputEl.value = inputEl.value.slice(0, -1)
		);
		this._elByName('clear-button').addEventListener('click', ev => {
			inputEl.value = '';
			this.el.sceneEl.removeAttribute('calc3d-canvas');
		});
		this._elByName('exe-button').addEventListener('click', ev => {
			let meshGen = new MeshGen();
			let src = inputEl.value.trim();
			let lines = src.split('\n');
			if (lines[lines.length - 1].includes("=") || lines[lines.length - 1].includes("->")) {
				inputEl.value = src + "\n";
			} else {
				try {
					let result = meshGen.run(src, null, lines[lines.length - 1]);
					if (result != null) { inputEl.value = src + "\n-> " + result + "\n"; }
				} catch (e) {
					inputEl.value = src + "\n-> Err\n";
				}
			}
			let editor = inputEl.components.texteditor;
			editor && editor.caret.move(999, 0);
			inputEl.focus();
		});
		this._elByName('plot-button').addEventListener('click', ev => {
			targetEl.setAttribute('calc3d-canvas', { src: inputEl.value });
		});
		this._elByName('mode-line').addEventListener('click', ev => {
			targetEl.setAttribute('calc3d-canvas', { mode: 'line' });
		});
		this._elByName('mode-points').addEventListener('click', ev => {
			targetEl.setAttribute('calc3d-canvas', { mode: 'point' });
		});
		this._elByName('mode-faces').addEventListener('click', ev => {
			targetEl.setAttribute('calc3d-canvas', { mode: 'mesh' });
		});
	},
	remove() {
	},
	_elByName(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
});

AFRAME.registerComponent('calc3d-canvas', {
	schema: {
		mode: { default: 'line' },
		src: { default: '' },
	},
	init() {
		this._rootObj = new THREE.Group();
		this.el.setObject3D('calc3d-canvas', this._rootObj);
	},
	remove() {
		this.el.removeObject3D('calc3d-canvas');
	},
	update() {
		this.plot(this.data.src, this.data.mode);
	},
	plot(src, mode) {
		while (this._rootObj.children.length) {
			this._rootObj.remove(this._rootObj.children[0]);
		}
		if (src.trim() == '') { return; }
		let meshGen = new MeshGen();
		let figure = meshGen.getPoints(src, { wire: mode == 'line', mesh: mode == 'mesh' });
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(figure.position.flat(1)), 3));
		if (mode == 'line') {
			geometry.setIndex(figure.wireIndex);
			const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 0.025 });
			const mesh = new THREE.LineSegments(geometry, material);
			this._rootObj.add(mesh);
		} else if (mode == 'mesh') {
			geometry.setIndex(figure.meshIndex);
			geometry.computeVertexNormals();
			const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
			const mesh = new THREE.Mesh(geometry, material);
			this._rootObj.add(mesh);
		} else {
			const material = new THREE.PointsMaterial({ color: 0x00ff00, size: 0.025 });
			const mesh = new THREE.Points(geometry, material);
			this._rootObj.add(mesh);
		}
	},
});
