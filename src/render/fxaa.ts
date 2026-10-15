import { defaultFilterVert, Filter, GlProgram } from 'pixi.js';

/*
 * FXAA (after Timothy Lottes' FXAA 3.11 "console" variant): finds edges by luma
 * contrast and blurs along them, one full-screen pass with five texture reads.
 */
const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 px = uInputSize.zw;
  vec2 uv = vTextureCoord;
  vec4 m = texture(uTexture, uv);
  float lNW = luma(texture(uTexture, uv + vec2(-1.0, -1.0) * px).rgb);
  float lNE = luma(texture(uTexture, uv + vec2(1.0, -1.0) * px).rgb);
  float lSW = luma(texture(uTexture, uv + vec2(-1.0, 1.0) * px).rgb);
  float lSE = luma(texture(uTexture, uv + vec2(1.0, 1.0) * px).rgb);
  float lM = luma(m.rgb);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  // Flat area: nothing to smooth.
  if (lMax - lMin < max(0.0312, lMax * 0.125)) { finalColor = m; return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * px;
  vec4 a = 0.5 * (texture(uTexture, uv - dir / 6.0) + texture(uTexture, uv + dir / 6.0));
  vec4 b = 0.5 * a + 0.25 * (texture(uTexture, uv - dir * 0.5) + texture(uTexture, uv + dir * 0.5));
  float lB = luma(b.rgb);
  finalColor = (lB < lMin || lB > lMax) ? a : b;
}`;

export const createFxaa = () =>
  new Filter({ glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'fxaa' }), resources: {} });
