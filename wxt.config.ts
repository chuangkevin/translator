import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: '.output',
  manifest: {
    name: 'Translator',
    description: 'AI-powered bilingual page translation',
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    permissions: ['storage', 'activeTab', 'scripting', 'tabs'],
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-translation': {
        suggested_key: { default: 'Alt+A' },
        description: 'Toggle bilingual translation on/off',
      },
    },
  },
});
