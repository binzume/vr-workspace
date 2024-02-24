
const flagsKey = 'flags';
let flags = [
    { id: 'xranchor', name: 'XR Anchor', type: 'bool' },
    { id: 'xrplane', name: 'XR Plane', type: 'bool' },
    { id: 'xrplane-wireframe', name: 'XR Plane wireframe mode', type: 'bool' },
    { id: 'physics', name: 'Init physics on startup', type: 'bool' },
    { id: 'hand-controller', name: 'Load hand-controller', type: 'bool' },
];

window.addEventListener('DOMContentLoaded', ev => {
    /**
     * @template {keyof HTMLElementTagNameMap} T
     * @param {T} tag 
     * @param {string | Node | (string|Node)[]} [children] 
     * @param {object | function} [attrs]
     * @returns {HTMLElementTagNameMap[T]}
     */
    function mkEl(tag, children, attrs) {
        let el = document.createElement(tag);
        children && el.append(...[children].flat(999));
        attrs instanceof Function ? attrs(el) : (attrs && Object.assign(el, attrs));
        return el;
    }
    let save = () => localStorage.setItem(flagsKey, JSON.stringify(values));

    let values = JSON.parse(localStorage.getItem(flagsKey) || '{}');
    let listEl = document.querySelector('#flags');
    for (let f of flags) {
        let el = mkEl('li', f.name + ' : ');
        if (f.type == 'bool') {
            let selectEl = mkEl('select', [
                mkEl('option', 'Default', { value: 'null' }),
                mkEl('option', 'Enabled', { value: 'true' }),
                mkEl('option', 'Disabled', { value: 'false' }),
            ], {
                onchange: (ev) => {
                    if (selectEl.value == 'null') {
                        delete values[f.id];
                    } else {
                        values[f.id] = selectEl.value == 'true';
                    }
                    save();
                }
            });
            selectEl.value = values[f.id] == null ? 'null' :
                values[f.id] ? 'true' : 'false';
            el.append(selectEl);
        } else if (f.type == 'string') {
            el.append(mkEl('input', [], {
                value: values[f.id] || '',
                onchange: (ev) => {
                    if (!ev.target.value) {
                        delete values[f.id];
                    } else {
                        values[f.id] = ev.target.value;
                    }
                    save();
                }
            }));
        }
        listEl.append(el);
    }

    document.querySelector('#reset-button').addEventListener('click', ev => {
        ev.preventDefault();
        localStorage.removeItem(flagsKey);
        alert('Clear!');
    });

}, { once: true });
