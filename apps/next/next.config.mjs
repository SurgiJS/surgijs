import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  webpack(config) {
    config.module.rules.unshift({
      test: /\.tsx$/,
      include: path.join(here, 'surgi'),
      enforce: 'pre',
      use: [{ loader: path.join(here, 'loaders/surgi-loader.mjs') }],
    });
    return config;
  },
};
