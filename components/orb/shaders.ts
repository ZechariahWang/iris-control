// Ashima simplex noise (webgl-noise, MIT license)
const simplexNoise = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  return 0.5 * snoise(p) + 0.25 * snoise(p * 2.0) + 0.125 * snoise(p * 4.0);
}
`;

// uTime is already speed-scaled on the JS side, so noise phase uses it directly.
export const coreVertex = /* glsl */ `
uniform float uTime;
uniform float uDistort;
uniform float uNoiseScale;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vPos;
varying float vDisp;

${simplexNoise}

void main() {
  float swell = snoise(position * uNoiseScale + uTime) * 0.6;
  float detail = snoise(position * uNoiseScale * 2.6 + uTime * 1.4) * 0.28;
  float grain = snoise(position * uNoiseScale * 5.5 + uTime * 1.9) * 0.12;
  float noise = swell + detail + grain;
  vec3 displaced = position + normal * noise * uDistort;
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  vPos = position;
  vDisp = noise;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const coreFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uBrightness;
uniform float uLevel;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vPos;
varying float vDisp;

${simplexNoise}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewDir);

  // Ridges catch light, valleys fall into shadow: sells the surface as physical
  float relief = clamp(0.78 + vDisp * 1.5, 0.45, 1.35);

  // Ridged noise: thin bright veins of energy where fbm crosses zero
  float bands = fbm(vPos * 2.4 + uTime * 0.7);
  float vein = pow(max(0.0, 1.0 - abs(bands) * 2.4), 4.0);
  vec3 hot = mix(uColor, vec3(1.0), 0.35);

  // Soft color-tinted inner light where the surface faces the camera
  float facing = pow(max(dot(normal, viewDir), 0.0), 3.0);

  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.5);

  vec3 color = uColor * (0.35 + 0.75 * uBrightness) * relief;
  color += hot * vein * uBrightness * (0.9 + uLevel * 2.4);
  color += mix(uColor, vec3(1.0), 0.2) * facing * uBrightness * 0.45;
  color += uColor * rim * (0.9 + uBrightness);

  gl_FragColor = vec4(color, 1.0);
}
`;

export const glowVertex = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// Rendered on the back side, so visible normals face away from the camera.
export const glowFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uBrightness;

varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewDir);
  float facing = max(-dot(normal, viewDir), 0.0);
  float falloff = pow(facing, 2.0);
  gl_FragColor = vec4(uColor * uBrightness, falloff * 0.55);
}
`;
