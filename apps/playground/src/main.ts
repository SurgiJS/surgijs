import '@surgijs/ui/themes.css';
import '@surgijs/ui';
import type { SButtonElement } from '@surgijs/ui';
import './counter';
import './dropdown';
import './virtual-table';
import './virtual-tiles';

const picked = document.querySelector<HTMLOutputElement>('#picked')!;
document.querySelector('ui-dropdown')!.addEventListener('change', (e) => {
  picked.value = e.detail;
});

const theme = document.querySelector<HTMLSelectElement>('#theme')!;
theme.addEventListener('change', () => {
  if (theme.value) document.documentElement.dataset.theme = theme.value;
  else delete document.documentElement.dataset.theme;
});

const save = document.querySelector<SButtonElement>('#save')!;
save.addEventListener('click', () => {
  save.loading = true;
  setTimeout(() => (save.loading = false), 1500);
});

document.querySelector('#button-form')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const out = document.querySelector<HTMLOutputElement>('#submitted')!;
  out.value = `submitted at ${new Date().toLocaleTimeString()}`;
});
