'use strict';

AFRAME.registerComponent('notepad-app', {
    schema: {},
    init() {
        this.file = null;
        this.appManager = null;
        let editorEl = /** @type {AFRAME.AEntity & {value: string}} */ (this.el.querySelector('[texteditor]'));
        let editor = editorEl.components.texteditor;
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
            editor.textView.styleLine = null;
            // TODO: more languages
            if (type.startsWith('text/javascript')) {
                let keywords = ['for', 'if', 'else', 'while', 'switch', 'case', 'function', 'return', 'class', 'new', 'this', 'var', 'let', 'const',
                    'null', 'true', 'false', 'undefined', 'undefined', 'instanceof', 'async', 'of', 'in'];
                editor.textView.styleLine = (line, setColor) => {
                    for (let m of line.text.matchAll(/(\w+|"[^"]*"|'[^']*'|\/\/.*|[+\-*=!\/\[\]{}&|]+)/g)) {
                        if (keywords.includes(m[0])) {
                            setColor(m.index, m.index + m[0].length, '#6666ff');
                        } else if (m[0].match(/^['"`]/)) {
                            setColor(m.index, m.index + m[0].length, '#ff8822');
                        } else if (m[0].match(/^[0-9]/)) {
                            setColor(m.index, m.index + m[0].length, '#ffff88');
                        } else if (!m[0].match(/^\w/)) {
                            setColor(m.index, m.index + m[0].length, '#ffff00');
                        } else if (m[0].startsWith('//')) {
                            setColor(m.index, m.index + m[0].length, '#88ff88');
                        }
                    }
                };
            }
        };

        this._elByName('file-menu').addEventListener('change', async (ev) => {
            if (ev.detail.index == 0) {
                editorEl.value = '';
                this.file = null;
                setMimeType('text/plain');
            } else {
                let content = new Blob([editorEl.value], { type: 'text/plain' });
                if (this.file && this.file.update) {
                    console.log('save...');
                    await this.file.update(content);
                    console.log('saved');
                } else if (this.appManager) {
                    let tmp = await this.appManager.newContent('text/plain', { extension: 'txt' });
                    await tmp.update(content);
                    console.log('saved', tmp.name);
                }
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

        this.el.addEventListener('app-start', async (ev) => {
            this.appManager = ev.detail.appManager;
            this.file = ev.detail.content;
            if (this.file) {
                this.el.setAttribute('title', `${this.file.name} - Notepad`);
                setMimeType(this.file.type);
                editorEl.value = 'Loading...';
                let res = await (this.file.fetch ? this.file.fetch() : fetch(this.file.url));
                if (this.file != ev.detail.content) {
                    return;
                }
                editorEl.value = await res.text();
            }
        }, { once: true });
    },
    _elByName(name) {
        return this.el.querySelector("[name=" + name + "]");
    },
    remove() {
        this.file = null;
    }
});
