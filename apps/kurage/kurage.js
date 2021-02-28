// @ts-check

AFRAME.registerComponent('kurage', {
	schema: {
	},
	init() {
		let geometry = new THREE.SphereBufferGeometry(1, 20, 16, undefined, undefined, undefined, 2);
		// let material = new THREE.MeshStandardMaterial({ color: 0x6699FF, roughness: 0.5, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
		geometry.computeVertexNormals();
		this.offset = Math.random() * 100;


		let vs = /* glsl */`
		uniform float time;
		uniform vec4 wave1;
		uniform vec4 wave2;
		varying vec3 f;
		varying vec3 vNormal;
		#include <common>
		void main() {
			#include <beginnormal_vertex>
			#include <defaultnormal_vertex>
			vNormal = normalize( transformedNormal );

			#include <begin_vertex>
			float pos = acos(transformed.y); // TODO
			f = (1.0-wave1.xyz + wave1.xyz * sin(time * wave1.w - pos * 3.0));
			transformed = transformed * f + wave2.xyz * sin(time * wave2.w - pos * 1.5) * pos;
			#include <project_vertex>
		}`;

		let fs = /* glsl */`
		uniform vec3 diffuse;
		uniform float opacity;
		uniform float time;
		varying vec3 f;
		varying vec3 vNormal;
		#include <common>
		void main() {
			float l = (asin(length(vNormal.xy))); // fract((atan(vNormal.y,vNormal.x)/PI2 * 2.0));

			gl_FragColor = vec4(diffuse, opacity / f.x* (l * 0.95 + 0.05) * 0.2) ;
		}`;

		let uniforms = {
			time: { value: 0 },
			wave1: { value: [0.2, 0, 0.2, 0.8] },
			wave2: { value: [0, 0, 0, 0] },
		};

		let material2 = new THREE.ShaderMaterial({
			uniforms: THREE.UniformsUtils.merge([THREE.ShaderLib.basic.uniforms, uniforms]),
			vertexShader: vs,
			fragmentShader: fs,
			blending: THREE.AdditiveBlending,
			transparent: true
		});
		material2.uniforms.opacity.value = 0.3;
		material2.uniforms.diffuse.value = [0.1, 0.5, 1];
		this.bodyMat = material2;

		this.armMat = new THREE.ShaderMaterial({
			uniforms: THREE.UniformsUtils.merge([THREE.ShaderLib.basic.uniforms, uniforms]),
			vertexShader: vs,
			fragmentShader: fs,
			blending: THREE.AdditiveBlending,
			transparent: true
		});
		this.armMat.uniforms.opacity.value = 0.3;
		this.armMat.uniforms.diffuse.value = [0.1, 0.5, 1];
		this.armMat.uniforms.wave2.value = [0.1, 0, 0, 0.5];


		let bodyBack = new THREE.Mesh(geometry.clone().scale(0.97, 0.97, -0.97), material2);
		let bodyFront = new THREE.Mesh(geometry, material2);
		let kurage = new THREE.Group();
		let arms = new THREE.Group();

		let armGeom = new THREE.CylinderBufferGeometry(0.02, 0.02, 2.0, 3, 20, true);
		let narm = 5;
		let armr = 0.3;
		for (let i = 0; i < narm; i++) {
			let arm = new THREE.Mesh(armGeom, this.armMat);
			let theta = i * 2 * Math.PI / narm;
			arm.scale.set(1, 2, 1);
			arm.position.set(Math.sin(theta) * armr, -2, Math.cos(theta) * armr);
			arms.add(arm);
		}

		kurage.add(bodyBack, arms, bodyFront);
		this.el.setObject3D('kurage', kurage);
	},
	tick(t) {
		this.bodyMat.uniforms.time.value = t * 0.001 + this.offset;
		this.armMat.uniforms.time.value = t * 0.001 + this.offset;
	},
	remove() {
		this.el.removeObject3D('kurage');
	},
});
