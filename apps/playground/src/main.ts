import './counter';
import './dropdown';

const picked = document.querySelector<HTMLOutputElement>('#picked')!;
document.querySelector('ui-dropdown')!.addEventListener('change', (e) => {
  picked.value = String((e as CustomEvent<string>).detail);
});
