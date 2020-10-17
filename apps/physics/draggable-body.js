
AFRAME.registerComponent('draggable-body', {
    dependencies: ['xy-drag-control'],
    init() {
        let el = this.el;
        let dragging = false;
        el.addEventListener('mousedown', ev => {
            if (dragging) {
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
            let draggingObjectMass = el.body.mass;
            dragging = true;
            el.body.mass = 0;
            el.addEventListener('mouseup', ev => {
                dragging = false;
                clearInterval(timer);
                // restore mass
                el.body.mass = draggingObjectMass;
                el.body.velocity.copy(velocity);
            }, { once: true });
        });
    }
});
