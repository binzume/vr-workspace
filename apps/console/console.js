// @ts-check
(function () {
	class JSNode {
		constructor(obj, name) {
			this._obj = obj;
			this.name = name;
		}
		_mknode(o, n) { return o instanceof Element ? new DOMNode(o, n) : new JSNode(o, n); }
		children() { return Object.entries(this._obj).map(([k, v]) => this._mknode(v, k)); }
		find(/** @type {string} */s) {
			if (this._obj[s]) { return this._mknode(this._obj[s], s); }
			let _ = this._obj;
			let r = eval(s.replace(/(?<![\w\.])(?=\.[a-zA-Z])/, '_'));
			return r != null && this._mknode(r, s);
		}
		evaluate() { return this._obj; }
		equals(o) { return o._obj === this._obj; }
		describe() { return '' + this._obj; }
	}
	class DOMNode extends JSNode {
		constructor(/** @type {Element} */obj, name) {
			super(obj, name || obj.tagName);
		}
		children() { return Array.from(this._obj.children).map((c) => new DOMNode(c, null)); }
		find(/** @type {string} */s) {
			try {
				let el = this._obj.querySelector(s);
				if (el) {
					return new DOMNode(el, null);
				}
			} catch { }
			return super.find(s);
		}
		describe() { return '<' + this.name + '>'; }
	}
	class RootNode {
		constructor(nodes) { this._children = nodes; this.name = ''; }
		children() { return this._children; }
		find(/** @type {string} */s) { return this._children.find(n => n.name === s); }
		evaluate() { return null; }
		equals(o) { return o === this; }
		describe() { return ''; }
	}
	class SimpleShell {
		constructor(con = null) {
			let wd = new JSNode(globalThis, 'js');
			/** @type {(JSNode | DOMNode | RootNode)[]} */
			this._path = [new RootNode([wd]), wd];
			/** @type {Console} */
			this._console = con || console;
		}
		currentNode() {
			return this._path[this._path.length - 1];
		}
		execute(/** @type {string} */ cmd) {
			this._console.log('>', cmd);
			let c = cmd.split(' ', 2);
			if (c[0] == 'cd') {
				if (c[1]) {
					this._path = this._resolve(c[1], this._path);
				} else {
					this._path = [this._path[0]];
				}
				return;
			} else if (c[0] == 'pwd') {
				this._console.log(this._path.map(p => p.name).join('/'));
				return;
			} else if (c[0] == 'ls') {
				for (let p of this.currentNode().children()) {
					this._console.log(p.name, ':', p.describe());
				}
				return;
			} else if (c[0] == 'echo') {
				cmd = cmd.substring(c[0].length + 1)
			}
			if (cmd) {
				let r = this._resolve(cmd, this._path.slice());
				if (r) {
					this._console.log(r.pop().evaluate());
				}
			}
		}
		_resolve(s, path) {
			if (!this._tryadd(s, path)) {
				for (let name of s.split('/')) {
					if (!this._tryadd(name, path)) { throw 'not found'; }
				}
			}
			return path;
		}
		_tryadd(name, path) {
			let n = this._find(name.trim(), path);
			if (!n) { return null; }
			let p = path.findIndex(x => x.equals(n));
			if (p >= 0) {
				n = path.splice(p)[0];
			}
			path.push(n);
			return path;
		}
		_find(name, path) {
			if (!name) {
				return null;
			} else if (name == '.') {
				return path[path.length - 1];
			} else if (name == '..' && path.length >= 1) {
				return path[path.length - 2];
			}
			return path[path.length - 1].find(name);
		}
	}
	AFRAME.registerComponent('debug-log', {
		schema: {
			timestamp: { default: true },
			lines: { default: 20 }
		},
		log: [], // shared
		orgLog: null,
		_shell: null,
		init() {
			this._shell = new SimpleShell();
			this.orgLog = console.log;
			console.log = this._addLog.bind(this);

			this._onerror = this._onerror.bind(this);
			window.addEventListener('error', this._onerror);
			window.addEventListener('unhandledrejection', this._onerror);

			let commandEl = this._elByName('command');
			commandEl && commandEl.addEventListener('keydown', (ev) => {
				if (ev.code == 'Enter') {
					// @ts-ignore
					this._shell.execute(commandEl.value);
					// @ts-ignore
					commandEl.value = '';
				}
			});
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
			let logEl = this._elByName('debug-text');
			logEl.setAttribute('value', this.log.join("\n"));
		},
		_onerror(ev) {
			let msg = ev.reason ? ev.reason.message + ' ' + ev.reason.stack : ev.message;
			if (ev.filename) {
				msg += ` ${ev.filename}:${ev.line}`;
			}
			this._addLog("ERROR: " + msg);
		},
		remove() {
			window.removeEventListener('error', this._onerror);
			window.removeEventListener('unhandledrejection', this._onerror);
			console.log = this.orgLog;
		},
		/**
		 * @param {string} name
		 * @returns {AFRAME.AEntity}
		 */
		_elByName(name) {
			return this.el.querySelector("[name=" + name + "]");
		}
	});
})();
