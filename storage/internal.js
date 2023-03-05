
/** 
 * @typedef {{name: string; type: string; url: string; fetch:((pos?:number)=>Promise<Response>)?; size: number?}} ContentInfo
 */

export class BaseFileList {
    /**
     * @param {string} itemPath
     * @param {{[key:string]:string}?} options
     */
    constructor(itemPath, options) {
        this.itemPath = itemPath;
        this.options = options || {};
        this.size = -1;
        this.name = "";
        /** @type {string} */
        this.thumbnailUrl = null;
        this.onupdate = null;
    }

    /**
     * @returns {Promise<void>}
     */
    async init() {
        await this.get(0)
    }

    /**
     * @returns {Promise<ContentInfo>}
     */
    async get(position) {
        throw 'not implemented';
    }

    notifyUpdate() {
        if (this.onupdate) {
            this.onupdate();
        }
    }
}

class ItemList extends BaseFileList {
    /**
     * @param {string} apiUrl
     * @param {string} itemPath
     * @param {{[key:string]:string}?} options
     */
    constructor(apiUrl, itemPath, options, prefix = '') {
        super(itemPath, options);
        this.apiUrl = apiUrl;
        this.name = itemPath;
        this._pathPrefix = prefix;
        this._pageSize = 20;
        /** @type {Map<number, [page: any] | [Promise, AbortController]>} */
        this._pageCache = new Map();
        this._pageCacheMax = 10;
    }
    init() {
        return this._load(0);
    }
    /**
     * @param {number} position
     */
    async get(position) {
        if (position < 0 || this.size >= 0 && position >= this.size) throw "Out of Range error.";
        let item = this._getOrNull(position);
        if (item != null) {
            return item;
        }
        let result = await this._load(position / this._pageSize | 0);
        return result && result[position % this._pageSize];
    }
    /**
     * @param {number} page
     */
    async _load(page) {
        let cache = this._pageCache.get(page);
        if (cache != null) {
            return (cache.length == 2) ? await cache[0] : cache[0];
        }
        for (const [p, c] of this._pageCache) {
            if (this._pageCache.size < this._pageCacheMax) {
                break;
            }
            console.log("invalidate: " + p, c[1] != null);
            this._pageCache.delete(p);
            c[1] != null && c[1].abort();
        }

        let ac = new AbortController();
        let task = (async (signal) => {
            await new Promise((resolve) => setTimeout(resolve, this._pageCache.size));
            console.log("fetch page:", page, signal.aborted);
            let result = await this.getFiles(page * this._pageSize, this._pageSize, this.options, signal);
            return result.items;
        })(ac.signal);
        try {
            this._pageCache.set(page, [task, ac]);
            let result = await task;
            if (this._pageCache.has(page)) {
                this._pageCache.set(page, [result]);
            }
            return result;
        } catch (e) {
            this._pageCache.delete(page);
        }
    }
    async getFiles(offset, limit, options = null, signal = null) {
        let params = "?offset=" + offset + "&limit=" + limit;
        if (options.orderBy) params += "&orderBy=" + options.orderBy;
        if (options.order) params += "&order=" + options.order;
        let response = await fetch(this.apiUrl + this.itemPath + params, { signal: signal });
        if (!response.ok) {
            throw "fetch error";
        }
        let result = await response.json();
        signal?.throwIfAborted();

        let baseUrl = (this.apiUrl + this.itemPath).replace(/[^/]+$/, '');
        let convUrl = (path) => {
            if (path == null || path.includes('://')) return path;
            if (!path.startsWith('/')) {
                return baseUrl + path;;
            }
            return path;
        };
        for (let item of result.items) {
            item.url = convUrl(item.url);
            item.thumbnailUrl = convUrl(item.thumbnailUrl);
            if (item.type == '') {
                let m = item.name.match(/\.(\w+)$/);
                if (m) {
                    item.type = 'application/' + m[1].toLowerCase();
                }
            }
            if (item.path) {
                item.path = this._pathPrefix + item.path;
            }
        }
        this.size = result.total || (offset + result.items.length);
        this.name = result.name || this.itemPath;
        if (!this.thumbnailUrl && result.items[0]) this.thumbnailUrl = result.items[0].thumbnailUrl;
        return {
            items: result.items,
            next: result.more ? offset + result.items.length : null,
            total: result.total
        };
    }

    getParentPath() {
        if (this.itemPath == '' || this.itemPath == '/') {
            return null;
        }
        return this.itemPath.substring(0, this.itemPath.lastIndexOf('/'));
    }
    _getOrNull(position) {
        let page = position / this._pageSize | 0;
        let cache = this._pageCache.get(page);
        if (cache) {
            this._pageCache.delete(page);
            this._pageCache.set(page, cache);
            return cache[0][position - this._pageSize * page];
        }
        return null;
    }
}

class OnMemoryFileList extends BaseFileList {
    constructor(items, options, prefix = '') {
        super('', options);
        this._pathPrefix = prefix;
        this.setItems(items);
    }
    setItems(items) {
        this.items = items;
        let options = this.options;
        if (options.orderBy) {
            this._setSort(options.orderBy, options.order);
        }
        this.size = this.items.length;
    }
    init() {
        return this.get(0)
    }
    get(position) {
        return Promise.resolve(this.items[position]);
    }
    contains(item) {
        return this.items.some(i => i.storage === item.storage && i.path === item.path);
    }
    async getFiles(offset, limit, options = null, signal = null) {
        if (options && options.sortField) {
            this._setSort(options.sortField, options.sortOrder);
        }
        limit ||= this.items.length;
        return {
            items: this.items.slice(offset, offset + limit),
            next: offset + limit < this.items.length ? offset + limit : null,
        };
    }
    _setSort(orderBy, order) {
        let r = order === "a" ? 1 : -1;
        if (orderBy === "name") {
            this.items.sort((a, b) => (a.name || "").localeCompare(b.name) * r);
        } else if (orderBy === "updated") {
            this.items.sort((a, b) => (a.updatedTime || "").localeCompare(b.updatedTime) * r);
        } else if (orderBy === "size") {
            this.items.sort((a, b) => ((a.size && b.size) ? a.size - b.size : 0) * r);
        }
    }
}

class LocalList extends OnMemoryFileList {
    constructor(listName, options, prefix = '') {
        let items = [];
        let s = localStorage.getItem(listName);
        if (s !== null) {
            items = JSON.parse(s);
        }
        super(items, options, prefix);
        this.itemPath = listName;
        this.name = "Favorites";
    }
    addItem(item, storage = null) {
        if (this.contains(item)) return;
        this.items.push(item);
        this.setItems(this.items);
        localStorage.setItem(this.itemPath, JSON.stringify(this.items));
        this.notifyUpdate();
    }
    removeItem(item, storage = null) {
        let s = storage || item.storage, path = item.path;
        this.items = this.items.filter(i => i.storage != s || i.path != path);
        this.setItems(this.items);
        localStorage.setItem(this.itemPath, JSON.stringify(this.items));
        this.notifyUpdate();
    }
    clear() {
        this.items = [];
        this.size = 0;
        localStorage.removeItem(this.itemPath);
        this.notifyUpdate();
    }
    _getOrNull(position) {
        return this.items[position];
    }
}


class StorageList extends BaseFileList {
    constructor(accessors, options) {
        super('', options);
        this.accessors = accessors || {};
        this.itemPath = '/';
        this.name = "Storage";
        this._update();
    }
    _update() {
        /**
         * @type {object[]}
         */
        let items = [];
        for (let [k, sa] of Object.entries(this.accessors)) {
            if (sa == this) {
                continue;
            }
            if (sa.shortcuts && Object.keys(sa.shortcuts).length) {
                Object.keys(sa.shortcuts).forEach(n => {
                    items.push({ name: n, type: 'folder', storage: k, path: sa.shortcuts[n], updatedTime: '' });
                });
            } else {
                items.push({ name: sa.name, type: 'folder', storage: k, path: sa.root, updatedTime: '' });
            }
        }
        this.items = items;
        this.size = items.length;
        let options = this.options;
        if (options.orderBy) {
            this._setSort(options.orderBy, options.order);
        }
    }
    getList(storage, path, options) {
        let accessor = this.accessors[storage];
        if (!accessor) {
            return null;
        }
        return accessor.getList(path || accessor.root, options);
    }
    addStorage(id, data) {
        this.accessors[id] = data;
        this._update();
        this.notifyUpdate();
    }
    removeStorage(id) {
        if (!this.accessors[id]) { return false; }
        delete this.accessors[id];
        this._update();
        this.notifyUpdate();
        return true;
    }
    getFolder(path, prefix = '') {
        if (!path) {
            return this;
        }
        let [storage, spath] = this._splitPath(path);
        return this.accessors[storage]?.getFolder(spath, prefix + storage + '/');
    }
    parsePath(path) {
        if (!path) {
            return [['', 'Storages']];
        }
        let [storage, spath] = this._splitPath(path);
        let acc = this.accessors[storage];
        return [[storage, acc?.name]].concat(acc?.parsePath(spath) || []);
    }
    _splitPath(path) {
        let storage = path.split('/', 1)[0];
        return [storage, path.substring(storage.length + 1)];
    }
    get(position) {
        return Promise.resolve(this.items[position]);
    }
    _setSort(orderBy, order) {
        let r = order === "a" ? 1 : -1;
        if (orderBy === "name") {
            this.items.sort((a, b) => (a.name || "").localeCompare(b.name) * r);
        } else if (orderBy === "updated") {
            this.items.sort((a, b) => (a.updatedTime || "").localeCompare(b.updatedTime) * r);
        } else if (orderBy === "size") {
            this.items.sort((a, b) => ((a.size && b.size) ? a.size - b.size : 0) * r);
        }
    }
}


export async function install() {
    let storageList = new StorageList(globalThis.storageAccessors);
    globalThis.storageAccessors = new Proxy({}, {
        // NOTE: Storage can only be accessed via storageList.
        set: function (obj, prop, value) {
            storageList.addStorage(prop, value);
            return true;
        },
        deleteProperty: function (t, key) {
            return storageList.removeStorage(key);
        },
    });
    // @ts-ignore
    globalThis.storageList = storageList;

    globalThis.storageAccessors['Favs'] = {
        name: "Favorites",
        root: "favoriteItems",
        shortcuts: {},
        getList: (folder, options) => new LocalList("favoriteItems", options),
        getFolder: (folder, prefix) => new LocalList("favoriteItems", undefined, prefix),
        parsePath: (path) => path ? path.split('/').map(p => [p]) : []
    };

    // TODO: settings for each environment.
    if (!location.href.includes('.github.io')) {
        globalThis.storageAccessors['MEDIA'] = {
            name: "Media",
            root: "tags",
            shortcuts: { "Tags": "tags", "All": "tags/.ALL_ITEMS", "Volumes": "volumes" },
            getList: (folder, options) => new ItemList("../api/", folder, options),
            getFolder: (folder, prefix) => new ItemList("../api/", folder, undefined, prefix),
            parsePath: (path) => path ? path.split('/').map(p => [p]) : []
        };
    }
    globalThis.storageAccessors['DEMO'] = {
        name: "Demo",
        root: "list.json",
        shortcuts: {},
        getList: (folder, options) => new ItemList("https://binzume.github.io/demo-assets/", folder, options),
        getFolder: (folder, prefix) => new ItemList("https://binzume.github.io/demo-assets/", folder, undefined, prefix),
        parsePath: (path) => path ? path.split('/').map(p => [p]) : []
    };
    return true;
}

install();
