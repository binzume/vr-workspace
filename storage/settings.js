
import { WebkitFileSystemWrapper } from './webkit-filesystem.js';
import { GoogleApiLoader, GoogleDrive } from './google-drive.js';

const storageType = window.PERSISTENT; // PERSISTENT or TEMPORARY;
const authScope = 'https://www.googleapis.com/auth/drive';

let googleApiLoader = new GoogleApiLoader();
let storageWrapper = new WebkitFileSystemWrapper(storageType);

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
    let drive = new GoogleDrive(googleApiLoader);
    await drive.init();
    statusEl.innerText = "Ok";
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

    statusEl.innerText = `Ok (Usage: ${quota.usedBytes} / ${quota.grantedBytes}B)`;

    // await storageWrapper.writeFile("test.txt", new Blob(["Hello!"]));

    let filesEl = document.querySelector('#webkit-filesystem-files');
    filesEl.innerHTML = '';
    let entries = await storageWrapper.entries('');

    for (let entry of entries) {
        let li = document.createElement('li');
        li.innerText = entry.name;
        let deleteButton = document.createElement('button');
        deleteButton.innerText = 'Remove';
        li.append(deleteButton);
        filesEl.append(li);

        if (entry.isFile) {
            entry.file(f => {
                let a = document.createElement('a');
                a.href = URL.createObjectURL(f);
                a.innerText = 'GET';
                li.append(a);
            });
        }

        deleteButton.addEventListener('click', async (ev) => {
            ev.preventDefault();
            await new Promise((resolve, reject) => entry.remove(resolve, reject));
            console.log("Removed " + entry.fullPath);
            filesEl.removeChild(li);
        })
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
            chedckWebkitFileSystemStatus();
        });
        document.body.appendChild(inputEl).click();
    });

}, { once: true });
