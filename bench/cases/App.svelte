<script>
  let items = $state([]);

  export function init(data) {
    items = data.map((d) => ({ ...d, on: false }));
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
