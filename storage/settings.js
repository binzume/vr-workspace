
import { WebkitFileSystemWrapper, install as installWebkitFs } from './webkit-filesystem.js';
import { GoogleApiLoader, install as installGoogleDrive } from './google-drive.js';

const storageType = window.PERSISTENT; // PERSISTENT or TEMPORARY;
const authScope = 'https://www.googleapis.com/auth/drive';

let googleApiLoader = new GoogleApiLoader();
let storageWrapper = new WebkitFileSystemWrapper(storageType);

let currentStorage = 'WebkitFileSystem';


function makeEl(tag, child, attrs) {
    let el = document.createElement(tag);
    attrs && Object.assign(el, attrs);
    child && (Array.isArray(child) ? el.append(...child) : el.append(child));
    return el;
}


async function chedckGoogleDriveStatus() {
    let statusEl = document.querySelector('#google-drive-status');

    if (!googleApiLoader.available()) {
        statusEl.innerText = "No clientId settings for " + location.origin;
        return;
    }

    statusEl.innerText = "Initializing GoogleAPI...";

    if (!await googleApiLoader.auth(authScope, false)) {
        statusEl.innerText = "Not logged-in";
        document.querySelector('#google-drive-login').parentNode.style.visibility = 'visible';
        return;
    }

    statusEl.innerText = "Initializing GoogleDriveAPI...";
    await installGoogleDrive();

    statusEl.innerText = "Ok";
    if (currentStorage == 'GoogleDrive') {
        await updateFileList();
    }
}

async function chedckWebkitFileSystemStatus() {
    let statusEl = document.querySelector('#webkit-filesystem-status');

    if (!storageWrapper.available()) {
        statusEl.innerText = 'Not Supported';
        return;
    }

    let quota = await storageWrapper.quota();
    if (quota.grantedBytes == 0) {
        statusEl.innerText = 'No Quota';
        return;
    }

    statusEl.innerText = "Initializing WebkitFs...";
    await installWebkitFs();

    statusEl.innerText = `Ok (Usage: ${quota.usedBytes} / ${quota.grantedBytes}B)`;

    if (currentStorage == 'WebkitFileSystem') {
        await updateFileList();
    }
}

async function updateFileList(storage, path) {
    currentStorage = storage || currentStorage;

    let filesEl = document.querySelector('#item-list');
    filesEl.innerHTML = '';
    document.querySelector('#file-menu').classList.remove('writable');

    document.querySelector('#item-list-title').innerText = currentStorage;

    if (!globalThis.storageAccessors) {
        return;
    }
    let accessor = globalThis.storageAccessors[currentStorage];
    if (!accessor) {
        return;
    }
    path = path || accessor.root;

    let list = accessor.getList(path, {});
    await list.init();

    if (list.writable) {
        document.querySelector('#file-menu').classList.add('writable');
    }

    for (let item of list.items) {
        let li = makeEl('li', [item.updatedTime, ' ', item.url ? makeEl('a', item.name, { href: item.url }) : item.name]);

        if (item.remove) {
            let deleteButton = makeEl('button', 'Remove');
            li.append(deleteButton);
            deleteButton.addEventListener('click', async (ev) => {
                ev.preventDefault();
                if (confirm(`Remove ${item.name} ?`)) {
                    await item.remove();
                    filesEl.removeChild(li);
                    console.log("Removed " + item.name);
                }
            });
        }

        filesEl.append(li);
    }
}


window.addEventListener('DOMContentLoaded', async (ev) => {

    chedckGoogleDriveStatus();
    document.querySelector('#google-drive-login').addEventListener('click', async (ev) => {
        ev.preventDefault();
        await googleApiLoader.auth(authScope, true);
        chedckGoogleDriveStatus();
    });


    chedckWebkitFileSystemStatus();
    document.querySelector('#webkit-filesystem-request').addEventListener('click', async (ev) => {
        ev.preventDefault();

        let sizeBytes = 1024 * 1024 * document.querySelector('#webkit-filesystem-size').value;
        console.log(await storageWrapper.requestQuota(sizeBytes));
        chedckWebkitFileSystemStatus();
    });

    document.querySelector('#file-add-button').addEventListener('click', async (ev) => {
        ev.preventDefault();
        let inputEl = makeEl('input', null, {
            type: `file`, multiple: true, style: "display:none"
        });
        inputEl.addEventListener('change', async (ev) => {
            let accessor = globalThis.storageAccessors[currentStorage];
            if (!accessor) {
                return;
            }

            for (let file of inputEl.files) {
                accessor.writeFile(file.name, file);
            }
            document.body.removeChild(inputEl);
            updateFileList(); // TODO: update quata dispaly
        });
        document.body.appendChild(inputEl).click();
    });


    let onHashChanged = () => {
        if (!location.hash) {
            return;
        }
        let fragment = location.hash.slice(1);
        let m = fragment.match(/list:(\w+)\/?(.*)/)
        if (m) {
            if (currentStorage != m[1]) {
                updateFileList(m[1], m[2]);
            }
        }
    };
    onHashChanged();
    window.addEventListener('hashchange', (function (ev) {
        ev.preventDefault();
        onHashChanged();
    }), false);

}, { once: true });
