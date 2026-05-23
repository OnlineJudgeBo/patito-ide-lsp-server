import type { LanguageServerIntegration } from '@/lsp/types';

export const goLspIntegration = {
  language: 'go',
  name: 'gopls',
  description: 'Open-source Go language server for completions, diagnostics and symbols.',
  envKey: 'NEXT_PUBLIC_LSP_GO_WS',
  server: 'gopls',
websocketUrl: process.env.NEXT_PUBLIC_LSP_GO_WS,
} satisfies LanguageServerIntegration;
