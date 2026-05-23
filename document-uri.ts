import type { LanguageDefinition } from '@/types/ide';

const WORKSPACE_ROOT_URI = 'file:///workspace';

export function lspDocumentFileName(language: LanguageDefinition) {
  // JDTLS expects the public class name to match the Java file name exactly.
  // Use Main.java as the neutral Java document name without inserting starter code.
  if (language.id === 'java') return 'Main.java';
  return `main.${language.extension}`;
}

export function workspaceDocumentUri(language: LanguageDefinition) {
  // Monaco model URIs can be relative/in-memory (for example `main.java`).
  // Language servers in the Docker bridge run with `/workspace` as root, so
  // keep the JSON-RPC document URI stable and inside that workspace.
  return `${WORKSPACE_ROOT_URI}/${lspDocumentFileName(language)}`;
}
