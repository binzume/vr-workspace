
AFRAME.registerComponent('hand-controller', {
    schema: {
        color: { default: '#444488' },
        alpha: { default: 0.4 },
    },
    // https://www.w3.org/TR/webxr-hand-input-1/
    _fingers: [
        ["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"],
        ["index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate",
            "index-finger-phalanx-distal", "index-finger-tip"],
        ["middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate",
            "middle-finger-phalanx-distal", "middle-finger-tip"],
        ["ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate",
            "ring-finger-phalanx-distal", "ring-finger-tip"],
        ["pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate",
            "pinky-finger-phalanx-distal", "pinky-finger-tip"]
    ],
    /** @type {THREE.BufferGeometry} */
    _geometry: null,
    /** @type {THREE.MeshBasicMaterial} */
    _material: null,
    /** @type {{driver: any}} */
    _physics: null,
    /** @type {Record<string, {binds: [THREE.Object3D, THREE.Object3D, CANNON.Body][], controllerEl: import("aframe").Entity, [key:string]:any}>} */
    _hands: null,
    init() {
        this._hands = {};
        this._tmpQ0 = new THREE.Quaternion();
        this._tmpV0 = new THREE.Vector3();
        this._tmpV1 = new THREE.Vector3();
        if (this.el.sceneEl.systems.webxr) {
            let webxr = this.el.sceneEl.getAttribute('webxr') || {};
            let features = webxr.optionalFeatures ||= [];
            if (!features.includes('hand-tracking')) {
                features.push('hand-tracking');
                this.el.sceneEl.setAttribute('webxr', webxr);
            }
            let hand0 = this.el.sceneEl.renderer.xr.getHand(1);
            hand0.addEventListener('connected', ev => setTimeout(() => this._handConnected(hand0, ev, 'leftHand'), 0));
            hand0.addEventListener('disconnected', ev => this._handDisconnected(hand0, ev, 'leftHand'));
            let hand1 = this.el.sceneEl.renderer.xr.getHand(0);
            hand1.addEventListener('connected', ev => setTimeout(() => this._handConnected(hand1, ev, 'rightHand'), 0));
            hand1.addEventListener('disconnected', ev => this._handDisconnected(hand1, ev, 'rightHand'));
        }
    },
    update() {
        if (this._material) {
            this._material.color = new THREE.Color(this.data.color);
            this._material.opacity = this.data.alpha;
        }
    },
    tick() {
        let hands = Object.values(this._hands);
        if (hands.length == 0) {
            this.pause();
        }
        hands.forEach(hand => this._updateHand(hand));
    },
    remove() {
        let names = Object.keys(this._hands);
        names.forEach(name => {
            this.el.removeObject3D(name);
        });
        this._geometry?.dispose();
        this._material?.dispose();
    },
    /**
     * @param {{binds: [THREE.Object3D, THREE.Object3D, CANNON.Body][], controllerEl: import("aframe").Entity, [key:string]:any}} hand 
     */
    _updateHand(hand) {
        hand.binds.forEach(([node, _, obj]) => {
            if (obj) {
                obj.position.copy(node.getWorldPosition(this._tmpV0));
                obj.quaternion.copy(node.getWorldQuaternion(this._tmpQ0));
            }
        });
        let rayJoint = hand.pointing ? 'wrist' : 'index-finger-phalanx-distal';
        if (hand.controllerEl && hand.handObj.joints[rayJoint]) {
            hand.controllerEl.object3D.position.copy(hand.handObj.joints[rayJoint].position);
            hand.controllerEl.object3D.quaternion.copy(hand.handObj.joints[rayJoint].quaternion);
        }
        hand.fingerLen = this._fingers.map(joints => {
            let len = 0;
            for (let i = 0; i < joints.length - 1; i++) {
                len += this._tmpV0.copy(hand.handObj.joints[joints[i]].position).sub(hand.handObj.joints[joints[i + 1]].position).length();
            }
            return len;
        });
        let dd = this._fingers.map((j, i) => { // 4
            let tip = hand.handObj.joints[j[j.length - 1]];
            let root = hand.handObj.joints[j[0]];
            let tipPos = tip.getWorldPosition(this._tmpV0);
            let rootPos = root.getWorldPosition(this._tmpV1);
            if (hand.fingerLen[i] > 0.01) {
                let r = tipPos.sub(rootPos).length() / hand.fingerLen[i];
                if (r < 0.6 || r > 0.9) {
                    return r < 0.6;
                }
            }
            return undefined;
        });
        hand.fingerState = dd;
        let open = dd[0] == false && dd[1] == false && dd[2] == false && dd[3] == false && dd[4] == false;
        if (!hand.open && open) {
            hand.controllerEl?.setAttribute('raycaster', 'far', 0.05);
            hand.pointing = false;
        }
        hand.open = open;
        let pointing = dd[1] == false && dd[2] == true && dd[3] == true && dd[4] == true;
        if (!hand.pointing && pointing) {
            hand.pointing = pointing;
            hand.controllerEl?.setAttribute('raycaster', 'far', Infinity);
        }
        let pinch = hand.handObj.joints['index-finger-tip'].position.distanceTo(hand.handObj.joints['thumb-tip'].position) < (hand.pinch ? 0.03 : 0.02);
        if (hand.pinch != pinch) {
            hand.pinch = pinch;
            let trackedControls = hand.controllerEl?.components['generic-tracked-controller-controls'];
            if (trackedControls && !trackedControls.wasControllerConnected) {
                pinch ? trackedControls.onButtonDown({ detail: { id: 0 } }) :
                    trackedControls.onButtonUp({ detail: { id: 0 } });
            }
        }
    },
    _handConnected(handObj, ev, name) {
        if (!ev.data?.hand || this._hands[name]) {
            return;
        }
        if (globalThis.CANNON && this.el.sceneEl.systems.physics && this.el.sceneEl.systems.physics.driver) {
            this._physics = { driver: this.el.sceneEl.systems.physics.driver };
        }
        console.log("hand connected", handObj, ev);
        this._geometry = this._geometry || new THREE.BoxGeometry(1, 1, 1);
        this._material = this._material || new THREE.MeshBasicMaterial({ color: new THREE.Color(this.data.color) });
        this._material.transparent = true;
        this._material.opacity = this.data.alpha;

        let controllerEl = /** @type {import("aframe").Entity} */(document.getElementById(name));

        this.el.setObject3D(name, handObj);
        let handData = { handObj: handObj, name: name, binds: [], fingers: [4, 9, 14, 19, 24], controllerEl: controllerEl, source: ev.data };
        this._hands[name] = handData;
        for (let joint of Object.values(handObj.joints)) {
            let cube = new THREE.Mesh(this._geometry, this._material);
            let scale = Math.min(joint.jointRadius || 0.015, 0.05);
            joint.visible = true;
            cube.scale.set(scale, scale, scale);
            joint.add(cube);
            let body = null;
            if (this._physics) {
                body = new CANNON.Body({
                    mass: 0,
                    collisionFilterGroup: 4,
                    collisionFilterMask: ~4
                });
                body.addShape(new CANNON.Sphere(scale * 0.5));
                this._physics.driver.addBody(body);
            }
            handData.binds.push([joint, cube, body]);
        }
        this.play();

        if (controllerEl?.hasAttribute('generic-tracked-controller-controls')) {
            controllerEl.setAttribute('generic-tracked-controller-controls', { defaultModel: false });
            if (this._physics) {
                controllerEl.removeAttribute('static-body');
            }
        }
    },
    _handDisconnected(handObj, ev, name) {
        this.el.removeObject3D(name);
        if (this._hands[name]) {
            this._hands[name].binds.forEach(([node, obj, body]) => {
                obj.parent.remove(obj);
                if (body) {
                    this._physics.driver.removeBody(body);
                }
            });
            delete this._hands[name];
            document.getElementById(name)?.setAttribute('raycaster', 'far', Infinity);
        }
    }
});
