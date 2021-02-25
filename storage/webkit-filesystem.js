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
        return new Promise((resolve, reject) => this.filesystem.root.getDirectory(path, resolve, reject));
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

    async writeFile(path, content) {
        if (!this.filesystem) {
            await this.requestFileSystem();
        }
        let file = await new Promise((resolve, reject) => this.filesystem.root.getFile(path, { create: true }, resolve, reject));
        let writer = await new Promise((resolve, reject) => file.createWriter(resolve, reject));
        writer.write(content);
    }
}

class WebkitFileSystemWrapperFileList {
    constructor(folder, options, storage) {
        this._storage = storage;
        this._folder = folder;
        this.itemPath = folder || 'WebkitFileSystem';
        this.items = [];
        this.size = -1;
    }

    async init() {
        let entries = await this._storage.entries(this._folder);
        let files = await Promise.all(entries.map(entry => {
            if (!entry.isFile) {
                return Promise.resolve([entry, null]);
            }
            return new Promise((resolve, reject) => entry.file(f => resolve([entry, f]), reject));
        }));
        this.items = files.map(([entry, file]) => ({
            name: entry.name, path: entry.fullPath, type: file?.type, size: file?.size,
            url: file && URL.createObjectURL(file),
            _entry: entry
        }));
        this.size = this.items.length;
    }

    async get(position) {
        return this.items[position];
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
        root: '',
        writable: true,
        shortcuts: {},
        getList: (folder, options) => new WebkitFileSystemWrapperFileList(folder, options, storageWrapper),
        saveFile: (path, blob) => storageWrapper.writeFile(path, blob),
    };
    return true;
}

install();
