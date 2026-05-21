import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: '.output',
  manifest: {
    name: 'Translator',
    description: 'AI-powered bilingual page translation',
    permissions: ['storage', 'activeTab', 'scripting'],
    commands: {
      'toggle-translation': {
        suggested_key: { default: 'Alt+A' },
        description: 'Toggle bilingual translation on/off',
      },
    },
  },
});
