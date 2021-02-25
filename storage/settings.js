
import { WebkitFileSystemWrapper, install as installWebkitFs } from './webkit-filesystem.js';
import { GoogleApiLoader, install as installGoogleDrive } from './google-drive.js';

const storageType = window.PERSISTENT; // PERSISTENT or TEMPORARY;
const authScope = 'https://www.googleapis.com/auth/drive';

let googleApiLoader = new GoogleApiLoader();
let storageWrapper = new WebkitFileSystemWrapper(storageType);

let currentStorage = 'WebkitFileSystem';

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

    for (let item of list.items) {
        let li = document.createElement('li');
        li.innerText = item.name;

        if (item._entry) {
            let deleteButton = document.createElement('button');
            deleteButton.innerText = 'Remove';
            li.append(deleteButton);
            deleteButton.addEventListener('click', async (ev) => {
                ev.preventDefault();
                await new Promise((resolve, reject) => item._entry.remove(resolve, reject));
                console.log("Removed " + item._entry.fullPath);
                filesEl.removeChild(li);
            })
        }

        if (item.url) {
            let a = document.createElement('a');
            a.href = item.url;
            a.innerText = 'GET';
            li.append(a);
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

    document.querySelector('#webkit-filesystem-add').addEventListener('click', async (ev) => {
        ev.preventDefault();
        let inputEl = Object.assign(document.createElement('input'), {
            type: "file", multiple: true, style: "display:none"
        });
        inputEl.addEventListener('change', async (ev) => {
            for (let file of inputEl.files) {
                storageWrapper.writeFile(file.name, file);
            }
            document.body.removeChild(inputEl);
            chedckWebkitFileSystemStatus(); // update quata
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
