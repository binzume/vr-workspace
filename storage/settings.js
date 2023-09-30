
import { WebkitFileSystemWrapper, install as installWebkitFs } from './webkit-filesystem.js';
import { GoogleApiLoader, install as installGoogleDrive } from './google-drive.js';
import './files.js';

const storageType = window.PERSISTENT; // PERSISTENT or TEMPORARY;
const authScope = 'https://www.googleapis.com/auth/drive';

let googleApiLoader = new GoogleApiLoader();
let storageWrapper = new WebkitFileSystemWrapper(storageType);

let currentStorage = 'WebkitFileSystem';
let currentFolder = null;

function formatSize(size) {
    if (size == null) { return ''; }
    if (size > 1024 * 1024 * 1024 * 10) { return (size / (1024 * 1024 * 1024) | 0) + 'GiB'; }
    if (size > 1024 * 1024 * 10) { return (size / (1024 * 1024) | 0) + 'MiB'; }
    if (size > 1024 * 10) { return (size / (1024) | 0) + 'KiB'; }
    return size + 'B'
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
        document.querySelector('#google-drive-login').style.visibility = 'visible';
        return;
    }

    statusEl.innerText = "Initializing GoogleDriveAPI...";
    await installGoogleDrive();

    statusEl.innerText = "Ok";
    if (currentStorage == 'GoogleDrive') {
        await refreshFileList();
    }
}

function refreshFileList() {
    if (globalThis.fileListView) {
        globalThis.fileListView.selectList(globalThis.fileListView.path || 'WebkitFileSystem');
    }
}

function getCurrentFolder() {
    if (globalThis.fileListView && globalThis.fileListView.listCursor && globalThis.fileListView.listCursor._folder) {
        return globalThis.fileListView.listCursor._folder;
    }
    return null;
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

    statusEl.innerText = `Ok (Usage: ${formatSize(quota.usedBytes)} / ${formatSize(quota.grantedBytes)}B)`;

    if (currentStorage == 'WebkitFileSystem') {
        await refreshFileList();
    }
}

globalThis.folderResolver = globalThis.storageList;

function initGoogleDriveUI() {
    document.querySelector('#google-drive-login').style.visibility = 'hidden';
    let storageId = 'GoogleDrive';
    let enableEl = document.querySelector('#google-drive-enable');
    enableEl.checked = !(storageList.getOptions(storageId) || {}).hidden;
    enableEl.addEventListener('change', async (ev) => {
        storageList.setOptions(storageId, {hidden: !enableEl.checked});
        if (enableEl.checked) {
            chedckGoogleDriveStatus();
        }
    });
    if (enableEl.checked) {
        chedckGoogleDriveStatus();
    }
    document.querySelector('#google-drive-login').addEventListener('click', async (ev) => {
        ev.preventDefault();
        await googleApiLoader.auth(authScope, true);
        chedckGoogleDriveStatus();
    });
}

function initWebkitFileSystemUI() {
    let storageId = 'WebkitFileSystem';
    let enableEl = document.querySelector('#webkit-filesystem-enable');
    enableEl.checked = !(storageList.getOptions(storageId) || {}).hidden;
    enableEl.addEventListener('change', async (ev) => {
        storageList.setOptions(storageId, {hidden: !enableEl.checked});
        if (enableEl.checked) {
            chedckWebkitFileSystemStatus();
        }
    });
    if (enableEl.checked) {
        chedckWebkitFileSystemStatus();
    }
    document.querySelector('#webkit-filesystem-request').addEventListener('click', async (ev) => {
        ev.preventDefault();

        let sizeBytes = 1024 * 1024 * document.querySelector('#webkit-filesystem-size').value;
        console.log(await storageWrapper.requestQuota(sizeBytes));
        chedckWebkitFileSystemStatus();
    });
}

function initDemoStorageUI() {
    let storageId = 'DEMO';
    let enableEl = document.querySelector('#demo-storage-enable');
    enableEl.checked = !(storageList.getOptions(storageId) || {}).hidden;
    enableEl.addEventListener('change', async (ev) => {
        storageList.setOptions(storageId, {hidden: !enableEl.checked});
    });
}

window.addEventListener('DOMContentLoaded', async (ev) => {
    initGoogleDriveUI();
    initWebkitFileSystemUI();
    initDemoStorageUI();

    document.querySelector('#file-add-button').addEventListener('click', (ev) => {
        ev.preventDefault();
        let folder = getCurrentFolder();
        if (!folder || !folder.writeFile) {
            return;
        }
        let inputEl = Object.assign(document.createElement('input'), {
            type: `file`, multiple: true, style: "display:none", async onchange() {
                let tasks = [];
                for (let file of inputEl.files) {
                    tasks.push(folder.writeFile(file.name, file));
                }
                document.body.removeChild(inputEl);
                await Promise.all(tasks);
                refreshFileList(); // TODO: update quata dispaly    
            }
        });
        document.body.appendChild(inputEl).click();
    });

    document.querySelector('#file-mkdir-button').addEventListener('click', async (ev) => {
        ev.preventDefault();
        let folder = getCurrentFolder();
        if (!folder || !folder.mkdir) {
            return;
        }
        let dir = prompt('mkdir');
        if (!dir) {
            return;
        }
        await folder.mkdir(dir);
        refreshFileList();
    });

    let onHashChanged = () => {
        if (!location.hash) {
            return;
        }
        let fragment = location.hash.slice(1);
        let m = fragment.match(/list:(\w+)\/?(.*)/)
        if (m) {
            currentStorage = m[1];
        }
    };
    onHashChanged();
    window.addEventListener('hashchange', (function (ev) {
        ev.preventDefault();
        onHashChanged();
    }), false);
    refreshFileList();

}, { once: true });
