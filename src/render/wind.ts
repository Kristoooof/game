import { defaultFilterVert, Filter, GlProgram } from 'pixi.js';

/*
 * Wind in the leaves, over the baked world: foliage pixels (green over red and blue) are drawn from
 * a little to the side, by an amount that runs across the land in slow gusts, so crowns stir and
 * sway while trunks, roofs and walls stay put. One full-screen pass with two texture reads.
 */
const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
// World x, y of the screen's top left corner, zoom, and device pixels per CSS pixel.
uniform highp vec4 uView;
uniform float uTime;

float leafy(vec4 c) { return c.a * smoothstep(0.02, 0.08, c.g - max(c.r, c.b * 1.1)); }

void main() {
  vec4 here = texture(uTexture, vTextureCoord);
  vec2 world = uView.xy + (uOutputFrame.xy + vTextureCoord * uInputSize.xy / uView.w) / uView.z;
  // Gusts sweeping across the land, and a quicker flutter on top.
  float gust = sin(uTime * 0.9 - world.x * 0.012 - world.y * 0.006) * 0.5 + 0.5;
  float sway = sin(uTime * 2.3 + world.x * 0.05 + world.y * 0.03) * (0.4 + 0.6 * gust) + sin(uTime * 5.1 + world.y * 0.21) * 0.25;
  vec2 off = vec2(sway * 0.9 * uView.z * uView.w, 0.0) * uInputSize.zw * leafy(here);
  vec4 there = texture(uTexture, vTextureCoord + off);
  // Never pull in what is not leaves: at a crown's edge it shifts into air, not into a roof.
  finalColor = mix(here, there, leafy(there) > 0.0 || there.a < 0.01 ? 1.0 : 0.0);
}`;

export const createWind = () =>
  new Filter({
    glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'wind' }),
    resources: {
      wind: {
        uView: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
        uTime: { value: 0, type: 'f32' },
      },
    },
  });
