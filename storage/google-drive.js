"use strict";

// <script src="google-drive.js" type="module"></script>
// <script src="https://apis.google.com/js/api.js?onload=gapiLoaded" async defer></script>


const gapiUrl = 'https://apis.google.com/js/api.js';
const clientIds = {
    "http://localhost:8080": "86954684848-e879qasd2bnnr4pcdiviu68q423gbq4m.apps.googleusercontent.com",
    "http://nas.binzume.net": "763907720984-n3vo8j6d788jdg22p7sfqoturvtbqk3i.apps.googleusercontent.com",
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
    /** @returns {Promise<{nextPageToken: string, files: any[]}>} */
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
    /** @returns {Promise<any>} */
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
    /** @returns {Promise<any[]>} */
    async getFileByName(folder, name) {
        let response = await gapi.client.drive.files.list({
            fields: "nextPageToken, files(id, name, size, mimeType, modifiedTime, iconLink, thumbnailLink)",
            q: "trashed=false and '" + (folder || 'root') + "' in parents and name='" + name + "'",
            pageSize: 10,
            spaces: "drive"
        });
        if (!response || response.status != 200) {
            return null;
        }
        return response.result.files;
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
    async update(fileId, body, type = null) {
        let url = "https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=media";
        let headers = { 'Authorization': 'Bearer ' + gapi.auth.getToken().access_token };
        if (body.type || type) {
            headers['Content-Type'] = body.type || type;
        }

        let response = await fetch(url, { method: 'PATCH', headers: new Headers(headers), body: body });
        if (!response.ok) throw new Error(response.statusText);
        return response;
    }
    async createWritable(fileId, type) {
        let { readable, writable } = new TransformStream();
        this.update(fileId, readable, type);
        return writable;
    }
    async mkdir(name, parent = null) {
        return await gapi.client.drive.files.create({
            name: name,
            parents: [parent || 'root'],
            fields: "id, name, parents",
            mimeType: 'application/vnd.google-apps.folder'
        });
    }
    async getBlob(fileId) {
        let url = this.getFileMediaUrl(fileId);
        let headers = { 'Authorization': 'Bearer ' + gapi.auth.getToken().access_token };
        let response = await fetch(url, { headers: new Headers(headers) });
        if (!response.ok) throw new Error(response.statusText);
        return await response.blob();
    }
}

class GoogleDriveFileHandle {
    constructor(fileId, drive, pathPrefix) {
        this._fileId = fileId;
        this._name = "";
        this._parent = null;
        /** @type {GoogleDrive} */
        this.drive = drive;
        this.onupdate = null;
        this.sequentialAccess = true;
        this._pathPrefix = pathPrefix;
        this.backend = 'GoogleDrive';
    }
    async getInfo() {
        if (!this._name) {
            await this.drive.getFile(this._fileId).then(f => {
                this._name = f.name;
                if (f.parents && f.parents.length > 0) {
                    this._parent = f.parents[0];
                }
            });
        }
        return {
            type: 'folder',
            name: this._name,
            path: this._pathPrefix + this._fileId,
            size: -1,
        };
    }
    async stat(options = {}) {
        return this._procFile(await this.drive.getFile(this._fileId));
    }
    async getFiles(offset, limit, options = null, signal = null) {
        options = options || {};
        let driveOption = options.driveOptions || {};
        let order = options.sortOrder == "d" ? " desc" : "";
        if (options.sortField == "name") {
            driveOption.orderBy = "name" + order;
        } else if (options.sortField == "updatedTime") {
            driveOption.orderBy = "modifiedTime" + order;
        } else if (options.sortField == "size") {
            driveOption.orderBy = "quotaBytesUsed" + order;
        }
        let result = await this.drive.getFiles(this._fileId, limit, offset ? offset : null, driveOption);
        signal?.throwIfAborted();
        return {
            items: result.files.map(f => this._procFile(f)),
            next: result.nextPageToken
        };
    }
    async getFile(name) {
        let files = await this.drive.getFileByName(this._fileId, name);
        if (files && files.length) {
            return this._procFile(files[0]);
        }
        return null;
    }
    _procFile(f) {
        let drive = this.drive;
        return f && {
            type: f.mimeType == "application/vnd.google-apps.folder" ? "folder" : f.mimeType,
            id: f.id,
            path: this._pathPrefix + f.id,
            name: f.name,
            size: f.size,
            tags: [],
            thumbnailUrl: (f.thumbnailLink && !f.thumbnailLink.startsWith("https://docs.google.com/")) ? f.thumbnailLink : null,
            updatedTime: f.modifiedTime,
            fetch(start, end) { return drive.fetch(this.id, start, end); },
            async stream() { return (await drive.fetch(this.id)).body; },
            createWritable() { return drive.createWritable(this.id, this.type); },
            update(blob) { return drive.update(this.id, blob); },
            remove() { return drive.remove(this.id); },
        };
    }
    /**
     * @param {string} name 
     * @param {Blob} blob 
     */
    async writeFile(name, blob) {
        let f = await this.drive.create(name, '', blob.type, this._fileId);
        await this.drive.update(JSON.parse(f.body).id, blob);
        return await this.getFile(name);
    }
    async mkdir(name) {
        await this.drive.mkdir(name, this._fileId);
    }
    getParentPath() {
        return this._parent && this._pathPrefix + this._parent;
    }
}

export class GoogleApiLoader {
    static _promise = null;
    available() {
        return clientIds[location.origin] !== undefined;
    }

    load(force = false) {
        if (!force && GoogleApiLoader._promise) {
            return GoogleApiLoader._promise;
        }
        return GoogleApiLoader._promise = new Promise((resolve) => {
            let gapiScript = document.createElement('script');
            gapiScript.src = gapiUrl;
            gapiScript.async = true;
            gapiScript.onload = resolve;
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
        writable: true,
        name: "Google Drive",
        root: 'root',
        getFolder: (path, prefix) => new GoogleDriveFileHandle(path, drive, prefix),
        getFile: (path, prefix) => new GoogleDriveFileHandle(path, drive, prefix).stat(),
        parsePath: (path) => path ? [[path]] : []
    };
    return true;
}

install();
