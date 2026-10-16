export type Antialias = 'off' | 'msaa' | 'fxaa';

export interface Settings {
  /** Render width in device pixels; the height follows the window's aspect ratio. 'auto' picks one. */
  width: number | 'auto';
  antialias: Antialias;
  /** Pixel-art look: the baked world is drawn at 1 texel per world pixel and sampled nearest. */
  pixel: boolean;
  /** Pixel look for the sea alone, independent of the world. */
  waterPixel: boolean;
  /** Days pass (dawn to night); off keeps it day. */
  dayCycle: boolean;
  fps: boolean;
}

const KEY = 'szigetek.settings';
// MSAA off by default: the baked world is already smooth, and MSAA is costly on big screens.
const DEFAULTS: Settings = {
  width: 'auto',
  antialias: 'off',
  pixel: false,
  waterPixel: false,
  dayCycle: true,
  fps: false,
};

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

const save = (s: Settings) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or blocked storage: settings just won't persist.
  }
};

/** Physical pixel size of the display: the most the canvas can usefully render. */
const displayWidth = () => Math.round(innerWidth * devicePixelRatio);

/** Canvas scale for the setting: automatic is the display's density (max 2×), a width is never above the display. */
export const resolutionOf = (s: Settings) =>
  s.width === 'auto' ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, Math.max(0.25, s.width / innerWidth));

const WIDTH_OPTIONS = [960, 1280, 1600, 1920, 2560, 3200, 3840];
const widthOptions = (): [Settings['width'], string][] => [
  ['auto', 'Automatikus (kijelző)'],
  ...WIDTH_OPTIONS.filter((w) => w < displayWidth()).map((w): [Settings['width'], string] => [w, `${w} px`]),
  [displayWidth(), `${displayWidth()} px (kijelző)`],
];
const LOOKS: [boolean, string][] = [
  [false, 'Sima'],
  [true, 'Pixeles'],
];
const DAY_CYCLE: [boolean, string][] = [
  [true, 'Változó (nappal–éjszaka)'],
  [false, 'Mindig nappal'],
];
const ANTIALIAS: [Antialias, string][] = [
  ['off', 'Ki'],
  ['msaa', 'MSAA (hardveres)'],
  ['fxaa', 'FXAA (utófeldolgozás)'],
];

/** Gear button with a panel for resolution, anti-aliasing and the FPS counter. */
export function createSettingsPanel(root: HTMLElement, s: Settings, apply: (s: Settings) => void) {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;
  /** `onPick` returns false to refuse the choice, which puts the previous option back. */
  const select = <T>(label: string, options: [T, string][], value: T, onPick: (v: T) => boolean) => {
    const l = document.createElement('label');
    l.textContent = label;
    const el = document.createElement('select');
    options.forEach(([v, text], i) => el.add(new Option(text, String(i), false, v === value)));
    let current = el.selectedIndex;
    el.addEventListener('change', () => {
      if (onPick(options[el.selectedIndex][0])) current = el.selectedIndex;
      else el.selectedIndex = current;
    });
    l.append(el);
    return l;
  };
  const note = document.createElement('small');
  const fps = document.createElement('label');
  const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: s.fps });
  fps.append(box, ' FPS számláló');
  box.addEventListener('change', () => update({ fps: box.checked }));

  const update = (change: Partial<Settings>) => {
    const msaaChanged = change.antialias !== undefined && (change.antialias === 'msaa') !== (s.antialias === 'msaa');
    // MSAA is fixed when the WebGL context is created: only a reload can switch it.
    if (msaaChanged && !confirm('Az MSAA váltásához az oldal újratöltődik, a nem mentett játék elvész. Folytatod?'))
      return false;
    Object.assign(s, change);
    save(s);
    if (msaaChanged) location.reload();
    else apply(s);
    return true;
  };

  panel.append(
    select('Renderelési szélesség', widthOptions(), s.width, (width) => update({ width })),
    select('Megjelenés', LOOKS, s.pixel, (pixel) => update({ pixel })),
    select('Víz megjelenése', LOOKS, s.waterPixel, (waterPixel) => update({ waterPixel })),
    select('Napszak', DAY_CYCLE, s.dayCycle, (dayCycle) => update({ dayCycle })),
    select('Élsimítás', ANTIALIAS, s.antialias, (antialias) => update({ antialias })),
    fps,
    note,
  );
  note.textContent = `Kijelző: ${displayWidth()} px széles. Kisebb érték pixeles lesz. Az MSAA váltása újratölti az oldalt.`;
  const gear = Object.assign(document.createElement('button'), {
    className: 'gear',
    title: 'Beállítások',
    textContent: '⚙',
  });
  gear.setAttribute('aria-expanded', 'false');
  gear.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    gear.setAttribute('aria-expanded', String(!panel.hidden));
  });
  root.append(gear, panel);
}

/** Frames per second and average frame time, refreshed twice a second. */
export function createFpsCounter(el: HTMLElement) {
  let frames = 0;
  let since = performance.now();
  /** `detail` is appended as a second line, e.g. render size and chunk counts. */
  return (visible: boolean, detail = '') => {
    el.hidden = !visible;
    frames++;
    const now = performance.now();
    if (now - since < 500) return;
    el.textContent = `${Math.round((frames * 1000) / (now - since))} FPS · ${((now - since) / frames).toFixed(1)} ms\n${detail}`;
    frames = 0;
    since = now;
  };
}
