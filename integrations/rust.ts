import type { LanguageServerIntegration } from '@/lsp/types';

export const rustLspIntegration = {
  language: 'rust',
  name: 'rust-analyzer',
  description: 'Open-source Rust LSP for completions, diagnostics and code intelligence.',
  envKey: 'NEXT_PUBLIC_LSP_RUST_WS',
  server: 'rust-analyzer',
websocketUrl: process.env.NEXT_PUBLIC_LSP_RUST_WS,
} satisfies LanguageServerIntegration;
