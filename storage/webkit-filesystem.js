// https://developer.chrome.com/docs/apps/offline_storage/

class FileSystemWrapper {
    /**
     * 
     * @param {FileSystemDirectoryHandle} handle 
     * @param {StorageManager} storageManager 
     */
    constructor(handle, storageManager) {
        this.writable = storageManager != null;
        this._rootHandle = handle;
        this._storageManager = storageManager;
    }

    available() {
        return this._rootHandle != null || this._storageManager != null;
    }

    async quota() {
        let a = await this._storageManager.estimate();
        return { usedBytes: a.usage, grantedBytes: a.quota };
    }

    async setWritable(writable) {
        this.writable = writable;
        if (writable) {
            return await (await this._root()).requestPermission({ mode: 'readwrite' }) === 'granted';
        }
    }
    async stat(path) {
        return await this.statInternal(await this.resolvePath(path));
    }
    async files(path, offset = 0, limit = -1) {
        let h = await this.resolvePath(path, 'directory');
        if (limit == 0) { return []; }
        let fileTasks = [];
        let pos = 0;
        for await (let ent of h.values()) {
            if (pos++ < offset) { continue; }
            fileTasks.push(this.statInternal(ent));
            if (limit > 0 && fileTasks.length >= limit) { break; }
        }
        return Promise.all(fileTasks);
    }
    async read(path, offset = 0, len) {
        if (path.endsWith('#thumbnail.jpeg')) {
            let file = await this.resolveFile(path.substring(0, path.lastIndexOf('#')));
            let blob = await this.createThumbnail(file);
            return blob.slice(offset, offset + len);
        }
        let file = await this.resolveFile(path);
        return file.slice(offset, offset + len);
    }
    async write(path, offset = 0, data) {
        if (!this.writable) { throw 'readonly'; }
        let handle = await this.resolvePath(path, 'file');
        let writer = await handle.createWritable({ keepExistingData: true });
        await writer.seek(offset);
        await writer.write(data);
        await writer.close();
        return data.length;
    }
    async remove(path, options) {
        if (!this.writable) { throw 'readonly'; }
        let dir = '', name = path;
        let p = path.lastIndexOf('/');
        if (p > 0) {
            dir = path.substring(0, p);
            name = path.substring(p + 1);
        }
        let hdir = /** @type {FileSystemDirectoryHandle} */(await this.resolvePath(dir));
        await hdir.removeEntry(name, options);
        return true;
    }

    async mkdir(path) {
        if (!this.writable) { throw 'readonly'; }
        let p = path.split('/').filter(p => p);
        let h = await this._root();
        for (let i = 0; i < p.length; i++) {
            h = await h.getDirectoryHandle(p[i], { create: true });
        }
        return h;
    }

    /**
     * @param {string} path 
     * @param {Blob} content 
     * @param {*} options 
     */
    async writeFile(path, content, options = {}) {
        if (!this.writable) { throw 'readonly'; }
        if (options.mkdir) {
            let p = path.lastIndexOf('/');
            if (p > 0) {
                await this.mkdir(path.substring(0, p));
            }

        }
        let handle = await this.resolvePath(path, 'file', true);
        let writer = await handle.createWritable({ keepExistingData: options.keepExistingData });
        await writer.write(content);
        await writer.close();
    }

    async getFile(path) {
        let handle = await this.resolvePath(path, 'file', false);
        return await this.statInternal(handle);
   }

    /**
     * @param {string} path
     * @return {Promise<FileSystemFileHandle>}
     */
    async resolvePath(path, kind = null, create = false) {
        let h = await this._root();
        let p = path.split('/');
        let wrap = async (/** @type {Promise<FileSystemFileHandle>} */ t) => { try { return await t; } catch { } };
        for (let i = 0; i < p.length; i++) {
            if (p[i] == '' || p[i] == '.') { continue; }
            let c = await ((i == p.length - 1 && kind == 'file') ? wrap(h.getFileHandle(p[i], { create })) : wrap(h.getDirectoryHandle(p[i])));
            if (!c && kind == null) { c = await wrap(h.getFileHandle(p[i])); }
            if (!c) throw 'noent';
            h = c;
        }
        return h;
    }
    /**
     * @param {string} path
     * @return {Promise<File>}
     */
    async resolveFile(path) {
        return await (await this.resolvePath(path, 'file')).getFile();
    }

    async _root() {
        if (!this._rootHandle) {
            this._rootHandle = await this._storageManager.getDirectory();
        }
        return this._rootHandle;
    }

    /**
     * @param {FileSystemHandle2} handle 
     */
    async statInternal(handle) {
        if (handle.kind == 'file') {
            let f = await handle.getFile();
            let stat = { type: f.type || 'file', name: f.name, size: f.size, updatedTime: f.lastModified, _file: f }
            if (["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"].includes(f.type)) {
                stat.metadata = { thumbnail: "#thumbnail.jpeg" };
            }
            return stat;
        } else {
            return { type: 'folder', size: 0, name: handle.name, updatedTime: null }
        }
    }

    /**
     * @param {Blob} file 
     * @returns {Promise<Blob>}
     */
    async createThumbnail(file, maxWidth = 200, maxHeight = 200) {
        let canvas = document.createElement('canvas');
        let drawThumbnail = (image, w, h) => {
            if (w > maxWidth) {
                h = h * maxWidth / w;
                w = maxWidth;
            }
            if (h > maxHeight) {
                w = w * maxHeight / h;
                h = maxHeight;
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(image, 0, 0, w, h);
        };
        let objectUrl = URL.createObjectURL(file);
        let media;
        try {
            if (file.type.startsWith('video')) {
                // TODO: detect background tab
                media = document.createElement('video');
                media.muted = true;
                media.autoplay = true;
                await new Promise((resolve, reject) => {
                    media.onloadeddata = resolve;
                    media.onerror = reject;
                    media.src = objectUrl;
                    setTimeout(reject, 3000);
                });
                await new Promise((resolve, _reject) => {
                    media.onseeked = resolve;
                    media.currentTime = 3;
                    setTimeout(resolve, 500);
                });
                drawThumbnail(media, media.videoWidth, media.videoHeight);
            } else {
                media = new Image();
                await new Promise((resolve, reject) => {
                    media.onload = resolve;
                    media.onerror = reject;
                    media.src = objectUrl;
                    setTimeout(reject, 5000);
                });
                drawThumbnail(media, media.naturalWidth, media.naturalHeight);
            }
        } finally {
            if (media) { media.src = ''; }
            URL.revokeObjectURL(objectUrl);
        }
        return await new Promise((resolve, _) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    }
}

export class WebkitFileSystemWrapper {
    constructor(persistent) {
        this._type = persistent ? window.PERSISTENT : window.TEMPORARY;
        this._storage = persistent ? navigator.webkitPersistentStorage : navigator.webkitTemporaryStorage;
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

    async files(path) {
        let entries = await this.entries(path);
        return await Promise.all(entries.map((entry) => this.statInternal(entry)));
    }

    async mkdir(path) {
        let n = '';
        for (let p of path.split('/')) {
            if (!p) continue;
            n = n ? n + '/' + p : p;
            await new Promise((resolve, reject) => this.filesystem.root.getDirectory(n, { create: true }, resolve, reject));
        }
    }

    async getFile(path) {
        if (!this.filesystem) {
            await this.requestFileSystem();
        }
        let file = await new Promise((resolve, reject) => this.filesystem.root.getFile(path, {}, resolve, reject));
        return await this.statInternal(file);
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
    async statInternal(entry) {
        let file = entry.isFile ? (await new Promise((resolve, reject) => entry.file(resolve, reject))) : null;
        let storage = this;
        return {
            name: entry.name,
            type: entry.isFile ? file.type : 'folder',
            size: file?.size,
            updatedTime: file ? file.lastModified : null,
            remove() { return new Promise((resolve, reject) => entry.remove(resolve, reject)); },
            async update(blob) {
                await storage.writeFile(entry.fullPath, blob);
                this.size = blob.size;
                return this;
            },
            _file: file,
        };
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
        let files = await this._storage.files(this._path);
        this.items = files.map(f => this._procFile(f));
        this.size = this.items.length;
    }

    _procFile(f) {
        let path = (this._path ? this._path + '/' : '') + f.name;
        f.path = this._pathPrefix + path;
        f.url = f._file && URL.createObjectURL(f._file);
        f.remove || (f.remove = () => this._storage.remove(path, {recursive: true}));
        if (f.metadata && f.metadata.thumbnail) {
            f.thumbnail = {fetch: async (start, end) => new Response(await this._storage.read(path + f.metadata.thumbnail, start, 99999))};
        }
        if (f._file) {
            f.fetch = async(start, end) => {
                return new Response(start != null ? f._file.slice(start, end) : f._file);
            };
        }
        return f;
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
            items: this.items.slice(offset),
            total: this.items.length
        };
    }

    _sort(items, field, order) {
        let r = order === "a" ? 1 : -1;
        if (field === "name") {
            items.sort((a, b) => (a.name || "").localeCompare(b.name) * r);
        } else if (field === "updatedTime") {
            items.sort((a, b) => ((a.updatedTime && b.updatedTime) ? a.updatedTime - b.updatedTime : 0) * r);
        } else if (field === "size") {
            items.sort((a, b) => ((a.size && b.size) ? a.size - b.size : 0) * r);
        } else if (field === "type") {
            items.sort((a, b) => (a.type || "").localeCompare(b.type) * r);
        }
    }

    mkdir(name) {
        return this._storage.mkdir(this._path + '/' + name);
    }

    writeFile(name, blob, options = {}) {
        return this._storage.writeFile(this._path + '/' + name, blob, options);
    }

    async getFile(name) {
        return this._procFile(await this._storage.getFile(this._path + '/' + name));
    }

    getParentPath() {
        if (this._path == '' || this._path == '/') {
            return null;
        }
        return this._pathPrefix + this._path.substring(0, this._path.lastIndexOf('/'));
    }
}

export async function install() {
    let stdStorageWrapper = new FileSystemWrapper(null, navigator.storage);
    if (stdStorageWrapper.available()) {
        globalThis.storageAccessors = globalThis.storageAccessors || {};
        globalThis.storageAccessors['local'] = {
            name: "Local",
            getFolder: (folder, prefix) => new WebkitFileSystemWrapperFileList(folder, stdStorageWrapper, prefix),
            parsePath: (path) => path ? path.split('/').map(p => [p]) : [],
        };
    }

    let storageWrapper = new WebkitFileSystemWrapper(true);

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
        name: "WebkitLocal",
        getFolder: (folder, prefix) => new WebkitFileSystemWrapperFileList(folder, storageWrapper, prefix),
        parsePath: (path) => path ? path.split('/').map(p => [p]) : [],
    };
    return true;
}

install();
