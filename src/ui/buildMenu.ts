import { BUILDINGS, CATEGORY_NAMES, GOOD_NAMES, type BuildingId, type Category, type Good } from '../data/buildings';

export type Tool = BuildingId | 'demolish' | null;

export const costText = (id: BuildingId) => {
  const c = BUILDINGS[id].cost;
  const parts = c.gold ? [`${c.gold} arany`] : [];
  for (const g of Object.keys(GOOD_NAMES) as Good[]) if (c[g]) parts.push(`${c[g]} ${GOOD_NAMES[g].toLowerCase()}`);
  return parts.join(', ');
};

/** Painted icons for the category tabs and demolish. */
const TAB_ICONS: Record<Category | 'demolish', string> = {
  infra:
    '<path d="M2 18h20" stroke="#5a3a1a" stroke-width="2"/><path d="M4 18v-4a8 8 0 0 1 16 0v4" fill="none" stroke="#a89a84" stroke-width="3"/><path d="M4 18v-4a8 8 0 0 1 16 0v4" fill="none" stroke="#5a4a3a" stroke-width="0.8"/>',
  housing:
    '<path d="M5 11 12 5l7 6v9H5z" fill="#e6d5b8" stroke="#5a3a1a" stroke-width="1.2"/><path d="M2.5 12 12 4l9.5 8" fill="none" stroke="#b5452b" stroke-width="2.6" stroke-linecap="round"/><rect x="10.2" y="14" width="3.6" height="6" fill="#6b4426"/><rect x="15.5" y="3.5" width="2.4" height="5" fill="#8a4a32"/>',
  production:
    '<path d="M6 20 14 12" stroke="#7a5a35" stroke-width="3" stroke-linecap="round"/><path d="M11 6l5-2 4 4-2 5z" fill="#b8bec6" stroke="#4a4f57" stroke-width="1.2"/>',
  public:
    '<path d="M12 2.5v4M10.2 4.3h3.6" stroke="#e8c67a" stroke-width="1.5"/><path d="M6 21v-9l6-5 6 5v9z" fill="#e6d5b8" stroke="#5a3a1a" stroke-width="1.2"/><path d="M10 21v-4a2 2 0 0 1 4 0v4z" fill="#6b4426"/>',
  demolish:
    '<path d="M6 20 16 8" stroke="#7a5a35" stroke-width="2.6" stroke-linecap="round"/><path d="M7 6c4-2.5 9.5-1.5 13 3-4-1.8-8.5-1.8-11.5 0z" fill="#b8bec6" stroke="#4a4f57" stroke-width="1.1"/>',
};
const tabLabel = (key: Category | 'demolish', name: string) =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${TAB_ICONS[key]}</svg>${name}`;

const button = (label: string, onClick: () => void, title = '') => {
  const b = document.createElement('button');
  b.innerHTML = label;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
};

/** Bottom bar: category tabs, a row of buildings for the open category, demolish and cancel. */
/** `onRotate`: turn the building being placed (shown while one is chosen). */
export function createBuildMenu(root: HTMLElement, onTool: (tool: Tool) => void, onRotate: () => void) {
  let open: Category | null = null;
  let tool: Tool = null;
  const items = document.createElement('div');
  items.className = 'items';
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  root.append(items, tabs);

  const render = () => {
    items.replaceChildren(
      ...(Object.keys(BUILDINGS) as BuildingId[])
        .filter((id) => BUILDINGS[id].category === open)
        .map((id) => {
          const b = button(`${BUILDINGS[id].name}<small>${costText(id)}</small>`, () => setTool(id));
          b.classList.toggle('active', tool === id);
          return b;
        }),
    );
    items.hidden = !open;
    tabs.replaceChildren(
      ...(Object.keys(CATEGORY_NAMES) as Category[]).map((c) => {
        const b = button(tabLabel(c, CATEGORY_NAMES[c]), () => {
          open = open === c ? null : c;
          render();
        });
        b.classList.toggle('active', open === c);
        return b;
      }),
      Object.assign(
        button(tabLabel('demolish', 'Bontás'), () => setTool(tool === 'demolish' ? null : 'demolish')),
        { className: tool === 'demolish' ? 'active danger' : 'danger' },
      ),
      ...(tool && tool !== 'road' && tool !== 'demolish' ? [button('⟳', onRotate, 'Forgatás (R)')] : []),
      ...(tool ? [button('✕', () => setTool(null), 'Mégse (Esc)')] : []),
    );
  };

  const setTool = (t: Tool) => {
    tool = t;
    render();
    onTool(t);
  };

  render();
  return { setTool };
}
