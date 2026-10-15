export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 3;

/** Zoom by `factor`, keeping the world point under screen (sx, sy) in place. */
export function zoomAt(cam: Camera, factor: number, sx: number, sy: number): Camera {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor));
  const k = scale / cam.scale;
  return { scale, x: sx - (sx - cam.x) * k, y: sy - (sy - cam.y) * k };
}

export const screenToWorld = (cam: Camera, sx: number, sy: number) => ({
  x: (sx - cam.x) / cam.scale,
  y: (sy - cam.y) / cam.scale,
});

interface Handlers {
  onChange(cam: Camera): void;
  onTap(sx: number, sy: number): void;
  onHover(sx: number, sy: number): void;
  /** While a tool is active, one-finger / left-button drags paint instead of panning. */
  paint: {
    active(): boolean;
    start(sx: number, sy: number): void;
    move(sx: number, sy: number): void;
    end(sx: number, sy: number): void;
    cancel(): void;
  };
}

const DRAG_THRESHOLD = 6;

/**
 * Mouse + touch input: drag to pan, wheel / pinch to zoom, tap to select, hover for mouse.
 * Right / middle mouse button and two fingers always pan.
 */
export function attachCameraControls(el: HTMLElement, cam: Camera, h: Handlers) {
  const pointers = new Map<number, { x: number; y: number }>();
  let start = { x: 0, y: 0 };
  let dragged = false;
  let painting = false;
  let pinch = { x: 0, y: 0, d: 1 };

  const set = (c: Camera) => {
    Object.assign(cam, c);
    h.onChange(cam);
  };
  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  };

  el.addEventListener('contextmenu', (e) => e.preventDefault());

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      start = { x: e.clientX, y: e.clientY };
      dragged = e.button !== 0; // non-left mouse buttons only pan
      painting = !dragged && h.paint.active();
      if (painting) h.paint.start(e.clientX, e.clientY);
    } else {
      dragged = true; // a second finger never ends in a tap
      if (painting) h.paint.cancel();
      painting = false;
      if (pointers.size === 2) pinch = pinchState();
    }
  });

  el.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return h.onHover(e.clientX, e.clientY);
    const p = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, p);
    if (painting) return h.paint.move(p.x, p.y);
    if (pointers.size === 1) {
      if (!dragged && Math.hypot(p.x - start.x, p.y - start.y) > DRAG_THRESHOLD) dragged = true;
      if (dragged) set({ ...cam, x: cam.x + p.x - prev.x, y: cam.y + p.y - prev.y });
    } else if (pointers.size === 2) {
      const next = pinchState();
      const z = zoomAt(cam, next.d / pinch.d, next.x, next.y);
      set({ ...z, x: z.x + next.x - pinch.x, y: z.y + next.y - pinch.y });
      pinch = next;
    }
  });

  const end = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (painting) {
      painting = false;
      if (e.type === 'pointerup') h.paint.end(e.clientX, e.clientY);
      else h.paint.cancel();
    } else if (e.type === 'pointerup' && pointers.size === 0 && !dragged) h.onTap(e.clientX, e.clientY);
    if (pointers.size === 2) pinch = pinchState();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      set(zoomAt(cam, Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY));
    },
    { passive: false },
  );
}
