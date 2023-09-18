

import { Entity, Scene } from "aframe"

declare module "aframe" {
    export interface EntityEventMap {
        click: DetailEvent<{ intersection: any, cursorEl: Entity<any> }>
        keydown: KeyboardEvent
        keypress: KeyboardEvent
        thumbstickmoved: DetailEvent<{ x: number, y: number }>
        object3dset: DetailEvent<{ object: any }>
        gesture: DetailEvent<{ name: string, center: any }>
        'app-start': DetailEvent<{ appManager: AppManager, app: any, services: {appManager: AppManager, [key: string]: any}, args: any, content: any }>
        'app-save-state': DetailEvent<{ setState: (any) => void, skip: () => void }>
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
            useCapture?: boolean | { once?: boolean 
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

    interface FileInfo {
        type: string;
        name: string;
        size: number;
        path: string;
        updatedTime: number;
        tags?: string[];
        thumbnail?: { [k: string]: any };
        remove?(): Promise<any>;
        fetch?(): Promise<any>;
        [k: string]: any;
    }

    interface FilesResult {
        name?: string;
        items: FileInfo[];
        next: any;
        total?: number;
        more?: boolean;
    }

    interface Folder {
        path?: string;
        getInfo?(): Promise<{ name: string, [k: string], any }>;
        getFiles(offset: any, limit: number, options: object, signal: AbortSignal): Promise<FilesResult>;
        writeFile?(name: string, content: any): Promise<any>;
        getParentPath(): string;
        onupdate?: () => any;
    }

    interface FolderResolver {
        getFolder(path: string, prefix?: string): Folder;
        parsePath(path: string): string[][];
    }

    var storageList: FolderResolver & Folder & { addStorage: any, removeStorage: any };
}
