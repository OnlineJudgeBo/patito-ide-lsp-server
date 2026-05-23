import type { LanguageServerIntegration } from '@/lsp/types';

export const javaLspIntegration = {
  language: 'java',
  name: 'Eclipse JDT Language Server',
  description: 'Open-source Java LSP with Scanner/class/member completions, diagnostics and symbols.',
  envKey: 'NEXT_PUBLIC_LSP_JAVA_WS',
  server: 'jdtls',
websocketUrl: process.env.NEXT_PUBLIC_LSP_JAVA_WS,
} satisfies LanguageServerIntegration;
