'use strict';

AFRAME.registerComponent('notepad-app', {
    schema: {},
    init() {
        this.file = null;
        this.appManager = null;
        let editorEl = /** @type {AFRAME.AEntity & {value: string}} */ (this.el.querySelector('[texteditor]'));
        let editor = editorEl.components.texteditor;
        let formats = [
            { name: 'Text', type: 'text/plain', ext: 'txt' },
            { name: 'JavaScript', type: 'text/javascript', ext: 'js' },
            { name: 'Go', type: 'text/x-go', ext: 'go' },
            { name: 'C/C++', type: 'text/x-c', ext: 'c' },
        ];
        editorEl.value = `# Example text
Hello, world!

emoji: 🍣🍣🍣🍣🍣
kanji: 日本語, 𩸽焼

TODO:
- Keyword highlight
- Scrollbar (xy-scroll)
- Wrap
`;

        let setMimeType = (type) => {
            this.mimeType = type;
            editor.textView.styleLine = null;
            // TODO: more languages
            let keywords = [];
            let common = ['if', 'else', 'for', 'while', 'break', 'continue', 'switch', 'case', 'default',
                'return', 'class', 'new', 'throw', 'try', 'catch', 'finally', 'void'];
            if (type.startsWith('text/javascript')) {
                keywords = common.concat(['this', 'true', 'false', 'null', 'function', 'var', 'let', 'const',
                    'undefined', 'NaN', 'instanceof', 'async', 'of', 'in', 'import', 'export', 'extends']);
            } else if (type.startsWith('text/x-c')) {
                keywords = common.concat(['char', 'int', 'short', 'long', 'float', 'double', 'static', 'struct', 'extern', 'this']);
            } else if (type.startsWith('text/x-go')) {
                keywords = ['break', 'default', 'func', 'interface', 'select', 'case', 'defer', 'go', 'map',
                    'struct', 'chan', 'else', 'goto', 'package', 'switch', 'const', 'fallthrough', 'if', 'range',
                    'type', 'continue', 'for', 'import', 'return', 'var'];
            } else if (type.startsWith('text/x-java-source')) {
                keywords = common;
            }
            if (keywords.length) {
                editor.textView.styleLine = (line, setColor) => {
                    for (let m of line.text.matchAll(/(\d*\.\d+(?:e\d+)?|\w+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*|[+\-*=!\/\[\]<>{}()&|%]+)/g)) {
                        if (keywords.includes(m[0])) {
                            setColor(m.index, m.index + m[0].length, '#2244ff');
                        } else if (m[0].match(/^['"`]/)) {
                            setColor(m.index, m.index + m[0].length, '#ff8822');
                        } else if (m[0].match(/^[0-9]/)) {
                            setColor(m.index, m.index + m[0].length, '#ff8822');
                        } else if (m[0].startsWith('//')) {
                            setColor(m.index, m.index + m[0].length, '#88ff88');
                        } else if (!m[0].match(/^\w/)) {
                            setColor(m.index, m.index + m[0].length, '#ffff00');
                        }
                    }
                };
            }
        };
        let save = async (saveas = false) => {
            let type = this.mimeType || 'text/plain';
            let content = new Blob([editorEl.value], { type: type });
            if (this.file && this.file.update && !saveas) {
                console.log('save...');
                await this.file.update(content);
                console.log('saved');
            } else {
                this.file = await this.saveFile(content, { extension: 'txt' });
                console.log('saved', this.file.name);
            }
        };

        this._elByName('file-menu').addEventListener('change', (ev) => {
            if (ev.detail.index == 0) {
                editorEl.value = '';
                this.file = null;
                setMimeType('text/plain');
            } else if (ev.detail.index == 1) {
                save();
            } else if (ev.detail.index == 2) {
                save(true);
            }
        });
        this._elByName('pgup-button').addEventListener('click', (ev) => {
            editor.caret.move(-8, 0);
        });
        this._elByName('pgdn-button').addEventListener('click', (ev) => {
            editor.caret.move(8, 0);
        });

        this._elByName('edit-menu').addEventListener('change', async (ev) => {
            if (ev.detail.index == 0) {
                if (editor.textView.selection) {
                    navigator.clipboard.writeText(editor.textView.getTextRange(editor.textView.selection));
                }
            } else if (ev.detail.index == 1) {
                if (editor.textView.selection) {
                    navigator.clipboard.writeText(editor.textView.getTextRange(editor.textView.selection));
                    editor.caret.setPosition(editor.textView.selection.min());
                    editor.textView.remove(editor.textView.selection);
                }
            } else if (ev.detail.index == 2) {
                editor.insertText(await navigator.clipboard.readText());
            } else if (ev.detail.index == 3) {
                editor.textView.undo(false);
            } else if (ev.detail.index == 4) {
                editor.textView.undo(true);
            }
        });
        this._elByName('format-menu').addEventListener('change', async (ev) => {
            setMimeType(formats[ev.detail.index].type);
        });
        this._elByName('format-menu').setAttribute('values', formats.map(f => f.name).join(','));

        this.el.addEventListener('app-start', async (ev) => {
            this.appManager = ev.detail.appManager;
            this.file = ev.detail.content;
            if (this.file) {
                this.el.setAttribute('title', `${this.file.name} - Notepad`);
                let mimeType = this.file.type.split(";")[0].trim();
                if (!mimeType) {
                    let ext = this.file.name.split('.').pop();
                    if (ext == 'go') {
                        mimeType = 'text/x-go';
                    } else if (ext == 'c' || ext == 'cc' || ext == 'cpp' || ext == 'h') {
                        mimeType = 'text/x-c';
                    } else if (ext == 'js' || ext == 'json') {
                        mimeType = 'text/javascript';
                    } else {
                        mimeType = 'text/plain';
                    }
                }
                setMimeType(mimeType);
                editorEl.value = 'Loading...';
                let res = await (this.file.fetch ? this.file.fetch() : fetch(this.file.url));
                if (this.file != ev.detail.content) {
                    return;
                }
                editorEl.value = await res.text();
            }
        }, { once: true });

        this.el.addEventListener('keydown', (ev) => {
            if (ev.ctrlKey && ev.code == 'KeyA') {
                editor.selectAll();
                ev.preventDefault();
            } else if (ev.ctrlKey && ev.code == 'KeyS') {
                save();
                ev.preventDefault();
            }
        });

    },
    _appFolder() {
        let app = this.el.components.vrapp;
        if (app && app.context) {
            return app.context.getDataFolder();
        }
        return null;
    },
    async saveFile(content, options = {}) {
        function mkEl(tag, children, attrs) {
            let el = document.createElement(tag);
            children && el.append(...[children].flat(999));
            attrs instanceof Function ? attrs(el) : (attrs && Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)));
            return el;
        }
        /** @type {Folder} */
        let folder = this._appFolder();
        let task = new Promise(async (resolve, reject) => {
            let buttonEl = mkEl('a-xybutton', [], { label: 'Save' });
            let cancelEl = mkEl('a-xybutton', [], { label: 'Cancel' });
            let inputEl = mkEl('a-xyinput', [], { value: 'Untitled.' + (options.extension || 'txt'), width: 3 });
            let selectFolderEl = mkEl('a-xyselect', [], { values: '' });
            // TODO: tree view
            let roots = [
                [this._appFolder(), this.el.components.vrapp.app.name],
                [this.el.components.vrapp.services.storage, '/']
            ];
            let path = [];
            let folders = [];
            let selectFolder = async (fi) => {
                folder = fi[0];
                if (roots.includes(fi)) {
                    path = [fi];
                } else if (path.includes(fi)) {
                    path = path.slice(0, path.indexOf(fi) + 1);
                } else {
                    path.push(fi);
                }
                let ff = path.slice();
                for (let f of (await folder.getFiles(0, 1000)).items) {
                    if (f.type == 'folder') {
                        ff.push([this.el.components.vrapp.services.storage.getFolder(f.path), f.name]);
                    }
                }
                folders = roots.slice();
                folders.splice(roots.indexOf(ff[0]), 1, ...ff);
                selectFolderEl.setAttribute('values', folders.map(fi => fi[1]).join(','));
                return folders.indexOf(fi);
            };
            selectFolder(roots[0]);
            let el = mkEl('a-xycontainer', [
                mkEl('a-entity', [], {
                    xyitem: 'fixed: true',
                    geometry: 'primitive: xy-rounded-rect; width: 4; height: 2.5',
                    material: 'color: #000000',
                    position: '0 0 -0.1',
                }),
                mkEl('a-xycontainer', [
                    mkEl('a-xylabel', ['Folder:'], { value: 'Folder:', width: 1.5, height: 0.4 }),
                    selectFolderEl,
                ], { direction: 'row' }),
                inputEl,
                mkEl('a-xycontainer', [buttonEl, cancelEl], { direction: 'row' }),
            ], {
                position: '0 0 0.2', direction: 'column', xyitem: 'fixed: true',
            });
            buttonEl.addEventListener('click', ev => {
                this.el.removeChild(el);
                resolve(inputEl.value);
            });
            cancelEl.addEventListener('click', ev => {
                this.el.removeChild(el);
                reject();
            });
            selectFolderEl.addEventListener('change', async (ev) => {
                selectFolderEl.setAttribute('select', await selectFolder(folders[ev.detail.index]));
            });
            this.el.append(el);
            setTimeout(() => inputEl.focus(), 0);
        });
        let name = await task;
        return await folder.writeFile(name, content, { mkdir: true });
    },
    _elByName(name) {
        return this.el.querySelector("[name=" + name + "]");
    },
    remove() {
        this.file = null;
    }
});
