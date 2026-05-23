export type LspPosition = { line: number; character: number };
export type LspRange = { start: LspPosition; end: LspPosition };

export type LspDiagnostic = {
  range: LspRange;
  severity?: number;
  message: string;
  source?: string;
};

export type LspCompletionItem = {
  label: string;
  detail?: string;
  documentation?: string | { value?: string };
  insertText?: string;
  insertTextFormat?: number;
  filterText?: string;
  sortText?: string;
  textEdit?: {
    range: LspRange;
    newText: string;
  };
  additionalTextEdits?: Array<{
    range: LspRange;
    newText: string;
  }>;
  data?: unknown;
  kind?: number;
};

export type LspMarkupContent = string | { kind?: 'markdown' | 'plaintext'; value?: string };

export type LspHover = {
  contents?: LspMarkupContent | LspMarkupContent[] | { language?: string; value?: string };
  range?: LspRange;
};

export type LspSignatureHelp = {
  signatures?: Array<{
    label: string;
    documentation?: LspMarkupContent;
    parameters?: Array<{ label: string | [number, number]; documentation?: LspMarkupContent }>;
  }>;
  activeSignature?: number;
  activeParameter?: number;
};

export type LspWorkspaceEdit = {
  changes?: Record<string, Array<{ range: LspRange; newText: string }>>;
};

export type LspCodeAction = {
  title: string;
  kind?: string;
  edit?: LspWorkspaceEdit;
  command?: { title?: string; command: string; arguments?: unknown[] };
};

export type JsonRpcMessage = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
};
