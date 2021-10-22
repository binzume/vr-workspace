

import { Entity, Scene } from "aframe"

declare module "aframe" {
    export interface EntityEventMap {
        click: DetailEvent<{ intersection: any, cursorEl: Entity<any>}>
        keydown: KeyboardEvent
        keypress: KeyboardEvent
        thumbstickmoved: DetailEvent<{ x: number, y: number }>
        object3dset: DetailEvent<{ object: any }>
        gesture: DetailEvent<{ name: string, center: any }>
        'app-launch': DetailEvent<{ appManager: AppManager, app: any, args: any, content: any }>
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
}
