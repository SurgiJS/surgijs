import { For, createRoot, createSignal, type Accessor, type Setter } from '@surgijs/core';
import { insert } from '@surgijs/core/internal';

const adjectives = [
  'pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint', 'clean', 'elegant', 'easy',
  'angry', 'crazy', 'helpful', 'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive', 'cheap', 'expensive', 'fancy',
];
const colours = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white', 'black', 'orange'];
const nouns = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich', 'burger', 'pizza', 'mouse', 'keyboard'];

interface Item {
  id: number;
  label: Accessor<string>;
  setLabel: Setter<string>;
}

let nextId = 1;
const random = (max: number) => Math.round(Math.random() * 1000) % max;

const buildData = (count: number): Item[] => {
  const data = new Array<Item>(count);
  for (let i = 0; i < count; i++) {
    const [label, setLabel] = createSignal(
      `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`,
    );
    data[i] = { id: nextId++, label: () => label(), setLabel };
  }
  return data;
};

const [items, setItems] = createSignal<Item[]>([]);
const [selected, setSelected] = createSignal<number | undefined>(undefined);

const run = () => {
  setItems(buildData(1000));
  setSelected(undefined);
};
const runLots = () => {
  setItems(buildData(10000));
  setSelected(undefined);
};
const add = () => setItems([...items(), ...buildData(1000)]);
const update = () => {
  const list = items();
  for (let i = 0; i < list.length; i += 10) list[i]!.setLabel((l) => l + ' !!!');
};
const clear = () => {
  setItems([]);
  setSelected(undefined);
};
const swapRows = () => {
  const list = items();
  if (list.length > 998) {
    const next = list.slice();
    const tmp = next[1]!;
    next[1] = next[998]!;
    next[998] = tmp;
    setItems(next);
  }
};
const remove = (row: Item) => setItems(items().filter((r) => r !== row));

const Row = (row: Item) => (
  <tr class={selected() === row.id ? 'danger' : ''}>
    <td class="col-md-1">{row.id}</td>
    <td class="col-md-4">
      <a onClick={() => setSelected(row.id)}>{row.label}</a>
    </td>
    <td class="col-md-1">
      <a onClick={() => remove(row)}>
        <span class="glyphicon glyphicon-remove" aria-hidden="true" />
      </a>
    </td>
    <td class="col-md-6" />
  </tr>
);

const Layout = () => (
  <div class="container">
    <div class="jumbotron">
      <div class="row">
        <div class="col-md-6">
          <h1>SurgiJS (keyed)</h1>
        </div>
        <div class="col-md-6">
          <div class="row">
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="run" onClick={run}>Create 1,000 rows</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="runlots" onClick={runLots}>Create 10,000 rows</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="add" onClick={add}>Append 1,000 rows</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="update" onClick={update}>Update every 10th row</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="clear" onClick={clear}>Clear</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="swaprows" onClick={swapRows}>Swap Rows</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <table class="table table-hover table-striped test-data">
      <tbody id="tbody">
        <For each={items()}>{Row}</For>
      </tbody>
    </table>
    <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
  </div>
);

createRoot((dispose) => {
  insert(document.getElementById('main')!, <Layout />);
  return dispose;
});
