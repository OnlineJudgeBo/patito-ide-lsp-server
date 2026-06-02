import type { LanguageServerIntegration } from '@/lsp/types';
import { cppLspIntegration } from './cpp';
import { goLspIntegration } from './go';
import { javaLspIntegration } from './java';
import { javascriptLspIntegration } from './javascript';
import { pythonLspIntegration } from './python';
import { rustLspIntegration } from './rust';

export const LSP_INTEGRATIONS = {
  cpp: cppLspIntegration,
  python: pythonLspIntegration,
  java: javaLspIntegration,
  javascript: javascriptLspIntegration,
  rust: rustLspIntegration,
  go: goLspIntegration,
} satisfies Record<string, LanguageServerIntegration>;
