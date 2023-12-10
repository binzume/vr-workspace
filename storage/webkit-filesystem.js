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
    async blob(path) {
        return await this.resolveFile(path);
    }
    async createWritable(path, options) {
        if (!this.writable) { throw 'readonly'; }
        if (options.mkdir) {
            let p = path.lastIndexOf('/');
            if (p > 0) {
                await this.mkdir(path.substring(0, p));
            }
        }
        let handle = await this.resolvePath(path, 'file', true);
        let writer = await handle.createWritable(options);
        return writer;
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

    async getFile(path, options = {}) {
        let handle = await this.resolvePath(path, 'file', options.create);
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
     * @param {FileSystemFileHandle|FileSystemDirectoryHandle} handle 
     */
    async statInternal(handle) {
        if (handle.kind == 'file') {
            let f = await handle.getFile();
            return { type: f.type || '', name: f.name, size: f.size, updatedTime: f.lastModified, _file: f, _handle: handle }
        } else {
            return { type: 'folder', size: 0, name: handle.name, updatedTime: null, _handle: handle }
        }
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

    async getFile(path, options = {}) {
        if (!this.filesystem) {
            await this.requestFileSystem();
        }
        let file = await new Promise((resolve, reject) => this.filesystem.root.getFile(path, { create: options.create }, resolve, reject));
        return await this.statInternal(file);
    }
    async blob(path) {
        let f = await this.getFile(path);
        return f._file;
    }
    /**
     * @param {string} path
     * @param {*} options
     */
    async createWritable(path, options = {}) {
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
        /** @type {WritableStream & {truncate: (pos:number)=>Promise<void>}} */
        // @ts-ignore
        let ws = new WritableStream({
            write: (/** @type {ArrayBuffer|any} */ chunk, _controller) => {
                if (chunk.type == 'seek') {
                    // TODO
                    return;
                }
                return new Promise((resolve, reject) => { writer.onwriteend = resolve; writer.onerror = reject; writer.write(chunk); });
            }
        });
        ws.truncate = (sz) => new Promise((resolve, reject) => { writer.onwriteend = resolve; writer.onerror = reject; writer.truncate(sz); });
        if (!options.keepExistingData) {
            await ws.truncate(0);
        }
        return ws;
    }
    async statInternal(entry) {
        let file = entry.isFile ? (await new Promise((resolve, reject) => entry.file(resolve, reject))) : null;
        return {
            name: entry.name,
            type: entry.isFile ? file.type : 'folder',
            size: file ? file.size : null,
            updatedTime: file ? file.lastModified : null,
            remove() { return new Promise((resolve, reject) => entry.remove(resolve, reject)); },
            _file: file,
        };
    }
}

class WebkitFileSystemWrapperFileList {
    constructor(path, storage, prefix = '', backendName = '') {
        this._storage = storage;
        this._pathPrefix = prefix;
        this._path = path;
        this.items = [];
        this.size = -1;
        this.backend = backendName;
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
        f.remove || (f.remove = () => this._storage.remove(path, { recursive: true }));
        if (f._handle && f._handle.move) {
            f.rename = async (name) => f._handle.move(name);
        }
        if (f.type != 'folder') {
            f.update = async (blob) => {
                let ws = await this._storage.createWritable(path);
                await ws.getWriter().write(blob);
                await ws.close();
                f.size = blob.size;
                f.type = blob.type;
                return this;
            };
            f.createWritable = (options) => this._storage.createWritable(path, options);
        }
        if (f._file) {
            f.fetch = async (start, end) => {
                return new Response(start != null ? f._file.slice(start, end) : f._file);
            };
            f.stream = () => f._file.stream();
        }
        if (["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"].includes(f.type)) {
            f.thumbnail = {
                type: 'image/jpeg',
                fetch: async (start, end) => {
                    let blob = await this._storage.blob(path);
                    let thumb = await this._createThumbnail(blob);
                    return new Response(thumb.slice(start || 0, end || thumb.size));
                }
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

    async writeFile(name, blob, options = {}) {
        let path = this._path + '/' + name;
        /** @type {WritableStream} */
        let ws = await this._storage.createWritable(path, options);
        let writer = ws.getWriter();
        await writer.write(blob);
        await writer.close();
        return await this.getFile(name);
    }

    async getFile(name, options = {}) {
        return this._procFile(await this._storage.getFile(this._path + '/' + name, options));
    }

    getParentPath() {
        if (this._path == '' || this._path == '/') {
            return null;
        }
        return this._pathPrefix + this._path.substring(0, this._path.lastIndexOf('/'));
    }

    /**
     * @param {Blob} file 
     * @returns {Promise<Blob>}
     */
    async _createThumbnail(file, maxWidth = 200, maxHeight = 200) {
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

export async function install() {
    globalThis.storageAccessors = globalThis.storageAccessors || {};
    let stdStorageWrapper = new FileSystemWrapper(null, navigator.storage);
    if (stdStorageWrapper.available()) {
        globalThis.storageAccessors['local'] = {
            writable: true,
            name: "Local",
            getFolder: (folder, prefix) => new WebkitFileSystemWrapperFileList(folder, stdStorageWrapper, prefix, 'Local'),
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

    globalThis.storageAccessors['WebkitFileSystem'] = {
        writable: true,
        name: "WebkitLocal",
        getFolder: (folder, prefix) => new WebkitFileSystemWrapperFileList(folder, storageWrapper, prefix, 'WebkitFileSystem'),
        parsePath: (path) => path ? path.split('/').map(p => [p]) : [],
    };
    if (!stdStorageWrapper.available()) {
        // fallback
        globalThis.storageAccessors['local'] = {
            writable: true,
            name: "Local",
            getFolder: (folder, prefix) => new WebkitFileSystemWrapperFileList(folder, storageWrapper, prefix, 'WebkitFileSystem'),
            parsePath: (path) => path ? path.split('/').map(p => [p]) : [],
        };
    }

    return true;
}

install();
