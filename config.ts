import type { LanguageId } from '@/types/ide';
import { LSP_INTEGRATIONS } from '@/lsp/integrations';
import type { LanguageServerIntegration } from '@/lsp/types';

export type { LanguageServerIntegration as LanguageServerConfig } from '@/lsp/types';
export { LSP_INTEGRATIONS as LANGUAGE_SERVER_CONFIG } from '@/lsp/integrations';

const disabledIntegration: LanguageServerIntegration = {
  language: 'text',
  name: 'No LSP',
  description: 'No language server is configured for this language.',
  envKey: 'NEXT_PUBLIC_LSP_DISABLED_WS',
  server: 'none',
  websocketUrl: '',
};

export function getLanguageServerConfig(language: LanguageId): LanguageServerIntegration {
  return (LSP_INTEGRATIONS as Partial<Record<string, LanguageServerIntegration>>)[language] ?? disabledIntegration;
}
