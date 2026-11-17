export interface SurgiVitePluginOptions {
  moduleName?: string;
}

export default function surgi(_options: SurgiVitePluginOptions = {}) {
  return { name: 'surgijs', enforce: 'pre' as const };
}
