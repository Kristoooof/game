export type Antialias = 'off' | 'msaa' | 'fxaa';

export interface Settings {
  /** Render width in device pixels; the height follows the window's aspect ratio. 'auto' picks one. */
  width: number | 'auto';
  antialias: Antialias;
  /** Pixel-art look: the baked world is drawn at 1 texel per world pixel and sampled nearest. */
  pixel: boolean;
  fps: boolean;
}

const KEY = 'szigetek.settings';
// MSAA off by default: the baked world is already smooth, and MSAA is costly on big screens.
const DEFAULTS: Settings = { width: 'auto', antialias: 'off', pixel: false, fps: false };

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

/** Pixels 'auto' aims for: about a 1080p frame, so a big window stays as fast as a small one. */
const AUTO_PIXELS = 2_200_000;

/** Canvas scale (render pixels per CSS pixel) for the chosen render width. */
export const resolutionOf = (s: Settings) =>
  s.width === 'auto'
    ? Math.max(0.5, Math.min(devicePixelRatio, 1.5, Math.sqrt(AUTO_PIXELS / (innerWidth * innerHeight))))
    : Math.min(4, Math.max(0.25, s.width / innerWidth));

const WIDTHS: [Settings['width'], string][] = [
  ['auto', 'Automatikus'],
  [960, '960 px'],
  [1280, '1280 px'],
  [1600, '1600 px'],
  [1920, '1920 px'],
  [2560, '2560 px'],
  [3840, '3840 px'],
];
const LOOKS: [boolean, string][] = [
  [false, 'Sima'],
  [true, 'Pixeles'],
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
    select('Renderelési szélesség', WIDTHS, s.width, (width) => update({ width })),
    select('Megjelenés', LOOKS, s.pixel, (pixel) => update({ pixel })),
    select('Élsimítás', ANTIALIAS, s.antialias, (antialias) => update({ antialias })),
    fps,
    note,
  );
  note.textContent = 'Az MSAA ki- vagy bekapcsolása újratölti az oldalt.';
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
