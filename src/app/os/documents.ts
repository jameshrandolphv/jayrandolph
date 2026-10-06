import changelog from '../../../CHANGELOG.md';

export interface DocumentDef {
  /** Filename in lowercase; doubles as the URL segment. */
  id: string;
  name: string;
  content: string;
}

export const DOCUMENTS: readonly DocumentDef[] = [
  { id: 'do-not-open.txt', name: 'DO NOT OPEN.txt', content: 'Why would you do that...' },
  { id: 'about.txt', name: 'about.txt', content: 'I should definitely update this' },
  { id: 'CHANGELOG.md', name: 'CHANGELOG.md', content: changelog.trimEnd() },
];
