import surgijs from '@surgijs/astro';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [surgijs()],
});
