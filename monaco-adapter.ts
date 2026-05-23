import type * as Monaco from 'monaco-editor';
import { BrowserLspClient } from '@/lsp/browser-client';
import type { LspStatus } from '@/lsp/types';
import type { LanguageDefinition } from '@/types/ide';

type MonacoApi = typeof Monaco;

const clients = new Map<string, BrowserLspClient>();
const registeredCompletionProviders = new Set<string>();
const registeredLanguageFeatureProviders = new Set<string>();

export function ensureLspCompletionProvider(monaco: MonacoApi, language: LanguageDefinition) {
  if (registeredCompletionProviders.has(language.monacoLanguage)) return;
  registeredCompletionProviders.add(language.monacoLanguage);

  monaco.languages.registerCompletionItemProvider(language.monacoLanguage, {
    triggerCharacters: ['.', ':', '>', '<', '(', ' ', '_'],
    provideCompletionItems: async (model, position) => {
      const client = clients.get(language.id);
      if (!client) return { suggestions: [] };
      return { suggestions: await client.completions(model, position) };
    },
    resolveCompletionItem: async (item) => {
      const client = clients.get(language.id);
      if (!client) return item;
      return client.resolveCompletion(item);
    },
  });
}

function ensureLspLanguageFeatureProviders(monaco: MonacoApi, language: LanguageDefinition) {
  if (registeredLanguageFeatureProviders.has(language.monacoLanguage)) return;
  registeredLanguageFeatureProviders.add(language.monacoLanguage);

  monaco.languages.registerHoverProvider(language.monacoLanguage, {
    provideHover: async (model, position) => clients.get(language.id)?.hover(model, position),
  });

  monaco.languages.registerSignatureHelpProvider(language.monacoLanguage, {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp: async (model, position) => {
      const value = await clients.get(language.id)?.signatureHelp(model, position);
      if (!value) return undefined;
      return { value, dispose: () => undefined };
    },
  });

  monaco.languages.registerCodeActionProvider(language.monacoLanguage, {
    provideCodeActions: async (model, range, context) => ({
      actions: await (clients.get(language.id)?.codeActions(model, range, context) ?? []),
      dispose: () => undefined,
    }),
  });
}

export function attachLanguageServer(
  monaco: MonacoApi,
  editor: Monaco.editor.IStandaloneCodeEditor,
  language: LanguageDefinition,
  statusChanged: (status: LspStatus, detail: string) => void,
) {
  ensureLspCompletionProvider(monaco, language);
  ensureLspLanguageFeatureProviders(monaco, language);
  let client = clients.get(language.id);
  if (!client) {
    client = new BrowserLspClient(monaco, language, statusChanged);
    clients.set(language.id, client);
  } else {
    client.setStatusChanged(statusChanged);
  }

  const model = editor.getModel();
  if (model) client.didOpen(model);
  client.connect();

  let timer: number | undefined;
  const disposable = editor.onDidChangeModelContent(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const currentModel = editor.getModel();
      if (currentModel) client.didChange(currentModel);
    }, 350);
  });

  return () => {
    disposable.dispose();
    window.clearTimeout(timer);
    client.dispose();
    clients.delete(language.id);
  };
}
