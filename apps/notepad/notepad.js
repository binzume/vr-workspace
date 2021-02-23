
AFRAME.registerComponent('notepad-app', {
    schema: {},
    init() {
        let editorEl = this.el.querySelector('[texteditor]');
        editorEl.value = `# Example text
Hello, world!

emoji: 🍣🍣🍣🍣🍣
kanji: 日本語

TODO:
- Keyword highlight
- Scrollbar (xy-scroll)
- Wrap
`;

        this.el.addEventListener('app-launch', async (ev) => {
            this.appManager = ev.detail.appManager;
            if (ev.detail.content) {
                // TODO: cancel if has been removed.
                let res = await fetch(ev.detail.content.url);
                editorEl.value = await res.text();
            }
        }, { once: true });
    },
    remove() {
    }
});
