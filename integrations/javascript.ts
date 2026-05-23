import type { LanguageServerIntegration } from '@/lsp/types';

export const javascriptLspIntegration = {
  language: 'javascript',
  name: 'typescript-language-server',
  description: 'Open-source JavaScript/TypeScript LSP for IntelliSense and diagnostics.',
  envKey: 'NEXT_PUBLIC_LSP_JAVASCRIPT_WS',
  server: 'typescript-language-server',
websocketUrl: process.env.NEXT_PUBLIC_LSP_JAVASCRIPT_WS,
} satisfies LanguageServerIntegration;
