

AFRAME.registerComponent('gesture', {
    schema: {
        src: { default: '#PRESET' },
        button: { default: 'mouse' },
        timeoutMs: { default: 1000 },
        lineColor: { default: '#00ff00' },
        lineDistance: { default: 0.5 },
        lineFadeDelayMs: { default: 500 },
    },
    multiple: true,
    init() {
        let el = this.el;
        let data = this.data;
        this.gestures = [];
        this.disable = false;
        this.downevent = data.button + 'down';
        this.upevent = data.button + 'up';
        this._onmousedown = this._onmousedown.bind(this);
        this.sourceEl = el;

        if (data.button != 'mouse') {
            // disable while dragging.
            el.addEventListener('triggerdown', ev => this.disable = true);
            el.addEventListener('triggerup', ev => this.disable = false);
        } else {
            this.sourceEl = this.el.sceneEl.canvas;
        }
        this.sourceEl.addEventListener(this.downevent, this._onmousedown);
        this.sourceEl.addEventListener('trackpaddown', ev => console.log(ev));
    },
    tick() {
        if (this._dragFun) {
            this._dragFun();
        } else {
            // disable tick.
            this.pause();
        }
    },
    update(oldData) {
        let data = this.data;
        if (data.src && data.src != oldData.src) {
            this._loadGesture(data.src);
        }
    },
    async _loadGesture(src) {
        if (src == '#PRESET') {
            this.gestures = [
                { name: "CLICK", motions: [] },
                { name: "A", motions: ["UP", "DOWN"] },
                { name: "B", motions: ["UP", { type: "curve", rot: 180 }, { type: "curve", rot: 180 }] },
                { name: "C", motions: [{ type: "curve", rot: 180 }] },
                { name: "D", motions: ["UP", { type: "curve", rot: 180 }] },
                { name: "L", motions: ["DOWN", "RIGHT"] },
                { name: "V", motions: ["DOWN", "UP"] },
                { name: "O", motions: [{ type: "curve", rot: 360 }] },
                { name: "Z", motions: ["RIGHT", { type: "line", deg: -135 }, "RIGHT"] },
                { name: ">", motions: [{ type: "line", deg: 0 }, { type: "line", deg: 180 }] },
                { name: "<", motions: [{ type: "line", deg: 180 }, { type: "line", deg: 0 }] },
                { name: "RECT", motions: ["DOWN", "RIGHT", "UP", "LEFT"] },
            ];
        } else {
            let loader = document.querySelector('a-assets').fileLoader;
            let res = await new Promise((resolve, reject) => loader.load(src, resolve, null, reject));
            this.gesture = JSON.parse(res);
        }
    },
    _onmousedown(ev) {
        if (!this.el.components.raycaster || this.disable) {
            return;
        }
        /** @type {HTMLElement} */
        let intersectedEl = this.el.components.raycaster.intersectedEls[0];
        if (intersectedEl && intersectedEl.classList.contains('nogesture')) {
            return;
        }
        let dragging = false;
        let _this = this;
        let el = this.el;

        let maxVerts = this.data.timeoutMs / 10;
        let count = 0;
        let vertices = new Float32Array(maxVerts * 3);
        let verticesAttr = new THREE.BufferAttribute(vertices, 3);
        let geometry = new THREE.BufferGeometry();
        let points = [];

        geometry.setAttribute('position', verticesAttr);
        geometry.setDrawRange(0, count);
        let material = new THREE.LineBasicMaterial({
            color: new THREE.Color(this.data.lineColor)
        });
        let line = new THREE.Line(geometry, material);
        this.el.sceneEl.object3D.add(line);

        let cancelEvelt = ev1 => ev1.target != ev.target && ev1.stopPropagation();
        let lastPos = null;
        let dragFun = this._dragFun = () => {
            let ray = this.el.components.raycaster.raycaster.ray;
            let p = ray.direction.clone().multiplyScalar(this.data.lineDistance).add(ray.origin);
            if (lastPos && lastPos.distanceTo(p) < this.data.lineDistance / 25) {
                return;
            }
            if (lastPos && !dragging) {
                dragging = true;
                window.addEventListener('mouseenter', cancelEvelt, true);
                window.addEventListener('mouseleave', cancelEvelt, true);
            }
            lastPos = p;
            if (count < maxVerts) {
                points.push(p);
                vertices.set([p.x, p.y, p.z], count * 3);
                let offset = verticesAttr.updateRange.count > 0 ? verticesAttr.updateRange.offset : count * 3;
                count++;
                verticesAttr.needsUpdate = true;
                verticesAttr.updateRange.offset = offset;
                verticesAttr.updateRange.count = count * 3 - offset;
                geometry.setDrawRange(0, count);
                geometry.boundingBox = null;
                geometry.boundingSphere = null;
            }
        };
        dragFun();
        this.play();

        let mouseup = (ev) => {
            this.sourceEl.removeEventListener(this.upevent, mouseup);
            console.log('gesture', this.upevent);
            this._dragFun = null;
            setTimeout(() => this.el.sceneEl.object3D.remove(line), this.data.lineFadeDelayMs);
            if (dragging) {
                window.removeEventListener('mouseenter', cancelEvelt, true);
                window.removeEventListener('mouseleave', cancelEvelt, true);
            }
            dragFun();
            let cameraMatInv = this.el.sceneEl.camera.matrixWorldInverse;
            points.forEach(p => p.applyMatrix4(cameraMatInv));
            let motions = this._getMotions(points);
            motions.forEach(m => console.log(JSON.stringify(m))); // debug
            let g = this._detectGesture(motions);
            if (g) {
                let max = points.reduce((a, b) => new THREE.Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)));
                let min = points.reduce((a, b) => new THREE.Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)));
                this.el.emit("gesture", { name: g.name, center: max.add(min).multiplyScalar(0.5) });
            }
            if (motions.length > 0) {
                let cancelClick = ev => ev.stopPropagation();
                window.addEventListener('click', cancelClick, true);
                setTimeout(() => window.removeEventListener('click', cancelClick, true), 0);
            }
        };
        this.sourceEl.addEventListener(this.upevent, mouseup);
    },
    _detectGesture(motions) {
        const mapping = {
            UP: { type: "line", deg: 90 },
            DOWN: { type: "line", deg: -90 },
            RIGHT: { type: "line", deg: 0 },
            LEFT: { type: "line", deg: 180 },
        };
        return this.gestures.find(g => {
            return g.motions.length == motions.length &&
                g.motions.every((m, i) => {
                    m = mapping[m] || m;
                    if (m.type != motions[i].type) {
                        return false;
                    }
                    if (m.type == "line") {
                        let d = Math.abs(m.deg - motions[i].deg);
                        if (d > 180) d = 360 - d;
                        if (d < 45) return true;
                    } else if (m.type == "curve") {
                        if (Math.abs(m.rot - Math.abs(motions[i].rot)) < 90) return true;
                    }
                    return false;
                })
        });
    },
    _getMotions(points) {
        let motions = [];
        if (points.length < 3) {
            return motions;
        }
        const cornerThreshold = 0.5
        const curveThreshold = 60 * Math.PI / 180;
        let cornerLen = Math.max(2, points.length / 20 | 0);
        let dvv = [];
        for (let i = 0; i < points.length - 1; i++) {
            let v = points[i + 1].clone().sub(points[i]);
            dvv.push(new THREE.Vector2(v.x, v.y).normalize());
        }
        let minLen = Math.max(3, points.length / 20);

        let rot = 0;
        let st = 0;
        for (let i = 0; i < dvv.length; i++) {
            let v = dvv[i];
            if (i + cornerLen < dvv.length && v.dot(dvv[i + cornerLen]) < cornerThreshold || i == dvv.length - 1) {
                if (i - st >= minLen) {
                    let len = (i - st) / dvv.length;
                    if (Math.abs(rot) > curveThreshold) {
                        motions.push({ type: "curve", rot: THREE.Math.radToDeg(rot), len: len });
                    } else {
                        let v = points[i - 1].clone().sub(points[st]);
                        motions.push({ type: "line", deg: THREE.Math.radToDeg(Math.atan2(v.y, v.x)), len: len });
                    }
                }
                rot = 0;
                st = i + cornerLen;
            } else {
                let nv = dvv[i + 1];
                rot += Math.acos(v.dot(nv)) * (v.cross(nv) < 0 ? -1 : 1);
            }
        }
        return motions;
    }
});
