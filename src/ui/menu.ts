import { fetchSave, type Save, type Slot, SLOTS } from '../sim/save';

/** One line about a save: when, how far along, how many people. */
const about = (s: Save | null) => {
  if (!s) return 'üres';
  const people = s.buildings.reduce((n, b) => n + (b.residents ?? 0), 0);
  const when = new Date(s.when).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' });
  return `${when} · ${people} lakos · ${s.quest + 1}. feladat`;
};
const slotName = (slot: Slot) => (slot === 'auto' ? 'Automatikus' : `${slot}. hely`);

/**
 * The menu: a new game (by seed, or the example map), saving to three slots and loading any of
 * them or the autosave. Starting or loading a game reloads the page with it in the address.
 * `playing`: a game is on, so it can be continued and saved.
 */
export function createMenu(root: HTMLElement, playing: boolean, save: (slot: Slot) => boolean, onClose: () => void) {
  let note = '';
  const go = (search: string) => (location.search = search);
  const render = () => {
    const seed = Math.floor(Math.random() * 1e6);
    root.innerHTML =
      '<div class="box"><h1>Szigetek</h1>' +
      (playing ? '<button class="big" data-act="close">Folytatás</button>' : '') +
      '<h2>Új játék</h2>' +
      `<div class="row"><label>Seed <input id="seed" type="number" min="1" value="${seed}"></label>` +
      '<button data-act="new">Indítás</button></div>' +
      '<button data-act="example">Példa térkép</button>' +
      (playing
        ? '<h2>Mentés</h2>' +
          SLOTS.filter((s) => s !== 'auto')
            .map(
              (s) =>
                `<button class="slot" data-act="save" data-arg="${s}"><b>${slotName(s)}</b><small>${about(fetchSave(s))}</small></button>`,
            )
            .join('')
        : '') +
      '<h2>Betöltés</h2>' +
      SLOTS.map((s) => {
        const saved = fetchSave(s);
        return `<button class="slot" data-act="load" data-arg="${s}" ${saved ? '' : 'disabled'}><b>${slotName(s)}</b><small>${about(saved)}</small></button>`;
      }).join('') +
      (note ? `<p class="note">${note}</p>` : '') +
      '</div>';
  };
  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const arg = el.dataset.arg as Slot;
    switch (el.dataset.act) {
      case 'close':
        return onClose();
      case 'new':
        return go(`?seed=${Number((root.querySelector('#seed') as HTMLInputElement).value) || 1}`);
      case 'example':
        return go('?map=pelda');
      case 'load':
        return go(`?betolt=${arg}`);
      case 'save':
        note = save(arg) ? `Elmentve: ${slotName(arg)}` : 'Nem sikerült menteni (megtelt vagy tiltott a tárhely).';
        return render();
    }
  });
  return {
    open() {
      note = '';
      render();
      root.hidden = false;
    },
    close() {
      root.hidden = true;
    },
    get isOpen() {
      return !root.hidden;
    },
  };
}
