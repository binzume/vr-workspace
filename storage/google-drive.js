"use strict";

// <script src="google-drive.js" type="module"></script>
// <script src="https://apis.google.com/js/api.js?onload=gapiLoaded" async defer></script>


const gapiUrl = 'https://apis.google.com/js/api.js?onload=gapiLoaded';
const callbackName = 'gapiLoaded';
const clientIds = {
    "http://localhost:8080": "86954684848-e879qasd2bnnr4pcdiviu68q423gbq4m.apps.googleusercontent.com",
    "http://nas.binzume.net": "86954684848-e879qasd2bnnr4pcdiviu68q423gbq4m.apps.googleusercontent.com",
    "https://binzume.github.io": "86954684848-okobt1r6kedh2cskabcgmbbqe0baphjb.apps.googleusercontent.com"
};

export class GoogleDrive {
    constructor(apiLoader) {
    }
    async init() {
        await gapi.client.load("drive", "v3");
    }
    signOut() {
        gapi.auth2.getAuthInstance().signOut();
    }
    async getFiles(folder, limit, pageToken, options) {
        options = options || {};
        // kind, webViewLink
        let response = await gapi.client.drive.files.list({
            fields: "nextPageToken, files(id, name, size, mimeType, modifiedTime, iconLink, thumbnailLink)",
            orderBy: options.orderBy || "modifiedTime desc",
            q: "trashed=false and '" + (folder || 'root') + "' in parents",
            pageSize: limit || 50,
            pageToken: pageToken,
            spaces: "drive"
        });
        if (!response || response.status != 200) {
            return null;
        }
        // application/vnd.google-apps.folder
        return response.result;
    }
    async getFile(fileId) {
        let response = await gapi.client.drive.files.get({
            fileId: fileId,
            fields: "id, name, size, mimeType, modifiedTime, iconLink, thumbnailLink, parents",
            // alt: 'media'
        });
        if (!response || response.status != 200) {
            return null;
        }
        return response.result;
    }
    async create(name, content, mimeType, folder) {
        return await gapi.client.drive.files.create({
            name: name,
            parents: [folder || 'root'],
            uploadType: "media",
            fields: "id, name, parents",
            media: content,
            resource: { mimeType: mimeType }
        });
    }
    async remove(fileId) {
        return (await gapi.client.drive.files.delete({
            fileId: fileId
        })).status == 204;
    }
    getFileMediaUrl(fileId) {
        return "https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media";
    }
    async fetch(fileId, start, end) {
        let url = this.getFileMediaUrl(fileId);
        let headers = { 'Authorization': 'Bearer ' + gapi.auth.getToken().access_token };
        if (start != null) {
            headers.range = 'bytes=' + start + '-' + (end || '');
        }
        let response = await fetch(url, { headers: new Headers(headers) });
        if (!response.ok) throw new Error(response.statusText);
        return response;
    }
    async update(fileId, blob) {
        let url = "https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=media";
        let headers = { 'Authorization': 'Bearer ' + gapi.auth.getToken().access_token };
        if (blob.type) {
            headers['Content-Type'] = blob.type;
        }

        let response = await fetch(url, { method: 'PATCH', headers: new Headers(headers), body: blob });
        if (!response.ok) throw new Error(response.statusText);
        return response;
    }
    async mkdir(name, parent = null) {
        return await gapi.client.drive.files.create({
            name: name,
            parents: [parent || 'root'],
            fields: "id, name, parents",
            mimeType: 'application/vnd.google-apps.folder'
        });
    }
    async getFileBlob(fileId) {
        let url = this.getFileMediaUrl(fileId);
        let headers = { 'Authorization': 'Bearer ' + gapi.auth.getToken().access_token };
        let response = await fetch(url, { headers: new Headers(headers) });
        if (!response.ok) throw new Error(response.statusText);
        return await response.blob();
    }
}

class GoogleDriveFileList {
    constructor(folderId, drive, pathPrefix) {
        this._folderId = folderId;
        this._name = "";
        this._parent = null;
        /** @type {GoogleDrive} */
        this.drive = drive;
        this.onupdate = null;
        this.sequentialAccess = true;
        this._pathPrefix = pathPrefix;
    }
    async getInfo() {
        if (!this._name) {
            await this.drive.getFile(this._folderId).then(f => {
                this._name = f.name;
                if (f.parents && f.parents.length > 0) {
                    this._parent = f.parents[0];
                }
            });
        }
        return {
            type: 'folder',
            name: this._name,
        };
    }
    async getFiles(offset, limit, options = null, signal = null) {
        options = options || {};
        let driveOption = options.driveOptions || {};
        if (options.orderBy == "name") {
            driveOption.orderBy = "name" + (options.order == "d" ? " desc" : "");
        } else if (options.orderBy == "updated") {
            driveOption.orderBy = "modifiedTime" + (options.order == "d" ? " desc" : "");
        }
        let result = await this.drive.getFiles(this._folderId, limit, offset ? offset : null, driveOption);
        signal?.throwIfAborted();
        let drive = this.drive;
        let files = result.files.map(f => ({
            type: f.mimeType == "application/vnd.google-apps.folder" ? "folder" : f.mimeType,
            duration: 0,
            id: f.id,
            path: this._pathPrefix + f.id,
            name: f.name,
            size: f.size,
            tags: [this._folderId],
            thumbnailUrl: (f.thumbnailLink && !f.thumbnailLink.startsWith("https://docs.google.com/")) ? f.thumbnailLink : null,
            updatedTime: f.modifiedTime,
            fetch(start, end) { return drive.fetch(this.id, start, end); },
            update(blob) { return drive.update(this.id, blob); },
            remove() { return drive.remove(this.id); },
        }));
        return {
            items: files,
            next: result.nextPageToken
        };
    }
    /**
     * @param {string} name 
     * @param {Blob} blob 
     */
    async writeFile(name, blob) {
        let f = await this.drive.create(name, '', blob.type, this._folderId);
        console.log(JSON.parse(f.body));
        return await this.drive.update(JSON.parse(f.body).id, blob);
    }
    async mkdir(name) {
        await this.drive.mkdir(name, this._folderId);
    }
    getParentPath() {
        return this._parent && this._pathPrefix + this._parent;
    }
}

export class GoogleApiLoader {
    available() {
        return clientIds[location.origin] !== undefined;
    }

    load(force = false) {
        if (!force && GoogleApiLoader._promise) {
            return GoogleApiLoader._promise;
        }
        return GoogleApiLoader._promise = new Promise((resolve) => {
            globalThis[callbackName] = () => {
                delete globalThis[callbackName];
                resolve();
            };
            let gapiScript = document.createElement('script');
            gapiScript.src = gapiUrl;
            gapiScript.async = true;
            document.body.append(gapiScript);
        });
    }

    async auth(scope, signIn = true) {
        await this.load();
        let authParams = {
            'client_id': clientIds[location.origin],
            'scope': scope
        };
        await new Promise((resolve) => gapi.load('client:auth2', resolve));
        let auth = await gapi.auth2.init(authParams);
        if (!auth.isSignedIn.get()) {
            if (!signIn) return false;
            await auth.signIn();
        }
        return true;
    }
}

export async function install() {
    let apiLoader = new GoogleApiLoader();
    if (!apiLoader.available()) {
        console.log("No clientId for Google Drive: " + location.origin);
        return false;
    }

    if (!await apiLoader.auth('https://www.googleapis.com/auth/drive', false)) {
        console.log("not logged-in");
        return false;
    }

    let drive = new GoogleDrive();
    await drive.init();

    globalThis.storageAccessors = globalThis.storageAccessors || {};
    globalThis.storageAccessors["GoogleDrive"] = {
        name: "Google Drive",
        root: 'root',
        getFolder: (folder, prefix) => new GoogleDriveFileList(folder, drive, prefix),
        parsePath: (path) => path ? [[path]] : []
    };
    return true;
}

install();
