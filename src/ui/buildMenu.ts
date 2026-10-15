import { BUILDINGS, CATEGORY_NAMES, GOOD_NAMES, type BuildingId, type Category, type Good } from '../data/buildings';

export type Tool = BuildingId | 'demolish' | null;

export const costText = (id: BuildingId) => {
  const c = BUILDINGS[id].cost;
  const parts = c.gold ? [`${c.gold} arany`] : [];
  for (const g of Object.keys(GOOD_NAMES) as Good[]) if (c[g]) parts.push(`${c[g]} ${GOOD_NAMES[g].toLowerCase()}`);
  return parts.join(', ');
};

const button = (label: string, onClick: () => void, title = '') => {
  const b = document.createElement('button');
  b.innerHTML = label;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
};

/** Bottom bar: category tabs, a row of buildings for the open category, demolish and cancel. */
export function createBuildMenu(root: HTMLElement, onTool: (tool: Tool) => void) {
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
        const b = button(CATEGORY_NAMES[c], () => {
          open = open === c ? null : c;
          render();
        });
        b.classList.toggle('active', open === c);
        return b;
      }),
      Object.assign(
        button('Bontás', () => setTool(tool === 'demolish' ? null : 'demolish')),
        { className: tool === 'demolish' ? 'active danger' : 'danger' },
      ),
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
