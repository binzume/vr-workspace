
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
    constructor(apiUrl, itemPath, options) {
        super(itemPath, options);
        this.thumbnailUrl = null;
        this.offset = 0;
        this.apiUrl = apiUrl;
        this.loadPromise = null;
        this.items = [];
    }
    init() {
        return this._load(0);
    }
    async get(position) {
        let item = this._getOrNull(position);
        if (item != null) {
            return item;
        }
        if (position < 0 || this.size >= 0 && position >= this.size) throw "Out of Range error.";
        await this._load(Math.max(position - 10, 0));
        return this._getOrNull(position);
    }
    async _load(offset) {
        if (this.loadPromise !== null) return await this.loadPromise;

        let baseUrl = (this.apiUrl + this.itemPath).replace(/[^/]+$/, '');
        let convUrl = (path) => {
            if (path == null || path.includes('://')) return path;
            if (!path.startsWith('/')) {
                return baseUrl + path;;
            }
            return path;
        };

        this.loadPromise = (async () => {
            let params = "?offset=" + offset;
            if (this.options.orderBy) params += "&orderBy=" + this.options.orderBy;
            if (this.options.order) params += "&order=" + this.options.order;
            let response = await fetch(this.apiUrl + this.itemPath + params);
            if (response.ok) {
                let result = await response.json();
                for (let item of result.items) {
                    item.url = convUrl(item.url);
                    item.thumbnailUrl = convUrl(item.thumbnailUrl);
                    if (item.type == '') {
                        let m = item.name.match(/\.(\w+)$/);
                        if (m) {
                            item.type = 'application/' + m[1].toLowerCase();
                        }
                    }
                }
                this.offset = offset;
                this.size = result.total || result.items.length;
                this.items = result.items;
                this.name = result.name || this.itemPath;
                if (!this.thumbnailUrl && result.items[0]) this.thumbnailUrl = result.items[0].thumbnailUrl;
            }
        })();
        try {
            await this.loadPromise;
        } finally {
            this.loadPromise = null;
        }
    }
    getParentPath() {
        return this.itemPath.replace(/\/[^/]+$/, '');
    }
    _getOrNull(position) {
        if (position < this.offset || position >= this.offset + this.items.length) return null;
        return this.items[position - this.offset];
    }
}

class OnMemoryFileList extends BaseFileList {
    constructor(items, options) {
        super('', options);
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
    constructor(listName, options) {
        let items = [];
        let s = localStorage.getItem(listName);
        if (s !== null) {
            items = JSON.parse(s);
        }
        super(items, options);
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
        }
    });
    // @ts-ignore
    globalThis.storageList = storageList;

    globalThis.storageAccessors['Favs'] = {
        name: "Favorites",
        root: "favoriteItems",
        shortcuts: {},
        getList: (folder, options) => new LocalList("favoriteItems", options)
    };

    // TODO: settings for each environment.
    if (!location.href.includes('.github.io')) {
        globalThis.storageAccessors['MEDIA'] = {
            name: "Media",
            root: "tags",
            shortcuts: { "Tags": "tags", "All": "tags/.ALL_ITEMS", "Volumes": "volumes" },
            getList: (folder, options) => new ItemList("../api/", folder, options)
        };
    }
    globalThis.storageAccessors['DEMO'] = {
        name: "Demo",
        root: "list.json",
        shortcuts: {},
        getList: (folder, options) => new ItemList("https://binzume.github.io/demo-assets/", folder, options)
    };
    return true;
}

install();
