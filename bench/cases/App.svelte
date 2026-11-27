<script>
  let items = $state.raw([]);

  class Item {
    label = $state.raw('');
    on = $state.raw(false);

    constructor(id, label) {
      this.id = id;
      this.label = label;
    }
  }

  export function init(data) {
    items = data.map((d) => new Item(d.id, d.label));
  }

  export function label(i, value) {
    items[i].label = value;
  }

  export function labels(values) {
    for (let i = 0; i < items.length; i++) items[i].label = values[i];
  }

  export function toggle(i) {
    items[i].on = !items[i].on;
  }

  export function toggleAll() {
    for (const r of items) r.on = !r.on;
  }
</script>

{#each items as r (r.id)}
  <div class={r.on ? 'row on' : 'row'}><span class="id">{r.id}</span><span class="label">{r.label}</span></div>
{/each}
