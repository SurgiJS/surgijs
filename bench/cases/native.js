const tpl = document.createElement('template');
tpl.innerHTML = '<div class="row"><span class="id"></span><span class="label"></span></div>';

export default function create(root) {
  let list = [];
  const paint = (r) => {
    r.el.className = r.on ? 'row on' : 'row';
  };
  return {
    init(data) {
      const frag = document.createDocumentFragment();
      list = data.map((d) => {
        const el = tpl.content.firstChild.cloneNode(true);
        el.firstChild.textContent = d.id;
        el.lastChild.textContent = d.label;
        frag.appendChild(el);
        return { el, text: el.lastChild.firstChild, on: false };
      });
      root.appendChild(frag);
    },
    label(i, value) {
      list[i].text.data = value;
    },
    labels(values) {
      for (let i = 0; i < list.length; i++) list[i].text.data = values[i];
    },
    toggle(i) {
      list[i].on = !list[i].on;
      paint(list[i]);
    },
    toggleAll() {
      for (const r of list) {
        r.on = !r.on;
        paint(r);
      }
    },
    commit() {},
    dispose() {
      root.textContent = '';
      list = [];
    },
  };
}
