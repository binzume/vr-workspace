
class BaseFileList {
    /**
     * @param {string} itemPath
     */
    constructor(itemPath) {
        this.itemPath = itemPath;
        this.size = -1;
        this.name = "";
        this.onupdate = null;
    }
    notifyUpdate() {
        this.onupdate && this.onupdate();
    }
    getParentPath() {
        return null;
    }
}

class ItemList extends BaseFileList {
    /**
     * @param {string} apiUrl
     * @param {string} itemPath
     */
    constructor(apiUrl, itemPath, prefix = '') {
        super(itemPath);
        this.apiUrl = apiUrl;
        this.name = itemPath;
        this._pathPrefix = prefix;
    }

    async getFiles(offset, limit, options = null, signal = null) {
        options ||= {};
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
        return {
            items: result.items,
            next: result.more ? offset + result.items.length : null,
            total: result.total
        };
    }

    getParentPath() {
        let p = this.itemPath.lastIndexOf('/');
        if (p < 0) {
            return null;
        }
        return this._pathPrefix + this.itemPath.substring(0, p);
    }
}

class ArrayFileList extends BaseFileList {
    constructor(items, itemPath, prefix = '') {
        super(itemPath);
        this._pathPrefix = prefix;
        this.setItems(items);
    }
    async getInfo() {
        return {
            type: 'folder',
            name: this.name,
            size: this.items.length,
        };
    }
    setItems(items) {
        this.items = items;
        this.size = this.items.length;
    }
    contains(item) {
        return this.items.some(i => i.path === item.path);
    }
    async getFiles(offset, limit, options = null, signal = null) {
        if (options && options.sortField) {
            this._sort(options.sortField, options.sortOrder);
        }
        limit ||= this.items.length;
        return {
            items: this.items.slice(offset, offset + limit),
            next: offset + limit < this.items.length ? offset + limit : null,
        };
    }
    _sort(orderBy, order) {
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

class LocalList extends ArrayFileList {
    constructor(listName, prefix = '') {
        let items = [];
        let s = localStorage.getItem(listName);
        if (s !== null) {
            items = JSON.parse(s);
        }
        super(items, listName, prefix);
        this.name = "Favorites";
    }
    addItem(item) {
        if (this.contains(item)) return;
        this.items.push(item);
        this.setItems(this.items);
        localStorage.setItem(this.itemPath, JSON.stringify(this.items));
        this.notifyUpdate();
    }
    removeItem(item) {
        let path = item.path;
        this.items = this.items.filter(i => i.path != path);
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
}


class StorageList extends ArrayFileList {
    constructor(accessors) {
        super([], '');
        this.accessors = accessors || {};
        this.name = "Storage";
        this._update();
    }
    _update() {
        /** @type {object[]} */
        let items = [];
        for (let [k, sa] of Object.entries(this.accessors)) {
            if (sa == this) {
                continue;
            }
            if (sa.shortcuts && Object.keys(sa.shortcuts).length) {
                Object.keys(sa.shortcuts).forEach(n => {
                    items.push({ name: n, type: 'folder', path: k + '/' + sa.shortcuts[n], updatedTime: '' });
                });
            } else {
                items.push({ name: sa.name, type: 'folder', path: k + '/' + sa.root, updatedTime: '' });
            }
        }
        this.items = items;
        this.size = items.length;
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
}


// install
(async function () {
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
        getFolder: (folder, prefix) => new LocalList(folder, prefix),
        parsePath: (path) => path ? path.split('/').map(p => [p]) : []
    };

    // TODO: settings for each environment.
    if (!location.href.includes('.github.io')) {
        globalThis.storageAccessors['MEDIA'] = {
            name: "Media",
            root: "tags",
            shortcuts: { "Tags": "tags", "All": "tags/.ALL_ITEMS", "Volumes": "volumes" },
            getFolder: (folder, prefix) => new ItemList("../api/", folder, prefix),
            parsePath: (path) => path ? path.split('/').map(p => [p]) : []
        };
    }
    globalThis.storageAccessors['DEMO'] = {
        name: "Demo",
        root: "list.json",
        shortcuts: {},
        getFolder: (folder, prefix) => new ItemList("https://binzume.github.io/demo-assets/", folder, undefined, prefix),
        parsePath: (path) => path ? path.split('/').map(p => [p]) : []
    };
    return true;
})();
