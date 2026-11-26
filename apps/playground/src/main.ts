import './counter';
import './dropdown';
import './virtual-table';
import './virtual-tiles';

const picked = document.querySelector<HTMLOutputElement>('#picked')!;
document.querySelector('ui-dropdown')!.addEventListener('change', (e) => {
  picked.value = String((e as CustomEvent<string>).detail);
});
