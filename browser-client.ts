import type * as Monaco from 'monaco-editor';
import { getLanguageServerConfig } from '@/lsp/config';
import { workspaceDocumentUri } from '@/lsp/document-uri';
import type { JsonRpcMessage, LspCodeAction, LspCompletionItem, LspDiagnostic, LspHover, LspMarkupContent, LspPosition, LspSignatureHelp, LspWorkspaceEdit } from '@/lsp/protocol';
import type { LspStatus } from '@/lsp/types';
import type { LanguageDefinition } from '@/types/ide';

type MonacoApi = typeof Monaco;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: number;
};

type MonacoLspCompletionItem = Monaco.languages.CompletionItem & {
  lspItem: LspCompletionItem;
};

function toLspPosition(position: Monaco.Position): LspPosition {
  return { line: position.lineNumber - 1, character: position.column - 1 };
}

function toMonacoSeverity(monaco: MonacoApi, severity?: number) {
  if (severity === 1) return monaco.MarkerSeverity.Error;
  if (severity === 2) return monaco.MarkerSeverity.Warning;
  if (severity === 3) return monaco.MarkerSeverity.Info;
  return monaco.MarkerSeverity.Hint;
}

function markupValue(markup?: LspMarkupContent) {
  if (!markup) return undefined;
  if (typeof markup === 'string') return markup;
  return markup.value;
}

function completionDocumentation(documentation: LspCompletionItem['documentation']) {
  return markupValue(documentation);
}

function completionKind(monaco: MonacoApi, kind?: number) {
  const kinds = monaco.languages.CompletionItemKind;
  if (kind === 2) return kinds.Method;
  if (kind === 3) return kinds.Function;
  if (kind === 4) return kinds.Constructor;
  if (kind === 5) return kinds.Field;
  if (kind === 6) return kinds.Variable;
  if (kind === 7) return kinds.Class;
  if (kind === 8) return kinds.Interface;
  if (kind === 9) return kinds.Module;
  if (kind === 10) return kinds.Property;
  if (kind === 11) return kinds.Unit;
  if (kind === 12) return kinds.Value;
  if (kind === 13) return kinds.Enum;
  if (kind === 14) return kinds.Keyword;
  if (kind === 15) return kinds.Snippet;
  return kinds.Text;
}

function toMonacoRange(monaco: MonacoApi, range: NonNullable<LspCompletionItem['textEdit']>['range']) {
  return new monaco.Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1,
  );
}

function toMonacoTextEdits(monaco: MonacoApi, edits?: LspCompletionItem['additionalTextEdits']) {
  return edits?.map((edit) => ({ range: toMonacoRange(monaco, edit.range), text: plainCompletionText(edit.newText) }));
}

function plainCompletionText(value: string) {
  return value
    .replace(/\$\{\d+:([^}]+)\}/g, '$1')
    .replace(/\$\{\d+\|([^}]+)\|\}/g, (_match, choices: string) => choices.split(',')[0] ?? '')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\$\d+/g, '');
}

function hoverContents(contents: LspHover['contents']) {
  const values = Array.isArray(contents) ? contents : contents ? [contents] : [];
  return values
    .map((item) => {
      if (typeof item === 'string') return { value: item };
      if ('language' in item && item.language && item.value) return { value: `\`\`\`${item.language}\n${item.value}\n\`\`\`` };
      return item.value ? { value: item.value } : undefined;
    })
    .filter((item): item is { value: string } => Boolean(item?.value));
}

function workspaceEditToMonaco(monaco: MonacoApi, edit?: LspWorkspaceEdit) {
  const edits = Object.entries(edit?.changes ?? {}).flatMap(([resource, changes]) =>
    changes.map((change) => ({
      resource: monaco.Uri.parse(resource),
      textEdit: { range: toMonacoRange(monaco, change.range), text: change.newText },
      versionId: undefined,
    })),
  );

  return edits.length ? { edits } : undefined;
}

function resolveWebSocketUrl(websocketUrl: string) {
  if (!websocketUrl.startsWith('/')) return websocketUrl;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/g, '');
  const path = basePath && !websocketUrl.startsWith(`${basePath}/`) ? `${basePath}${websocketUrl}` : websocketUrl;
  return `${protocol}//${window.location.host}${path}`;
}

async function webSocketMessageToText(raw: string | ArrayBuffer | Blob) {
  if (typeof raw === 'string') return raw;
  if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw);
  return raw.text();
}

export class BrowserLspClient {
  private socket?: WebSocket;
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();
  private openedUri?: string;
  private pendingModel?: Monaco.editor.ITextModel;
  private version = 0;
  private initialized = false;

  constructor(
    private readonly monaco: MonacoApi,
    private readonly language: LanguageDefinition,
    private statusChanged: (status: LspStatus, detail: string) => void,
  ) {}

  setStatusChanged(statusChanged: (status: LspStatus, detail: string) => void) {
    this.statusChanged = statusChanged;
  }

  connect() {
    const config = getLanguageServerConfig(this.language.id);
    if (!config.websocketUrl) {
      this.statusChanged('disabled', `${config.name} not configured. Set its ${config.envKey} endpoint.`);
      return;
    }

    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;

    this.initialized = false;
    this.statusChanged('connecting', `Connecting to ${config.name}…`);
    this.socket = new WebSocket(resolveWebSocketUrl(config.websocketUrl));
    this.socket.binaryType = 'arraybuffer';
    this.socket.addEventListener('open', async () => {
      try {
        await this.request('initialize', {
          processId: null,
          rootUri: 'file:///workspace',
          capabilities: {
            textDocument: {
              completion: {
                completionItem: {
                  snippetSupport: false,
                  documentationFormat: ['markdown', 'plaintext'],
                  resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
                },
              },
              publishDiagnostics: { relatedInformation: true },
              hover: { contentFormat: ['markdown', 'plaintext'] },
              signatureHelp: { signatureInformation: { documentationFormat: ['markdown', 'plaintext'] } },
              codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix', 'source.organizeImports'] } } },
            },
          },
          workspaceFolders: null,
        });
        this.notify('initialized', {});
        this.initialized = true;
        this.statusChanged('connected', `${config.name} connected.`);
        this.flushPendingModel();
      } catch (error) {
        this.statusChanged('error', error instanceof Error ? error.message : `${config.name} initialization failed.`);
      }
    });
    this.socket.addEventListener('message', (event) => {
      void this.handleMessage(event.data);
    });
    this.socket.addEventListener('error', () => this.statusChanged('error', `${config.name} WebSocket error.`));
    this.socket.addEventListener('close', () => {
      this.initialized = false;
      this.openedUri = undefined;
      this.statusChanged('disabled', `${config.name} disconnected.`);
    });
  }

  dispose() {
    this.socket?.close();
    this.pending.forEach(({ reject, timeout }) => {
      window.clearTimeout(timeout);
      reject(new Error('LSP client disposed.'));
    });
    this.pending.clear();
    this.initialized = false;
    this.openedUri = undefined;
    this.pendingModel = undefined;
  }

  didOpen(model: Monaco.editor.ITextModel) {
    this.pendingModel = model;
    if (this.isReady()) this.flushPendingModel();
  }

  didChange(model: Monaco.editor.ITextModel) {
    this.pendingModel = model;
    if (!this.isReady()) return;

    const uri = workspaceDocumentUri(this.language);
    if (!this.openedUri) {
      this.flushPendingModel();
      return;
    }

    if (this.openedUri !== uri) {
      this.openDocument(model, uri);
      return;
    }

    this.version += 1;
    this.notify('textDocument/didChange', {
      textDocument: { uri: this.openedUri, version: this.version },
      contentChanges: [{ text: model.getValue() }],
    });
  }

  async completions(model: Monaco.editor.ITextModel, position: Monaco.Position) {
    if (!this.isReady()) return [];
    const uri = this.openedUri ?? workspaceDocumentUri(this.language);
    const result = await this.request('textDocument/completion', {
      textDocument: { uri },
      position: toLspPosition(position),
    });
    const items = Array.isArray(result) ? result : (result as { items?: LspCompletionItem[] })?.items ?? [];
    const word = model.getWordUntilPosition(position);
    const range = new this.monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);

    return items
      .map((item: LspCompletionItem) => this.toMonacoCompletionItem(item, range))
      .filter((item): item is MonacoLspCompletionItem => Boolean(item));
  }

  async resolveCompletion(item: Monaco.languages.CompletionItem) {
    const lspItem = (item as Partial<MonacoLspCompletionItem>).lspItem;
    if (!this.isReady() || !lspItem) return item;

    try {
      const resolved = (await this.request('completionItem/resolve', lspItem)) as LspCompletionItem;
      return this.mergeResolvedCompletionItem(item, resolved);
    } catch {
      return item;
    }
  }

  async hover(_model: Monaco.editor.ITextModel, position: Monaco.Position) {
    if (!this.isReady()) return undefined;
    const result = (await this.request('textDocument/hover', {
      textDocument: { uri: this.openedUri ?? workspaceDocumentUri(this.language) },
      position: toLspPosition(position),
    })) as LspHover | null;
    const contents = hoverContents(result?.contents);
    if (!contents.length) return undefined;
    return {
      contents,
      range: result?.range ? toMonacoRange(this.monaco, result.range) : undefined,
    };
  }

  async signatureHelp(_model: Monaco.editor.ITextModel, position: Monaco.Position) {
    if (!this.isReady()) return undefined;
    const result = (await this.request('textDocument/signatureHelp', {
      textDocument: { uri: this.openedUri ?? workspaceDocumentUri(this.language) },
      position: toLspPosition(position),
    })) as LspSignatureHelp | null;
    const signatures = result?.signatures ?? [];
    if (!signatures.length) return undefined;
    return {
      activeSignature: result?.activeSignature ?? 0,
      activeParameter: result?.activeParameter ?? 0,
      signatures: signatures.map((signature) => ({
        label: signature.label,
        documentation: markupValue(signature.documentation),
        parameters: (signature.parameters ?? []).map((parameter) => ({
          label: parameter.label,
          documentation: markupValue(parameter.documentation),
        })),
      })),
    };
  }

  async codeActions(_model: Monaco.editor.ITextModel, range: Monaco.Range, context: Monaco.languages.CodeActionContext) {
    if (!this.isReady()) return [];
    const result = (await this.request('textDocument/codeAction', {
      textDocument: { uri: this.openedUri ?? workspaceDocumentUri(this.language) },
      range: {
        start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
        end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
      },
      context: {
        diagnostics: context.markers.map((marker) => ({
          range: {
            start: { line: marker.startLineNumber - 1, character: marker.startColumn - 1 },
            end: { line: marker.endLineNumber - 1, character: marker.endColumn - 1 },
          },
          severity: marker.severity,
          message: marker.message,
          source: marker.source,
        })),
      },
    })) as LspCodeAction[] | null;

    return (result ?? [])
      .map((action) => ({
        title: action.title,
        kind: action.kind,
        edit: workspaceEditToMonaco(this.monaco, action.edit),
        command: action.command
          ? { id: action.command.command, title: action.command.title ?? action.title, arguments: action.command.arguments }
          : undefined,
      }))
      .filter((action) => action.edit || action.command);
  }

  private toMonacoCompletionItem(item: LspCompletionItem, defaultRange: Monaco.Range): MonacoLspCompletionItem | null {
    if (item.kind === 15) return null;

    const textEditRange = item.textEdit ? toMonacoRange(this.monaco, item.textEdit.range) : defaultRange;
    return {
      label: item.label,
      kind: completionKind(this.monaco, item.kind),
      detail: item.detail,
      documentation: completionDocumentation(item.documentation),
      filterText: item.filterText,
      sortText: item.sortText ? `0_${item.sortText}` : '0',
      insertText: plainCompletionText(item.textEdit?.newText ?? item.insertText ?? item.label),
      range: textEditRange,
      additionalTextEdits: toMonacoTextEdits(this.monaco, item.additionalTextEdits),
      lspItem: item,
    };
  }

  private mergeResolvedCompletionItem(item: Monaco.languages.CompletionItem, resolved: LspCompletionItem) {
    const current = item as MonacoLspCompletionItem;
    current.lspItem = resolved;
    current.detail = resolved.detail ?? current.detail;
    current.documentation = completionDocumentation(resolved.documentation) ?? current.documentation;
    current.additionalTextEdits = toMonacoTextEdits(this.monaco, resolved.additionalTextEdits) ?? current.additionalTextEdits;
    if (resolved.textEdit?.newText) current.insertText = plainCompletionText(resolved.textEdit.newText);
    else if (resolved.insertText) current.insertText = plainCompletionText(resolved.insertText);
    current.insertTextRules = undefined;
    return current;
  }

  private isReady() {
    return this.initialized && this.socket?.readyState === WebSocket.OPEN;
  }

  private flushPendingModel() {
    if (!this.pendingModel || !this.isReady()) return;
    const uri = workspaceDocumentUri(this.language);
    if (this.openedUri === uri) {
      this.didChange(this.pendingModel);
      return;
    }
    this.openDocument(this.pendingModel, uri);
  }

  private openDocument(model: Monaco.editor.ITextModel, uri: string) {
    this.openedUri = uri;
    this.version = 1;
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: this.language.monacoLanguage,
        version: this.version,
        text: model.getValue(),
      },
    });
  }

  private request(method: string, params: unknown) {
    const id = ++this.requestId;
    const timeoutMs = method === 'initialize' ? 30000 : 10000;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`LSP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private notify(method: string, params: unknown) {
    this.send({ jsonrpc: '2.0', method, params });
  }

  private send(payload: unknown) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(payload));
  }

  private async handleMessage(raw: string | ArrayBuffer | Blob) {
    const text = await webSocketMessageToText(raw);
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(text) as JsonRpcMessage;
    } catch (error) {
      console.error('[lsp-client] invalid JSON-RPC message:', error);
      return;
    }

    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      window.clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message ?? 'LSP request failed.'));
      else pending.resolve(message.result);
      return;
    }

    if (message.method === 'textDocument/publishDiagnostics') {
      const params = message.params as { uri?: string; diagnostics?: LspDiagnostic[] };
      const markers = (params.diagnostics ?? []).map((diagnostic) => ({
        severity: toMonacoSeverity(this.monaco, diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source,
        startLineNumber: diagnostic.range.start.line + 1,
        startColumn: diagnostic.range.start.character + 1,
        endLineNumber: diagnostic.range.end.line + 1,
        endColumn: diagnostic.range.end.character + 1,
      }));
      const diagnosticsUri = params.uri ?? this.openedUri;
      const model =
        diagnosticsUri === this.openedUri && this.pendingModel
          ? this.pendingModel
          : this.monaco.editor.getModels().find((item) => item.uri.toString() === diagnosticsUri);
      if (model) this.monaco.editor.setModelMarkers(model, `lsp-${this.language.id}`, markers);
    }
  }
}
