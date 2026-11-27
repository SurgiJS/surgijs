<script setup>
import { reactive, shallowRef } from 'vue';

const items = shallowRef([]);

const init = (data) => {
  items.value = data.map((d) => reactive({ id: d.id, label: d.label, on: false }));
};
const label = (i, value) => {
  items.value[i].label = value;
};
const labels = (values) => {
  const list = items.value;
  for (let i = 0; i < list.length; i++) list[i].label = values[i];
};
const toggle = (i) => {
  items.value[i].on = !items.value[i].on;
};
const toggleAll = () => {
  for (const r of items.value) r.on = !r.on;
};

defineExpose({ init, label, labels, toggle, toggleAll });
</script>

<template>
  <div v-for="r in items" :key="r.id" v-memo="[r.label, r.on]" :class="r.on ? 'row on' : 'row'">
    <span class="id">{{ r.id }}</span><span class="label">{{ r.label }}</span>
  </div>
</template>
