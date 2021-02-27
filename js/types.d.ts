

import { Entity, Scene } from "aframe"

declare module "aframe" {
    export interface EntityEventMap {
        clickitem: DetailEvent<{ index: number }>
        keydown: KeyboardEvent
        thumbstickmoved: DetailEvent<{ x: number, y: number }>
        gesture: DetailEvent<{ name: string, center: any }>
        'app-launch': DetailEvent<any>
        change: DetailEvent<{ value: any, index?: number }>
    }

    export interface Entity {
        addEventListener<K extends keyof EntityEventMap>(
            type: K,
            listener: (event: Event & EntityEventMap[K]) => void,
            useCapture?: boolean | { once?: boolean }
        ): void;
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
    }
    interface Element {
        querySelector(selectors: 'a-scene'): Scene;
        querySelector(selectors: 'a-xyinput'): HTMLInputElement;
        querySelector(selectors: string): Entity<any>;
        querySelectorAll(selectors: string): NodeListOf<Entity<any>>;
    }
}
