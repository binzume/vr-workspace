
class OctreeNode {
    constructor(depth, value) {
        this.value = value;
        this.children = null;
        this.depth = depth;
        this.size = 1 << depth;
    }

    makeChildren() {
        if (this.children != null) return;
        var c = new Array(8);
        this.children = c;
        for (var i = 0; i < 8; i++) {
            c[i] = new OctreeNode(this.depth - 1, this.value);
        }
        return this;
    }

    get(x, y, z) {
        if (this.children == null) return this.value;
        var d = this.depth - 1;
        var n = ((x >> d) & 1) + ((y >> d) & 1) * 2 + ((z >> d) & 1) * 4;
        return this.children[n].get(x, y, z);
    }

    set(x, y, z, v) {
        var d = this.depth - 1;
        if (d < 0) {
            this.value = v;
            return true; // changed.
        }
        if (this.children == null) {
            if (this.value == v) return false;
            this.makeChildren();
        }

        var n = ((x >> d) & 1) + ((y >> d) & 1) * 2 + ((z >> d) & 1) * 4;
        if (!this.children[n].set(x, y, z, v)) return false;
        for (var i = 0; i < 8; i++) {
            if (this.children[i].children != null || this.children[i].value != v) return false;
        }
        this.value = v;
        this.children = null;
        return true; // changed.
    }

    getSubTree(x, y, z, td) {
        if (td == 0) {
            return this;
        }
        if (this.children == null) return null;
        var d = this.depth - 1;
        var n = ((x >> d) & 1) + ((y >> d) & 1) * 2 + ((z >> d) & 1) * 4;
        return this.children[n].getSubTree(x, y, z, td - 1);
    }

    toArray() {
        if (this.children == null) return this.value;
        var v = [];
        for (var i = 0; i < 8; i++) {
            v.push(this.children[i].toArray());
        }
        return v;
    }

    rotate(ax) {
        // ax : X:0 y:1 z:2
        if (this.children == null) return;
        var d = 1 << ax;
        var dd = [[0, 2, 6, 4], [0, 1, 5, 4], [0, 1, 3, 2]][ax];
        for (var i = 0; i < 2; i++) {
            var t1 = this.children[i * d];
            this.children[i * d + dd[0]] = this.children[i * d + dd[1]];
            this.children[i * d + dd[1]] = this.children[i * d + dd[2]];
            this.children[i * d + dd[2]] = this.children[i * d + dd[3]];
            this.children[i * d + dd[3]] = t1;
        }
        for (var i = 0; i < 8; i++) {
            this.children[i].rotate(ax);
        }
    }


    applyFunc(f, x, y, z, v) {
        if (this.children == null && this.value == v) {
            return false;
        }
        var r = f(x, y, z, 1 << this.depth);
        if (r == 1) { // all
            this.value = v;
            this.children = null;
            return true;
        } else if (r == 2 && this.depth > 0) { // partial
            this.makeChildren();
            var sz = 1 << (this.depth - 1);
            var cf = false;
            for (var i = 0; i < 8; i++) {
                cf |= this.children[i].applyFunc(f, x + sz * (i & 1), y + sz * ((i >> 1) & 1), z + sz * ((i >> 2) & 1), v);
            }
            if (!cf) return false;
            for (var i = 0; i < 8; i++) {
                if (this.children[i].children != null || this.children[i].value != v) return true;
            }
            this.value = v;
            this.children = null;
            return true;
        }
        return false;
    }

    slice(buf, p, stride, d, ax) {
        var size = 1 << this.depth;
        if (this.children == null) {
            for (var j = 0; j < size; j++) {
                for (var i = 0; i < size; i++) {
                    buf[p + i] = this.value;
                }
                p += stride;
            }
            return;
        }
        size = size >> 1;
        var tree = this;
        var o = ((d >> (tree.depth - 1)) & 1) << ax;
        if (ax == 0) {
            for (var i = 0; i < 4; i++) {
                tree.children[o].slice(buf, p + size * (i & 1) + stride * size * ((i >> 1) & 1), stride, d, ax);
                o += 2;
            }
        } else if (ax == 1) {
            for (var i = 0; i < 4; i++) {
                tree.children[(i & 2) + o].slice(buf, p + size * ((i >> 1) & 1) + stride * size * (i & 1), stride, d, ax);
                o += 1;
            }
        } else {
            for (var i = 0; i < 4; i++) {
                tree.children[o].slice(buf, p + size * (i & 1) + stride * size * ((i >> 1) & 1), stride, d, ax);
                o += 1;
            }
        }
    }

    slice2(buf, p, stride, x, y, z, n, ax) {
        // let t = this.getSubTree(x, y, z, n);
        if (n == this.depth) {
            this.slice(buf, p, stride, [x, y, z][ax], ax);
            return;
        }
        if (this.children == null) {
            var size = 1 << n;
            for (var j = 0; j < size; j++) {
                for (var i = 0; i < size; i++) {
                    buf[p + i] = this.value;
                }
                p += stride;
            }
            return;
        }
        var d = this.depth - 1;
        var i = ((x >> d) & 1) + ((y >> d) & 1) * 2 + ((z >> d) & 1) * 4;
        return this.children[i].slice2(buf, p, stride, x, y, z, n, ax);
    }
}

class Voxel {
    constructor(depth, subMeshLevel) {
        this.scale = 1.0 / (1 << depth);
        this.tree = new OctreeNode(depth, 0);
        this.colors = [[], [0.2, 0.2, 0.2, 1], [1, 0, 0, 1], [0, 1, 0, 1], [0, 0, 1, 1]];
        this.meshCashe = [];
        this.subMeshLevel = subMeshLevel || 5;
    }

    clear() {
        this.tree = new OctreeNode(this.tree.depth, 0);
        this.meshCashe = [];
    }

    size() {
        return 1 << this.tree.depth;
    }

    applyFunc(f, v) {
        let ret = this.tree.applyFunc(f, 0, 0, 0, v);
        if (ret) {
            // invalidate cache.
            let d = this.subMeshLevel;
            let sz = 1 << d;
            let k = this.tree.depth - d;
            let n = 1 << (this.tree.depth - d);
            for (let key of Object.keys(this.meshCashe)) {
                let x = key % n, y = (key >> k) % n, z = (key >> (k * 2)) % n;
                if (f(x * sz - 1, y * sz - 1, z * sz - 1, sz + 2) != 0) {
                    for (let mesh of this.meshCashe[key]) {
                        mesh.dispose();
                    }
                    console.log('invalidate', key);
                    delete this.meshCashe[key];
                }
            }
            // let n = 1 << (this.tree.depth - d);
            //for (var z = 0; z < n; z++) {
            //    for (var y = 0; y < n; y++) {
            //        for (var x = 0; x < n; x++) {
            //            var t = x + n * y + n * n * z;
            //            if (this.meshCashe[t] && f(x * sz - 1, y * sz - 1, z * sz - 1, sz + 2) != 0) {
            //                this.meshCashe[t] = null;
            //            }
            //        }
            //    }
            //}
        }
        return ret;
    }

    sphere(cx, cy, cz, r, v) {
        var rr = r * r;
        return this.applyFunc(function (x, y, z, sz) {
            var dx = Math.max(x, Math.min(cx, x + sz)) - cx;
            var dy = Math.max(y, Math.min(cy, y + sz)) - cy;
            var dz = Math.max(z, Math.min(cz, z + sz)) - cz;
            var dmin = dx * dx + dy * dy + dz * dz;
            if (dmin >= rr) {
                return 0;
            }
            if (sz == 1) {
                return 1;
            }
            var n = 0;
            for (var i = 0; i < 8; i++) {
                var px = x - cx + (sz * (i & 1));
                var py = y - cy + (sz * ((i >> 1) & 1));
                var pz = z - cz + (sz * ((i >> 2) & 1));
                if (px * px + py * py + pz * pz < rr) {
                    n++;
                }
            }
            return n == 8 ? 1 : 2;
        }, v);
    }

    box(x1, y1, z1, w, h, d, v) {
        var x2 = x1 + w;
        var y2 = y1 + h;
        var z2 = z1 + d;
        return this.applyFunc(function (x, y, z, sz) {
            if (x >= x1 && x + sz <= x2 && y >= y1 && y + sz <= y2 && z >= z1 && z + sz <= z2) {
                return 1; // in
            }
            if (x + sz >= x1 && x <= x2 && y + sz >= y1 && y <= y2 && z + sz >= z1 && z <= z2) {
                return 2; // partial
            }
            return 0; // out
        }, v);
    }

    cube(cx, cy, cz, size, v) {
        var x1 = cx - size / 2;
        var y1 = cy - size / 2;
        var z1 = cz - size / 2;
        return this.box(x1, y1, z1, size, size, size, v);
    }

    slice(h, ax, a, p, stride) {
        //if (!a) a = new Array(size*size);
        var tree = this.tree;
        var size = 1 << tree.depth;
        if (h >= size || h < 0) {
            for (var j = 0; j < size; j++) {
                for (var i = 0; i < size; i++) {
                    a[p + i] = 0;
                }
                p += stride;
            }
            return a;
        }
        tree.slice(a, p, stride, h, ax);
        return a;
    }

    slice2(x, y, z, n, ax, buf, p, stride, subTree) {
        var tree = this.tree;
        var sz = 1 << tree.depth;
        var size = 1 << n;
        if (!buf) {
            buf = new Array((size + 2) * (size + 2));
            p = 0;
            stride = size + 2;
        }
        for (var i = 0; i <= size + 1; i++) {
            if (ax == 0) {
                buf[p + i] = this.get(x, y + i - 1, z - 1);
                buf[p + i + stride * (size + 1)] = this.get(x, y + i - 1, z + size);
                buf[p + i * stride] = this.get(x, y - 1, z + i - 1);
                buf[p + i * stride + size + 1] = this.get(x, y + size, z + i - 1);
            } else if (ax == 1) {
                buf[p + i] = this.get(x - 1, y, z + i - 1);
                buf[p + i + stride * (size + 1)] = this.get(x + size, y, z + i - 1);
                buf[p + i * stride] = this.get(x + i - 1, y, z - 1);
                buf[p + i * stride + size + 1] = this.get(x + i - 1, y, z + size);
            } else if (ax == 2) {
                buf[p + i] = this.get(x + i - 1, y - 1, z);
                buf[p + i + stride * (size + 1)] = this.get(x + i - 1, y + size, z);
                buf[p + i * stride] = this.get(x - 1, y + i - 1, z);
                buf[p + i * stride + size + 1] = this.get(x + size, y + i - 1, z);
            }
        }
        if (subTree) {
            subTree.slice(buf, p + stride + 1, stride, [x, y, z][ax], ax);
            return buf;
        }

        if (x >= sz || x < 0 || y >= sz || y < 0 || z >= sz || z < 0) {
            p += stride + 1
            for (var j = 0; j < size; j++) {
                for (var i = 0; i < size; i++) {
                    buf[p + i] = 0;
                }
                p += stride;
            }
            return buf;
        }

        tree.slice2(buf, p + stride + 1, stride, x, y, z, n, ax);
        return buf;
    }

    _adjust_vart(v, a, b, p, stride, ax) {
        var ee = [-0.44, -0.335, -0.25, -0.11, 0.0, 0.11, 0.25, 0.33, 0.44];

        var n1, n2;
        var ff = [
            (a[p - stride - 1] > 0) | 0, (a[p - stride] > 0) | 0,
            (a[p - 1] > 0) | 0, (a[p] > 0) | 0,
            (b[p - stride - 1] > 0) | 0, (b[p - stride] > 0) | 0,
            (b[p - 1] > 0) | 0, (b[p] > 0) | 0
        ];

        // z
        n1 = ff[0] + ff[1] + ff[2] + ff[3];
        n2 = ff[4] + ff[5] + ff[6] + ff[7];
        if (n1 > n2) {
            v[0] += ee[n1 + n2];
        } else if (n1 < n2) {
            v[0] -= ee[n1 + n2];
        }

        // x
        n1 = ff[0] + ff[2] + ff[4] + ff[6];
        n2 = ff[1] + ff[3] + ff[5] + ff[7];
        if (n1 > n2) {
            v[1] += ee[n1 + n2];
        } else if (n1 < n2) {
            v[1] -= ee[n1 + n2];
        }

        // y
        n1 = ff[0] + ff[1] + ff[4] + ff[5];
        n2 = ff[2] + ff[3] + ff[6] + ff[7];
        if (n1 > n2) {
            v[2] += ee[n1 + n2];
        } else if (n1 < n2) {
            v[2] -= ee[n1 + n2];
        }

        var scale = this.scale;
        if (ax == 0) {
            return [v[0] * scale, v[1] * scale, v[2] * scale];
        } else if (ax == 1) {
            return [v[2] * scale, v[0] * scale, v[1] * scale];
        } else {
            return [v[1] * scale, v[2] * scale, v[0] * scale];
        }
    }

    get(x, y, z) {
        var size = this.size();
        if (x < 0 || x >= size || y < 0 || y >= size || z < 0 || z >= size) {
            return 0;
        }
        return this.tree.get(x, y, z);
    }

    makeMesh() {
        var d = this.subMeshLevel;
        var n = 1 << (this.tree.depth - d);
        var meshes = [];
        for (var z = 0; z < n; z++) {
            for (var y = 0; y < n; y++) {
                for (var x = 0; x < n; x++) {
                    var t = x + n * y + n * n * z;
                    if (this.meshCashe[t] == null) {
                        this.meshCashe[t] = this.makeSubMesh(x * (1 << d), y * (1 << d), z * (1 << d), d);
                    }
                    meshes = meshes.concat(this.meshCashe[t]);
                }
            }
        }
        return meshes;
    }

    makeSubMesh(x, y, z, depth) {
        var colors = this.colors;
        var mesh = { vertices: [], colors: [], triangles: [] };
        var meshes = [mesh];
        var w = 1;
        var vs = 0;
        var size = 1 << depth;
        var stride = size + 2;
        var a = new Array(stride * stride);
        var b = new Array(stride * stride);
        let v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v1c = new THREE.Vector3(), v2c = new THREE.Vector3();

        var subTree = this.tree.getSubTree(x, y, z, this.tree.depth - depth);
        let shellOnly = subTree == null || subTree.children == null;

        for (var ax = 0; ax < 3; ax++) {
            if (ax == 0) {
                this.slice2(x - 1, y, z, depth, ax, a, 0, stride, null);
            } else if (ax == 1) {
                this.slice2(x, y - 1, z, depth, ax, a, 0, stride, null);
            } else if (ax == 2) {
                this.slice2(x, y, z - 1, depth, ax, a, 0, stride, null);
            }
            for (var k = 0; k <= size; k++) {
                var p = stride + 1;
                if (shellOnly && k != 0 && k < size - 1) {
                    continue;
                }
                // b = this.slice(k, ax, b, p, stride);
                if (ax == 0) {
                    this.slice2(x + k, y, z, depth, ax, b, 0, stride, k != size ? subTree : null);
                } else if (ax == 1) {
                    this.slice2(x, y + k, z, depth, ax, b, 0, stride, k != size ? subTree : null);
                } else if (ax == 2) {
                    this.slice2(x, y, z + k, depth, ax, b, 0, stride, k != size ? subTree : null);
                }
                if (shellOnly && k != 0 && k != size) {
                    var t = a; a = b; b = t;
                    continue;
                }

                for (var j = 0; j < size; j++) {
                    // var v1, v2;
                    var l = 0;
                    for (var i = 0; i < size; i++) {
                        var f = (a[p + i] == 0 || b[p + i] == 0) ? b[p + i] - a[p + i] : 0;
                        if (f == 0) {
                            l = 0;
                            continue;
                        }

                        // 150ms
                        var pp = p + i;
                        var p1 = l == f ? mesh.vertices[vs - 3].slice() : this._adjust_vart([k, i, j], a, b, pp, stride, ax);
                        var p2 = this._adjust_vart([k, i + w, j], a, b, pp + 1, stride, ax);
                        var p3 = l == f ? mesh.vertices[vs - 1].slice() : this._adjust_vart([k, i, j + w], a, b, pp + stride, stride, ax);
                        var p4 = this._adjust_vart([k, i + w, j + w], a, b, pp + stride + 1, stride, ax);
                        v1c.set(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]).normalize();
                        v2c.set(p4[0] - p3[0], p4[1] - p3[1], p4[2] - p3[2]).normalize();

                        if (l == f && v1c.dot(v1) > 0.99 && v2c.dot(v2) > 0.99) { // 30ms?
                            mesh.vertices[vs - 1] = p4;
                            mesh.vertices[vs - 3] = p2;
                        } else {
                            v1.copy(v1c);
                            v2.copy(v2c);
                            l = f;
                            if (vs > 655320) {
                                // webgl without extension.
                                l = 0;
                                vs = 0;
                                mesh = mesh = { vertices: [], colors: [], triangles: [] };
                                meshes.push(mesh);
                            }
                            mesh.vertices.push(p1, p2, p3, p4);
                            var color;
                            if (f > 0) {
                                mesh.triangles.push([vs + 0, vs + 2, vs + 1], [vs + 2, vs + 3, vs + 1]);
                                color = colors[f];
                            } else {
                                mesh.triangles.push([vs + 0, vs + 1, vs + 2], [vs + 2, vs + 1, vs + 3]);
                                color = colors[-f];
                            }
                            mesh.colors.push(color, color, color, color);
                            vs += 4;
                        }
                    }
                    p += stride;
                }
                var t = a; a = b; b = t;
            }
        }

        if (vs == 0) meshes.pop();
        for (var i = 0; i < meshes.length; i++) {
            for (var v = 0; v < meshes[i].vertices.length; v++) {
                meshes[i].vertices[v][0] += x * this.scale;
                meshes[i].vertices[v][1] += y * this.scale;
                meshes[i].vertices[v][2] += z * this.scale;
            }
        }
        return meshes.map(mesh => {
            // console.log(" vs:" + mesh.vertices.length);
            let geometry = new THREE.BufferGeometry();
            let vertices = new Float32Array(mesh.vertices.length * 3);
            mesh.vertices.forEach((v, i) => vertices.set(v, i * 3));
            let colors = new Float32Array(mesh.colors.length * 4);
            mesh.colors.forEach((v, i) => colors.set(v, i * 4));
            let indics = mesh.vertices.length > 65535 ?
                new Uint32Array(mesh.triangles.length * 3) :
                new Uint16Array(mesh.triangles.length * 3);
            mesh.triangles.forEach((v, i) => indics.set(v, i * 3));

            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
            geometry.setIndex(new THREE.BufferAttribute(indics, 1));
            geometry.computeVertexNormals();

            return geometry;
        });
    }
}

class Bullet {
    constructor(world, p, v) {
        this.v = v;
        this.ttl = 3000;
        this.live = true;
        let geometry = new THREE.SphereGeometry(0.03, 8, 4);
        let material = new THREE.MeshStandardMaterial({ color: 0x6699FF, roughness: 0.5 });
        this.obj = new THREE.Mesh(geometry, material);
        this.obj.position.copy(p);
        world.add(this.obj);
        console.log(this.obj);
    }

    update(t) {
        this.ttl -= t;
        if (this.ttl < 0) {
            this.dispose();
            return;
        }
        this.obj.position.addScaledVector(this.v, t * 0.05);
    }

    dispose() {
        if (!this.live) return;
        this.obj.parent.remove(this.obj);
        this.obj.material.dispose();
        this.obj.geometry.dispose();
        this.live = false;
    }
}

class Target {
    constructor(world, spec) {
        console.log(spec);
        this.hp = spec.life;
        this.spin = new THREE.Vector3().fromArray(spec.spin || [0, 0, 0]).multiplyScalar(Math.PI / 180);
        this.spinAmount = this.spin.length();
        this.spin.normalize();
        this.live = true;
        this.voxelObj = null;

        console.time('makeVoxel');
        let voxel = new Voxel(7);
        this.voxel = voxel;
        spec.body(voxel);
        spec.core(voxel);
        console.timeEnd('makeVoxel');

        let g = new THREE.Group();
        g.scale.multiplyScalar(3);
        g.position.set(0, 2, -6);
        this.obj = g;
        world.add(g);
        this.voxelUpdated = true;
        this.mat = new THREE.MeshStandardMaterial({ color: 0xaaaacc, roughness: 0.5, vertexColors: THREE.VertexColors });
        this.tmpV = new THREE.Vector3();
    }

    _updateMesh() {
        let voxel = this.voxel;

        console.time('makeMesh');
        let geometries = voxel.makeMesh();
        console.timeEnd('makeMesh');

        console.time('makeObjs');
        let meshes = geometries.map(geometry => new THREE.Mesh(geometry, this.mat));
        console.timeEnd('makeObjs');

        if (this.voxelObj) {
            this.obj.remove(this.voxelObj);
        }
        this.voxelObj = new THREE.Group().add(...meshes);
        this.voxelObj.position.set(-0.5, -0.5, -0.5);
        this.obj.add(this.voxelObj);
    }

    update(timeDelta) {
        if (this.voxelUpdated) {
            this._updateMesh();
            this.voxelUpdated = false;
        }
        if (this.hp > 0) {
            this.obj.rotateOnAxis(this.spin, this.spinAmount * timeDelta * 0.001);
        } else {
            this.obj.rotateZ(-20 * timeDelta * 0.001);
            this.obj.scale.multiplyScalar(0.98);
            this.hp -= timeDelta;
            if (this.hp < -2000) {
                this.dispose();
            }
        }
    }

    hitTest(worldPos) {
        if (this.voxelObj == null) {
            return false;
        }
        let voxel = this.voxel;
        let p = this.voxelObj.worldToLocal(this.tmpV.copy(worldPos)).multiplyScalar(voxel.size());
        let v = voxel.get(p.x, p.y, p.z);
        if (v > 0) {
            voxel.sphere(p.x, p.y, p.z, (0.01) * voxel.size() + 1, 0);
            this.voxelUpdated = true;
            if (v == 2) {
                this.hp--;
                console.log(this.hp);
            }
            return true;
        }
        return false;
    }

    dispose() {
        if (!this.live) return;
        // TODO: dispose cache
        this.mat.dispose();
        this.obj.parent.remove(this.obj);
        this.live = false;
    }
}

class Game {
    constructor(world, enemies, seanario) {
        this.world = world;
        this.targets = [];
        this.bullets = [];

        seanario.handler['loadEnemy'] = (s, ev) => {
            this.targets.push(new Target(this.world, enemies[ev.enemy]));
            s.next();
        };
        seanario.go('START');
    }

    fire(p, v) {
        // TODO: bullet pool
        this.bullets.push(new Bullet(this.world, p, v.multiplyScalar(-0.05)));
        if (this.bullets.length > 16) {
            this.bullets[0].dispose();
        }
    }

    update(timeDelta) {
        seanario.check(this);
        this.bullets.forEach(b => {
            b.update(timeDelta);
            for (let t of this.targets) {
                if (t.hitTest(b.obj.position)) {
                    console.log("Hit!");
                    b.dispose();
                    break;
                }
            }
        });
        this.targets.forEach(o => o.update(timeDelta));
        this.bullets = this.bullets.filter(b => b.live);
        this.targets = this.targets.filter(b => b.live);
    }

    dispose() {
        this.bullets.forEach(o => o.dispose());
        this.targets.forEach(o => o.dispose());
    }
}

const enemies = {
    "N001": {
        name: "N001",
        life: 4,
        body: function (voxel) {
            var sz = voxel.size();
            voxel.box(sz / 8, 0, sz / 4, sz / 8 * 6, sz, sz / 4, 1);
        },
        core: function (voxel) {
            var c = voxel.size() / 2;
            return voxel.sphere(c, c * 1.5, c, c / 6, 2)
        },
        spin: [0, 0, 0],
        rot: [0, 0, 0]
    },
    "N002": {
        name: "N002",
        life: 5,
        body: function (voxel) {
            var sz = voxel.size();
            voxel.sphere(sz / 2, sz / 2, sz / 2, sz / 2, 1);
            voxel.sphere(sz, sz / 2, sz / 2, sz / 3, 0);
        },
        core: function (voxel) {
            var c = voxel.size() / 2;
            return voxel.sphere(c, c, c, c / 3, 2)
        },
        spin: [0, 90, 0],
        rot: [0, 0, 0]
    },
    "N003": {
        name: "N003",
        life: 10,
        body: function (voxel) {
            var sz = voxel.size();
            voxel.box(sz / 8, 0, sz / 4, sz / 8 * 6, sz, sz / 4, 1);
            voxel.sphere(sz / 2, sz / 2 * 1.5, sz / 2, sz / 4, 1)
        },
        core: function (voxel) {
            var c = voxel.size() / 2;
            return voxel.sphere(c, c * 1.5, c, c / 6, 2)
        },
        spin: [0, 0, 0],
        rot: [0, 0, 0]
    },
    "DEBUG": {
        name: "DEBUG",
        life: 10,
        body: function (voxel) {
            var sz = voxel.size();
            voxel.cube(sz / 2, sz / 2, sz / 2, sz, 1);
        },
        core: function (voxel) {
            var c = voxel.size() / 2;
            return voxel.sphere(c, c, c, 4, 2)
        },
        spin: [0, 0, 0],
        rot: [0, 0, 0]
    }
};

class Seanario {
    constructor(data) {
        this.data = data;
        this.scene = null;
        this.pos = 0;
        this.mode = null;
        this.cond = null;
        this.handler = {
            next: function (s, ev) {
                s.go(ev.scene);
            },
            wait: function (s, ev) {
                s.mode = 'wait';
                s.cond = ev.cond;
            }
        }
    }
    go(name) {
        this.scene = name;
        this.pos = 0;
        this.next();
    }
    check(ctx) {
        if (this.mode == 'text') {
            return true;
        } else if (this.mode == 'wait') {
            if (this.cond(ctx)) {
                this.next();
            }
            return false;
        }
        return false;
    }
    next() {
        if (this.scene == null || this.pos >= this.data[this.scene].length) {
            return;
        }
        let ev = this.data[this.scene][this.pos];
        this.pos++;
        this.mode = ev.type;
        if (this.handler[ev.type]) this.handler[ev.type](this, ev);
    }
}

const seanario = new Seanario({
    START: [
        { type: "next", scene: "S001" }
    ],
    S001: [
        { type: "loadEnemy", enemy: "N001" },
        { type: "wait", cond: (g) => g.targets.length > 0 },
        { type: "wait", cond: (g) => g.targets.length == 0 },
        { type: "loadEnemy", enemy: "N002" },
        { type: "wait", cond: (g) => g.targets.length > 0 },
        { type: "wait", cond: (g) => g.targets.length == 0 },
        { type: "loadEnemy", enemy: "N003" },
        { type: "wait", cond: (g) => g.targets.length > 0 },
        { type: "wait", cond: (g) => g.targets.length == 0 },
        { type: "next", scene: "S001" },
    ],
});

AFRAME.registerComponent('game-main', {
    schema: {},
    init() {
        this.app = this.el.parentElement;
        let world = new THREE.Group();
        this.app.setObject3D('game-root', world);
        this.game = new Game(world, enemies, seanario);

        this.el.sceneEl.querySelectorAll('[laser-controls]').forEach(el => el.addEventListener('mousedown', (/** @type {CustomEvent} */ ev) => {
            this.game.fire(el.object3D.getWorldPosition(new THREE.Vector3()), el.object3D.getWorldDirection(new THREE.Vector3()));
        }));

        this._elByName('debug-button').addEventListener('click', (/** @type {CustomEvent} */ ev) => {
            this.game.fire(this.el.object3D.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 0, 1));
        });
    },
    _elByName(name) {
        return this.el.querySelector("[name=" + name + "]");
    },
    tick(t, timeDelta) {
        this.game.update(timeDelta);
    },
    remove() {
        this.app.removeObject3D('game-root');
        this.game.dispose();
        this.app.parentElement.removeChild(this.app);
    }
});
