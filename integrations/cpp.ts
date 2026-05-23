import type { LanguageServerIntegration } from '@/lsp/types';

export const cppLspIntegration = {
  language: 'cpp',
  name: 'clangd',
  description: 'Open-source C/C++ LSP for completions, diagnostics and semantic navigation.',
  envKey: 'NEXT_PUBLIC_LSP_CPP_WS',
  server: 'clangd',
websocketUrl: process.env.NEXT_PUBLIC_LSP_CPP_WS,
} satisfies LanguageServerIntegration;
