import type { LanguageServerIntegration } from '@/lsp/types';

export const pythonLspIntegration = {
  language: 'python',
  name: 'Pyright',
  description: 'Open-source Python language server for type-aware completions and diagnostics.',
  envKey: 'NEXT_PUBLIC_LSP_PYTHON_WS',
  server: 'pyright',
websocketUrl: process.env.NEXT_PUBLIC_LSP_PYTHON_WS,
} satisfies LanguageServerIntegration;
