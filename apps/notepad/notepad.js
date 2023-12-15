'use strict';

AFRAME.registerComponent('notepad-app', {
    schema: {},
    /** @type {FileInfo} */
    file: null,
    init() {
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
                this.file = await this.el.components.vrapp.saveFile(content, { extension: 'txt' });
                console.log('saved', this.file.name);
            }
        };
        let load = async (file) => {
            this.file = file;
            if (file) {
                this.el.setAttribute('title', `${this.file.name} - Notepad`);
                let mimeType = this.file.type.split(";")[0].trim();
                if (!mimeType.startsWith('text/')) {
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
                editorEl.value = 'Loading...';
                let res = await (this.file.fetch ? this.file.fetch() : fetch(this.file.url));
                if (this.file == file) {
                    setMimeType(mimeType);
                    editorEl.value = (await res.text()).replace("\r\n", "\n");
                }
            }
        };
        this._elByName('file-menu').addEventListener('change', (ev) => {
            if (ev.detail.index == 0) {
                setMimeType('text/plain');
                editorEl.value = '';
                this.file = null;
            } else if (ev.detail.index == 1) {
                save();
            } else if (ev.detail.index == 2) {
                save(true);
            } else if (ev.detail.index == 3) {
                (async () => {
                    load(await this.el.components.vrapp.selectFile());
                })();
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
            editorEl.value = editorEl.value;
        });
        this._elByName('format-menu').setAttribute('values', formats.map(f => f.name).join(','));

        this.el.addEventListener('app-start', async (ev) => {
            this.appManager = ev.detail.appManager;
            load(ev.detail.content);
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
    _elByName(name) {
        return this.el.querySelector("[name=" + name + "]");
    },
    remove() {
        this.file = null;
    }
});
