

import { Entity, Scene } from "aframe"

declare module "aframe" {
    export interface EntityEventMap {
        click: DetailEvent<{ intersection: any, cursorEl: Entity<any> }>
        keydown: KeyboardEvent
        keypress: KeyboardEvent
        thumbstickmoved: DetailEvent<{ x: number, y: number }>
        object3dset: DetailEvent<{ object: any }>
        gesture: DetailEvent<{ name: string, center: any }>
        'app-start': DetailEvent<AppStartEventData>
        'app-save-state': DetailEvent<AppSaveStateEventData>
    }

    export interface Entity {
        addEventListener<K extends keyof EntityEventMap>(
            type: K,
            listener: (event: Event & EntityEventMap[K]) => void,
            useCapture?: boolean | { once?: boolean }
        ): void;
    }

    export interface Component {
        [key: string]: any
    }

    export interface Scene {
        addEventListener<K extends keyof EntityEventMap>(
            type: K,
            listener: (event: Event & EntityEventMap[K]) => void,
            useCapture?: boolean | { once?: boolean }
        ): void;
    }
}

declare global {
    interface Document {
        activeElement: Entity<any> | Element
        createElement(tag: 'canvas'): HTMLCanvasElement
    }
    interface Element {
        querySelector(selectors: 'a-scene'): Scene
        querySelector(selectors: 'a-xyinput'): HTMLInputElement
        querySelector(selectors: string): Entity<any>
        querySelectorAll(selectors: string): NodeListOf<Entity<any>>
    }

    // App Manager types
    interface AppInfo {
        id: string;
        name: string;
        type: string;
        url: string;
        contentTypes: string[];
        contentNameSuffix: string[];
        hidden: boolean;
        wid: string?;
    }

    interface AppStartEventData {
        app: AppInfo;
        services: { appManager: AppManager, storage?: PathResolver & Folder, [key: string]: any };
        appManager: AppManager;
        args: any;
        content: any;
        getDataFolder(): Folder;
    }
    interface AppSaveStateEventData {
        setState(any): void;
        skip(): void
    }

    interface VRAppComponent {
        context: AppStartEventData;
        app: AppInfo;
        saveFile(content: Blob, options?: any): Promise<FileInfo>;
    }

    // Storage types
    interface FileInfo {
        type: string;
        name: string;
        size: number;
        path: string;
        updatedTime: number;
        tags?: string[];
        thumbnail?: { type?: string, fetch?: () => Promise<Response>, [k: string]: any };
        remove?(): Promise<any>;
        rename?(name: string): Promise<any>;
        fetch?(): Promise<Response>;
        stream?(): Promise<ReadableStream>;
        createWritable?(): Promise<WritableStream>;
        [k: string]: any;
    }

    interface Folder {
        getInfo?(): Promise<{ name: string, [k: string], any }>;
        getFiles(offset?: any, limit?: number, options?: object, signal?: AbortSignal): Promise<FilesResult>;
        getFile(name: string, options?: any): Promise<FileInfo>;
        writeFile?(name: string, content: Blob, options?: any): Promise<any>;
        mkdir?(name: string): string;
        getParentPath(): string;
        onupdate?: () => any;
        path?: string;
        sequentialAccess?: boolean;
        backend?: string;
    }

    interface FilesResult {
        name?: string;
        items: FileInfo[];
        next: any;
        total?: number;
        more?: boolean;
    }

    interface PathResolver {
        getFolder(path: string, prefix?: string): Folder;
        parsePath(path: string): string[][];
    }

    var storageList: PathResolver & Folder & { addStorage: any, removeStorage: any };
}
