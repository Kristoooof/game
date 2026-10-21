/**
 * A wooden side panel for whatever is selected (a harbour, a ship). Its content is HTML; any
 * element with `data-act` calls the handler of that name with its `data-arg` when clicked.
 */
export function createPanel(root: HTMLElement, onClose: () => void) {
  let handlers: Record<string, (arg: string) => void> = {};
  let html = '';
  root.hidden = true;
  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'close') return onClose();
    handlers[el.dataset.act!]?.(el.dataset.arg ?? '');
  });
  // Clicks on the panel stay on it, not on the map beneath.
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  return {
    /** Shows (or refreshes) the panel; rewritten only when its content changed. */
    show(title: string, body: string, on: Record<string, (arg: string) => void>) {
      handlers = on;
      const next = `<div class="head"><h2>${title}</h2><button class="close" data-act="close" title="Bezárás">×</button></div>${body}`;
      if (next !== html) root.innerHTML = html = next;
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      html = '';
    },
  };
}
