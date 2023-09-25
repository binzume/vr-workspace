// https://developer.chrome.com/docs/apps/offline_storage/

export class WebkitFileSystemWrapper {
    constructor(type) {
        this._type = type;
        this._storage = type == window.PERSISTENT ? navigator.webkitPersistentStorage : navigator.webkitTemporaryStorage;
        // window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
        // window.directoryEntry = window.directoryEntry || window.webkitDirectoryEntry;
    }

    available() {
        return this._type !== undefined && this._storage !== undefined && window.webkitRequestFileSystem !== undefined;
    }

    async quota() {
        return new Promise((resolve, reject) =>
            this._storage.queryUsageAndQuota((u, a) => resolve({ usedBytes: u, grantedBytes: a }), reject));
    }

    async requestQuota(bytes) {
        return new Promise((resolve, reject) => this._storage.requestQuota(bytes, resolve, reject));
    }

    async requestFileSystem(bytes) {
        if (!bytes) {
            bytes = (await this.quota()).grantedBytes;
        }
        this.filesystem = await new Promise((resolve, reject) => window.webkitRequestFileSystem(this._type, bytes, resolve, reject));
        return this.filesystem;
    }

    async _getDirectory(path) {
        return new Promise((resolve, reject) => this.filesystem.root.getDirectory(path, null, resolve, reject));
    }

    async entries(dirPath) {
        if (!this.filesystem) {
            await this.requestFileSystem();
        }
        let ent = dirPath == "" ? this.filesystem.root : await this._getDirectory(dirPath);
        let reader = ent.createReader();
        let ret = [];
        let files;
        do {
            files = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
            ret = ret.concat(files);
        } while (files.length > 0);
        return ret;
    }
    async mkdir(path) {
        let n = '';
        for (let p of path.split('/')) {
            if (!p) continue;
            n = n ? n + '/' + p : p;
            await new Promise((resolve, reject) => this.filesystem.root.getDirectory(n, { create: true }, resolve, reject));
        }
    }
    /**
     * @param {string} path 
     * @param {Blob} content 
     * @param {*} options 
     */
    async writeFile(path, content, options = {}) {
        if (!this.filesystem) {
            await this.requestFileSystem();
        }
        if (options.mkdir) {
            let p = path.lastIndexOf('/');
            if (p > 0) {
                await this.mkdir(path.substring(0, p));
            }

        }
        let file = await new Promise((resolve, reject) => this.filesystem.root.getFile(path, { create: true }, resolve, reject));
        let writer = await new Promise((resolve, reject) => file.createWriter(resolve, reject));
        await new Promise((resolve, reject) => { writer.onwriteend = resolve; writer.onerror = reject; writer.truncate(0); });
        await new Promise((resolve, reject) => { writer.onwriteend = resolve; writer.onerror = reject; writer.write(content); });
    }
}

class WebkitFileSystemWrapperFileList {
    constructor(path, storage, prefix = '') {
        this._storage = storage;
        this._pathPrefix = prefix;
        this._path = path;
        this.items = [];
        this.size = -1;
    }

    async init() {
        let entries = await this._storage.entries(this._path);
        let getFile = (ent) => ent.isFile ? new Promise((resolve, reject) => ent.file(resolve, reject)) : Promise.resolve(null);
        let files = await Promise.all(entries.map(async (entry) => {
            return [entry, await getFile(entry)];
        }));
        let storage = this._storage;
        this.items = files.map(([entry, file]) => ({
            name: entry.name,
            type: entry.isFile ? file.type : 'folder',
            size: file?.size,
            path: this._pathPrefix  + this._path + '/' + entry.name,
            url: file && URL.createObjectURL(file),
            updatedTime: file ? new Date(file.lastModified).toISOString() : null,
            remove() { return new Promise((resolve, reject) => this._entry.remove(resolve, reject)); },
            async fetch(start, end) {
                let file = await getFile(this._entry);
                return start != null ? file.slice(start, end) : file;
            },
            async update(blob) {
                await storage.writeFile(this._entry.fullPath, blob);
                this.size = blob.size;
                return this;
            },
            _entry: entry,
        }));
        this.size = this.items.length;
    }

	async getInfo() {
        if (this.size < 0) {
            await this.init();
        }
        return {
            type: 'folder',
            size: this.size,
        };
    }

    async getFiles(offset, limit, options = null, signal = null) {
        if (this.size < 0) {
            await this.init();
        }
        if (options && options.sortField) {
            this._sort(this.items, options.sortField, options.sortOrder);
        }
        return {
            items: this.items,
            total: this.items.length
        };
    }

    _sort(items, field, order) {
        let r = order === "a" ? 1 : -1;
        if (field === "name") {
            items.sort((a, b) => (a.name || "").localeCompare(b.name) * r);
        } else if (field === "updatedTime") {
            items.sort((a, b) => (a.updatedTime || "").localeCompare(b.updatedTime) * r);
        } else if (field === "size") {
            items.sort((a, b) => ((a.size && b.size) ? a.size - b.size : 0) * r);
        } else if (field === "type") {
            items.sort((a, b) => (a.type || "").localeCompare(b.type) * r);
        }
    }

    mkdir(name) {
        console.log(this._path + '/' + name);
        return this._storage.mkdir(this._path + '/' + name);
    }

    writeFile(name, blob, options = {}) {
        return this._storage.writeFile(this._path + '/' + name, blob, options);
    }

    getParentPath() {
        if (this._path == '' || this._path == '/') {
            return null;
        }
        return this._pathPrefix + this._path.substring(0, this._path.lastIndexOf('/'));
    }
}

export async function install() {
    let storageType = window.PERSISTENT;
    let storageWrapper = new WebkitFileSystemWrapper(storageType);

    if (!storageWrapper.available()) {
        console.log("webkitFileSystem is not supported.");
        return false;
    }

    let quota = await storageWrapper.quota();
    if (quota.grantedBytes == 0) {
        console.log("no storage quota.");
        return false;
    }

    // const storageSize = 1024 * 1024 * 10;
    // await storageWrapper.requestQuota(storageSize);
    // await storageWrapper.writeFile("test.txt", new Blob(["Hello!"]));

    globalThis.storageAccessors = globalThis.storageAccessors || {};
    globalThis.storageAccessors['WebkitFileSystem'] = {
        name: "Local",
        getFolder: (folder, prefix) => new WebkitFileSystemWrapperFileList(folder, storageWrapper, prefix),
        parsePath: (path) => path ? path.split('/').map(p => [p]) : [],
    };
    return true;
}

install();
