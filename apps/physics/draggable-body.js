
AFRAME.registerComponent('draggable-body', {
    dependencies: ['xy-drag-control'],
    init() {
        let el = this.el;
        let dragging = false;
        el.addEventListener('mousedown', ev => {
            if (dragging) {
                return;
            }
            let body = el.body;
            if (!body) {
                return;
            }
            let velocity = new THREE.Vector3(0, 0, 0);
            let prevPos = el.object3D.position.clone();
            let prevTime = el.sceneEl.time;
            let timer = setInterval(() => {
                let dt = el.sceneEl.time - prevTime;
                if (dt > 0) {
                    velocity.copy(el.object3D.position).sub(prevPos).multiplyScalar(1000 / dt);
                }
                prevPos.copy(el.object3D.position);
                prevTime = el.sceneEl.time;
            }, 50);
            // set mass = 0
            let draggingObjectMass = body.mass;
            dragging = true;
            body.mass = 0;
            el.addEventListener('mouseup', ev => {
                dragging = false;
                clearInterval(timer);
                // restore mass
                body.mass = draggingObjectMass;
                body.velocity.copy(velocity);
            }, { once: true });
        });
    }
});

// old THREE.js API
if (THREE.Quaternion.prototype.invert) {
    THREE.Quaternion.prototype.inverse = function () { return this.clone().invert() };
    let getCenter = THREE.Box3.prototype.getCenter;
    THREE.Box3.prototype.getCenter = function (c) { return getCenter.apply(this, [c || new THREE.Vector3()]) };
    let getSize = THREE.Box3.prototype.getSize;
    THREE.Box3.prototype.getSize = function (c) { return getSize.apply(this, [c || new THREE.Vector3()]) };
}
