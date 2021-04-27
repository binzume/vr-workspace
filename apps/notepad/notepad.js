'use strict';

AFRAME.registerComponent('notepad-app', {
    schema: {},
    init() {
        this.file = null;
        this.appManager = null;
        let editorEl = /** @type {AFRAME.AEntity & {value: string}} */ (this.el.querySelector('[texteditor]'));
        editorEl.value = `# Example text
Hello, world!

emoji: 🍣🍣🍣🍣🍣
kanji: 日本語

TODO:
- Keyword highlight
- Scrollbar (xy-scroll)
- Wrap
`;

        this._elByName('save-button').addEventListener('click', async (ev) => {
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
        });
        this._elByName('undo-button').addEventListener('click', (ev) => {
            editorEl.components.texteditor.textView.undo(false);
        });
        this._elByName('redo-button').addEventListener('click', (ev) => {
            editorEl.components.texteditor.textView.undo(true);
        });
        this._elByName('pgup-button').addEventListener('click', (ev) => {
            editorEl.components.texteditor.caret.move(-8, 0);
        });
        this._elByName('pgdn-button').addEventListener('click', (ev) => {
            editorEl.components.texteditor.caret.move(8, 0);
        });

        this.el.addEventListener('app-launch', async (ev) => {
            this.appManager = ev.detail.appManager;
            this.file = ev.detail.content;
            if (this.file) {
                this.el.setAttribute('title', `${this.file.name} - Notepad`);
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
