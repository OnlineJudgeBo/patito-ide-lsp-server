import type { LanguageId } from '@/types/ide';
import { LSP_INTEGRATIONS } from '@/lsp/integrations';

export type { LanguageServerIntegration as LanguageServerConfig } from '@/lsp/types';
export { LSP_INTEGRATIONS as LANGUAGE_SERVER_CONFIG } from '@/lsp/integrations';

export function getLanguageServerConfig(language: LanguageId) {
  return LSP_INTEGRATIONS[language];
}
