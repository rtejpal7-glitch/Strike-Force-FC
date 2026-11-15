import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Post-processing chain: multisampled HDR render → bloom (floodlights, muzzle
// flashes, sparks, LED boards) → tone mapping → a broadcast-style grade with
// vignette, film grain, speed blur at the edges and a chromatic hit-flash.

// Replaces NaN/Inf pixels and clamps extreme HDR values before bloom, so one
// bad pixel can never be blurred across the whole screen.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b) || c.r > 6e4 || c.g > 6e4 || c.b > 6e4) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(min(c.rgb, vec3(24.0)), 1.0); }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uSpeed: { value: 0 },
    uHit: { value: 0 },
    uSat: { value: 1.12 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uSpeed, uHit, uSat;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c);
      // chromatic aberration grows at the edges and when hit
      float ca = (0.0015 + uHit * 0.012) * r;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ca).b;
      // radial speed blur near the edges while sprinting
      float sb = uSpeed * smoothstep(0.25, 0.7, r) * 0.025;
      if (sb > 0.0005) {
        vec3 acc = col;
        for (int i = 1; i <= 4; i++) acc += texture2D(tDiffuse, vUv - c * sb * float(i)).rgb;
        col = acc / 5.0;
      }
      // saturation + slight warm/cool split
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col *= vec3(1.02, 1.0, 1.03);
      // red hit tint
      col = mix(col, col * vec3(1.35, 0.7, 0.7), uHit * 0.5);
      // vignette
      col *= 1.0 - uVignette * smoothstep(0.3, 0.85, r);
      // film grain
      col += (rand(vUv * 1000.0 + uTime) - 0.5) * 0.025;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(new ShaderPass(SanitizeShader));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 3, size.y / 3), 0.55, 0.5, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.hit = 0;
    this.time = 0;
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 3, h / 3);
  }

  dispose() {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom.dispose?.();
  }

  flashHit(v = 1) {
    this.hit = Math.max(this.hit, v);
  }

  render(dt, speed01 = 0) {
    this.time += dt;
    this.hit = Math.max(0, this.hit - dt * 2.2);
    const u = this.grade.uniforms;
    u.uTime.value = this.time % 100;
    u.uSpeed.value += (speed01 - u.uSpeed.value) * Math.min(1, dt * 4);
    u.uHit.value = this.hit;
    this.composer.render(dt);
  }
}
