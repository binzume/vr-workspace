// @ts-check

AFRAME.registerComponent('kurage', {
	schema: {
	},
	init() {
		this.offset = Math.random() * 100;


		let vs = /* glsl */`
		uniform float time;
		uniform vec4 wave1;
		uniform vec4 wave2;
		uniform vec4 wave3;
		varying vec3 vNormal;
		varying vec2 vUv;
		varying float vWave3t;
		varying float vWave3a;
		attribute vec3 wavescale;
		#include <common>
		void main() {
			#include <beginnormal_vertex>
			#include <defaultnormal_vertex>

			#include <begin_vertex>
			float pos = 1.0 - uv.y;
			vec3 f = (1.0-wave1.xyz * wavescale.x + wave1.xyz * sin(time * wave1.w - pos * 4.0) * wavescale.x);
			transformed = transformed * f  + wave2.xyz * sin(time * wave2.w - pos * 2.0) *  pos  * wavescale.y;
			vWave3t = time * wave3.w - pos * 2.0;
			vWave3a = wavescale.z * sin(pos);
			#include <project_vertex>
			vNormal = normalize( transformedNormal );
		}`;

		let fs = /* glsl */`
		uniform vec3 diffuse;
		uniform float opacity;
		uniform vec4 wave3;
		varying vec3 vNormal;
		varying float vWave3t;
		varying float vWave3a;
		#include <common>
		void main() {
			float n = (asin(length(vNormal.xy))); // fract((atan(vNormal.y,vNormal.x)/PI2 * 2.0));
			float wave3b = max(sin(vWave3t) - 0.98,0.0) * 50.0; 
			gl_FragColor = vec4(diffuse, opacity * (n * 0.95 + 0.05) * 0.2) + vec4(wave3.xyz * wave3b, 0) * vWave3a;
		}`;

		let uniforms = {
			time: { value: 0 },
			wave1: { value: [0.2, 0, 0.2, 0.8] }, // scale
			wave2: { value: [0.3, 0, 0, 0.5] }, // offset
			wave3: { value: [0, 1, 0, 1] }, // luminescence
		};

		let material2 = new THREE.ShaderMaterial({
			uniforms: THREE.UniformsUtils.merge([THREE.ShaderLib.basic.uniforms, uniforms]),
			vertexShader: vs,
			fragmentShader: fs,
			blending: THREE.AdditiveBlending,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
		});
		material2.uniforms.opacity.value = 0.3;
		material2.uniforms.diffuse.value = [0.1, 0.5, 1];
		this.bodyMat = material2;

		let geometries = [];
		let body = new THREE.SphereBufferGeometry(1, 20, 16, undefined, undefined, undefined, 2);
		this._fillAttr(body, 'wavescale', [1, 0, 1]);
		geometries.push(body);

		let armGeom = new THREE.CylinderBufferGeometry(0.02, 0.02, 4.0, 3, 20, true);
		this._fillAttr(armGeom, 'wavescale', [0.1, 1, 0]);
		let narm = 5;
		let armr = 0.3;
		for (let i = 0; i < narm; i++) {
			let theta = i * 2 * Math.PI / narm;
			geometries.push(armGeom.clone().translate(Math.sin(theta) * armr, -2, Math.cos(theta) * armr));
		}
		let main = new THREE.Mesh(this._mergeGeometry(geometries, true), this.bodyMat);
		armGeom.dispose();
		body.dispose();

		let kurage = new THREE.Group();
		kurage.add(main);
		this.el.setObject3D('kurage', kurage);
	},
	/**
	 * @param {THREE.BufferGeometry} geometry
	 * @param {string} name 
	 * @param {number[]} value 
	 */
	_fillAttr(geometry, name, value) {
		// @ts-ignore
		let array = new Float32Array(new Array(geometry.getAttribute('position').count).fill(value).flat())
		geometry.setAttribute(name, new THREE.BufferAttribute(array, value.length));
	},
	/**
	 * @param {THREE.BufferGeometry[]} geometries
	 */
	_mergeGeometry(geometries, dispose = false) {
		let dst = new THREE.BufferGeometry();
		let sz = geometries.reduce((acc, g) => acc + g.getAttribute('position').count, 0);
		if (sz == 0) {
			return dst;
		}
		for (let [name, attr] of Object.entries(geometries[0].attributes)) {
			let t = attr.array.constructor;
			// @ts-ignore
			dst.setAttribute(name, new THREE.BufferAttribute(new t(sz * attr.itemSize), attr.itemSize));
		}
		if (geometries[0].index) {
			let index = [];
			let offset = 0;
			for (let g of geometries) {
				// @ts-ignore
				for (let i of g.index.array) {
					index.push(i + offset);
				}
				offset += g.getAttribute('position').count;
			}
			dst.setIndex(index);
		}
		let p = 0;
		for (let g of geometries) {
			dst.merge(g, p);
			p += g.getAttribute('position').count;
			dispose && g.dispose();
		}
		return dst;
	},
	tick(t) {
		this.bodyMat.uniforms.time.value = t * 0.001 + this.offset;
	},
	remove() {
		this.el.removeObject3D('kurage');
		this.bodyMat.dispose();
	},
});
