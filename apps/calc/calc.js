"use strict";

AFRAME.registerComponent('calc', {
	schema: {},
	init() {
		this._clear();
		for (let b of this.el.querySelectorAll('.calc-button')) {
			b.addEventListener('click', ev => this._append(b.getAttribute('label')));
		}
		this._elByName('eq').addEventListener('click', ev => this._evaluate());
		this._elByName('clear').addEventListener('click', ev => this._clear());
		this._elByName('del').addEventListener('click', ev =>
			this._elByName('result').value = this._elByName('result').value.slice(0, -1)
		);
	},
	_evaluate() {
		this._evaluated = true;
		try {
			this._elByName('result').value = eval(this._elByName('result').value); // TODO
		} catch (e) {
			this._elByName('result').value = 'ERR';
		}
	},
	_clear() {
		this._evaluated = true;
		this._elByName('result').value = '0';
	},
	_append(s) {
		if (this._evaluated && s.match(/[0-9\(\.]/)) {
			this._elByName('result').value = '';
		}
		this._evaluated = false;
		this._elByName('result').value += s;
	},
	_elByName(name) {
		return this.el.querySelector("[name=" + name + "]");
	}
});
