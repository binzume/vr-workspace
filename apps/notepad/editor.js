"use strict";


class TextLine {
	constructor(text) {
		this.text = text;
		this.visible = false;
		this.virtual = false; // wrapped lines
		this.textureLine = null;
		this.width = 0;
		this.xOffset = 0;
	}
}

class MultilineText {
	constructor(width, height, lineHeight, options = {}) {
		this.lines = [new TextLine('')];
		this.scrollY = 0;
		this.scrollX = 0;
		this.maxWidth = 0;
		this.textureLines = [];
		this.textureFreeLines = [];
		this.canvas = document.createElement("canvas");
		this.canvasCtx = this.canvas.getContext('2d');

		this.texture = new THREE.CanvasTexture(this.canvas);
		this.texture.alphaTest = 0.2;
		this.object3D = new THREE.Group();
		this.textMaterial = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true });
		this.lineMeshes = [];
		this.fontResolution = options.fontResolution || 32;
		this.font = "" + (this.fontResolution * 0.9) + "px sans-serif";
		this.caret = null;

		this.setSize(width, height, lineHeight);
	}

	setSize(width, height, lineHeight) {
		this.width = width;
		this.height = height;
		this.lineHeight = lineHeight;

		this._clearMesh();
		let lines = Math.ceil(height / lineHeight);
		let textureLines = lines + 4;
		this.textureLines = new Array(textureLines);
		this.textureFreeLines = new Array(textureLines);
		let textureWidth = width * this.fontResolution / lineHeight;
		this.canvas.width = textureWidth;
		this.canvas.height = this.fontResolution * textureLines;

		let ctx = this.canvasCtx;
		ctx.font = this.font;
		ctx.textBaseline = 'top';
		ctx.fillStyle = 'white';

		console.log('canvas size', textureWidth, this.fontResolution * textureLines);
		for (let i = 0; i < textureLines; i++) {
			let geom = new THREE.PlaneBufferGeometry(width, lineHeight);
			let uv = geom.attributes.uv;
			for (let j = 0; j < uv.count; j++) {
				uv.setY(j, (uv.getY(j) + textureLines - i - 1) / textureLines);
			}
			this.lineMeshes.push(new THREE.Mesh(geom, this.textMaterial));
			this.textureFreeLines[i] = i;
		}

		this.refresh();
	}

	setText(text) {
		this.lines = text.split("\n").map(text => new TextLine(text));
		this.scrollY = 0;
		this.scrollX = 0;
		this.refresh();
	}

	getText() {
		return this.lines.map(l => l.text).join("\n");
	}

	insert(pos, str) {
		let l = pos[0];
		let line = this.lines[l];
		let h = line.text.substring(0, pos[1]);
		let t = line.text.substring(pos[1]);
		let ll = (h + str).split("\n");
		let lastStr = ll.pop();
		this._setLine(l, lastStr + t);

		if (ll.length > 0) {
			this.lines.splice(l, 0, ...ll.map(text => new TextLine(text)));
			this.refresh();
		}
		return [l + ll.length, lastStr.length];
	}

	remove(begin, end) {
		this.validatePosition(begin);
		this.validatePosition(end);
		let startLine = this.lines[begin[0]];
		let endLine = this.lines[end[0]];
		let h = startLine.text.substring(0, begin[1]);
		let t = endLine.text.substring(end[1]);
		this.lines.splice(begin[0], end[0] - begin[0]).forEach(l => this._hideLine(l));
		this._setLine(begin[0], h + t);
		if (end[0] - begin[0]) {
			this.refresh();
		}
	}

	getPositionFromLocal(localPos) {
		if (localPos.y > 0) {
			return [0, 0];
		}
		let y = Math.floor(-localPos.y / this.lineHeight);
		let x = this._getCharPos(y, (localPos.x / this.width + 0.5) * this.canvas.width);
		return [y, x];
	}

	refresh() {
		this.textureLines.forEach(line => this._hideLine(line));

		let lines = Math.ceil(this.height / this.lineHeight);
		let start = this.scrollY;
		for (let n = 0; n < lines && start + n < this.lines.length; n++) {
			let l = start + n;
			let line = this.lines[l];
			this._showLine(line);
			// console.log('show', l, line);
			let mesh = this.lineMeshes[line.textureLine];
			mesh.position.set(0, this.lineHeight * (- l - 0.5), 0);
		}
		this.object3D.position.set(0, this.lineHeight * (start + lines / 2), 0.01);

		// TODO callback
		if (this.caret) {
			this.caret._refresh();
		}
	}

	validatePosition(p, moveLine = true) {
		if (moveLine && p[0] > 0 && p[1] < 0) {
			p[0]--;
			p[1] += this.lines[p[0]].text.length + 1;
		}
		if (moveLine && p[0] < this.lines.length - 1 && p[1] > this.lines[p[0]]?.text.length) {
			p[1] -= this.lines[p[0]].text.length + 1;
			p[0]++;
		}
		p[0] = Math.max(Math.min(p[0], this.lines.length - 1), 0);
		p[1] = Math.max(Math.min(p[1], this.lines[p[0]].text.length), 0);
		return p;
	}

	scrollTo(pos) {
		if (this.scrollY > pos[0]) {
			this.scrollY = pos[0];
			this.refresh();
		}
		let lines = Math.ceil(this.height / this.lineHeight);
		if (this.scrollY <= pos[0] - lines) {
			this.scrollY = pos[0] - lines + 1;
			this.refresh();
		}
	}

	_showLine(line) {
		if (line == null || line.visible) {
			return;
		}
		if (line.textureLine === null) {
			this._bindTextureLine(line);
			this._drawLine(line)
		} else {
			this.textureFreeLines = this.textureFreeLines.filter(l => l != line.textureLine);
		}

		this.object3D.add(this.lineMeshes[line.textureLine]);
		line.visible = true;
	}

	_hideLine(line) {
		if (line == null || !line.visible) {
			return;
		}
		this.object3D.remove(this.lineMeshes[line.textureLine]);
		this.textureFreeLines.push(line.textureLine);
		line.visible = false;
	}

	_drawLine(line) {
		let ctx = this.canvasCtx;
		let y = line.textureLine * this.fontResolution;
		ctx.clearRect(0, y, this.canvas.width, this.fontResolution);
		ctx.fillText(line.text, line.xOffset, y);
		line.width = ctx.measureText(line.text).width;
		this.texture.needsUpdate = true;
	}

	_bindTextureLine(line) {
		let l = this.textureFreeLines.shift();
		if (this.textureLines[l]) {
			this.textureLines[l].textureLine = null;
		}
		this.textureLines[l] = line;
		line.textureLine = l;
	}

	_setLine(l, text) {
		let line = this.lines[l];
		if (line == null || line.text == text) {
			return;
		}
		line.text = text;
		if (line.visible) {
			this._drawLine(line);
		}
	}

	_getCharPos(l, x) {
		let line = this.lines[l];
		if (line == null) {
			return 0;
		}
		let _caretpos = (p) => {
			let s = line.text.slice(0, p);
			return this.canvasCtx.measureText(s).width;
		};
		// binary search...
		let min = 0, max = line.text.length, p = 0;
		while (max > min) {
			p = min + ((max - min + 1) / 2 | 0);
			if (_caretpos(p) < x) {
				min = p;
			} else {
				max = p - 1;
			}
		}
		console.log(x, min);
		return min;
	}

	_updateMaxWidth() {
		let max = 0;
		for (let l of this.lines) {
			max = Math.max(l.width);
		}
		this.maxWidth = max;
	}

	_clearMesh() {
		// TODO: dispose
		this.lineMeshes = [];
	}

	dispose() {
		this.lines = [];
		this._clearMesh();
		this.texture.dispose();
		this.textMaterial.dispose();
	}
}


class MultilineTextCaret {
	constructor(textView, width, height, color) {
		this.textView = textView;
		this.position = [0, 0]; // [line, col]
		this.obj = new THREE.Mesh(new THREE.PlaneBufferGeometry(width, height));
		this.obj.material.color = new THREE.Color(color);
		this.show();
	}
	show() {
		let caretObj = this.obj;
		if (!caretObj.parent) {
			this.textView.object3D.add(caretObj);
		}
		this.textView.scrollTo(this.position);
		this._refresh();
	}
	hide() {
		let caretObj = this.obj;
		if (caretObj.parent) {
			caretObj.parent.remove(caretObj);
		}
	}
	move(lineOffset, colOffset) {
		let p = [this.position[0] + lineOffset, this.position[1] + colOffset];
		this.textView.validatePosition(p, lineOffset == 0);
		this.setPosition(p);
	}
	setPosition(p) {
		this.textView.validatePosition(p);
		this.position = p.slice();
		this.show();
	}
	_refresh() {
		let textView = this.textView;
		let line = textView.lines[this.position[0]];
		if (line == null || !line.visible) {
			this.hide();
			return;
		}
		let meshPos = textView.lineMeshes[line.textureLine].position;
		let s = line.text.slice(0, this.position[1]);
		let xpos = textView.canvasCtx.measureText(s).width * textView.width / textView.canvas.width - textView.width / 2;
		this.obj.position.set(meshPos.x + xpos, meshPos.y, meshPos.z);
	}
	dispose() {
		this.obj.geometry.dispose();
	}
}


AFRAME.registerComponent('texteditor', {
	schema: {
		caretColor: { default: "#0088ff" },
		bgColor: { default: "#222" },
		editable: { default: true },
		virtualKeyboard: { default: "[xykeyboard]", type: 'selector' },
	},
	init() {
        let data = this.data, el = this.el, xyrect = el.components.xyrect;

		let lineHeight = 0.3;
		this.textView = new MultilineText(xyrect.width, xyrect.height, lineHeight);
		this.textView.setText(`# Example text
Hello!

emoji: 🍣🍣🍣🍣🍣
kanji: 日本語

TODO:
- Selection
- Keyword highlight
- Undo/Redo
- Scrollbar (xy-scroll)
`);
		this.textView.insert([1, 5], ", world");

		if (data.editable) {
			this.caret = this.textView.caret = new MultilineTextCaret(this.textView, lineHeight * 0.1, lineHeight * 0.9, this.data.caretColor);
		}

		el.setObject3D('texteditor-text', this.textView.object3D);


		// Same as aframe-xyinput.js TODO: consolidate.
		el.setAttribute('geometry', {
			primitive: 'xy-rounded-rect', width: xyrect.width, height: xyrect.height
		});
		el.classList.add('collidable');
		el.setAttribute('tabindex', 0);

		el.addEventListener('click', ev => {
			el.focus();
			let intersection = ev.detail.intersection;
			if (intersection) {
				if (!this.caret) {
					return;
				}
				let lp = this.textView.object3D.worldToLocal(intersection.point);
				let pos = this.textView.getPositionFromLocal(lp);
				this.caret.setPosition(pos);
			}
			let kbd = this.data.virtualKeyboard;
			if (kbd) {
				kbd.components.xykeyboard.show(this.data.type);
			}
		});
		let oncopy = (ev) => {
			ev.clipboardData.setData('text/plain', this.textView.getText());
			ev.preventDefault();
		};
		let onpaste = (ev) => {
			this.caret.setPosition(this.textView.insert(this.caret.position, ev.clipboardData.getData('text/plain')));
			ev.preventDefault();
		};
		el.addEventListener('focus', (ev) => {
			window.addEventListener('copy', oncopy);
			window.addEventListener('paste', onpaste);
			this.caret.show();
		});
		el.addEventListener('blur', (ev) => {
			window.removeEventListener('copy', oncopy);
			window.removeEventListener('paste', onpaste);
			this.caret.hide();
		});
		el.addEventListener('keypress', (ev) => {
			if (ev.code != 'Enter') {
				let pos = this.textView.insert(this.caret.position, ev.key);
				this.caret.setPosition(pos); // TODO: changed event
			} else {
			}
		});
		el.addEventListener('keydown', (ev) => {
			if (ev.code == 'ArrowLeft') {
				this.caret.move(0, -1);
			} else if (ev.code == 'ArrowRight') {
				this.caret.move(0, 1);
			} else if (ev.code == 'ArrowDown') {
				this.caret.move(1, 0);
			} else if (ev.code == 'ArrowUp') {
				this.caret.move(-1, 0);
			} else if (ev.code == 'Backspace') {
				let begin = [this.caret.position[0], this.caret.position[1] - 1];
				this.textView.remove(begin, this.caret.position);
				this.caret.setPosition(begin);
			} else if (ev.code == 'Enter') {
				let pos = this.textView.insert(this.caret.position, "\n");
				this.caret.setPosition(pos);
			}
		});

	},
	update() {
		let el = this.el, data = this.data;
		el.setAttribute('material', { color: data.bgColor });
		this.caret.obj.material.color = new THREE.Color(data.caretColor);
	},
	remove() {
		this.el.removeObject3D('texteditor-text');
		this.textView.dispose();
	}
});


AFRAME.registerPrimitive('a-texteditor', {
    defaultComponents: {
        xyrect: { width: 6, height: 3 },
        texteditor: {  },
    },
    mappings: {
        width: 'xyrect.width',
        height: 'xyrect.height',
        'caret-color': 'texteditor.caretColor',
        'background-color': 'texteditor.bgColor'
    }
});
