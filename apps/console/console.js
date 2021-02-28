// @ts-check

AFRAME.registerComponent('debug-log', {
	schema: {
		timestamp: { default: true },
		lines: { default: 12 }
	},
	log: [], // shared
	orgLog: null,
	init() {
		this.orgLog = console.log;
		console.log = this._addLog.bind(this);

		this._onerror = this._onerror.bind(this);
		window.addEventListener('error', this._onerror);
		window.addEventListener('unhandledrejection', this._onerror);

		let commandEl = this._elByName('command');
		commandEl && commandEl.addEventListener('keydown', (ev) => {
			if (ev.code == 'Enter') {
				// @ts-ignore
				let cmd = commandEl.value;
				console.log('>', cmd);
				if (cmd) {
					console.log(eval(cmd));
				}
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
