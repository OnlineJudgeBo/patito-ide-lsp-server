import type { LanguageId } from '@/types/ide';

export type LspStatus = 'disabled' | 'connecting' | 'connected' | 'error';

export type LanguageServerIntegration = {
  language: LanguageId;
  name: string;
  description: string;
  envKey: `NEXT_PUBLIC_LSP_${string}_WS`;
  server: string;
  websocketUrl?: string;
};
