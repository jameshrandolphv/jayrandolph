interface NodeBase {
  id: string;
  name: string;
  /** Slash-separated path from the desktop root, also the URL path. Empty for the root. */
  path: string;
  /** Key understood by `NodeIcon`. */
  icon: string;
}

export interface FolderNode extends NodeBase {
  kind: 'folder';
  children: FsNode[];
  /** How the folder's window lays out its contents; icons unless set. */
  view?: 'icons' | 'list';
  /** Children that open by URL but are not shown in the folder. */
  hidden?: FsNode[];
}

export interface AppNode extends NodeBase {
  kind: 'app';
  dock?: boolean;
}

export interface ImageNode extends NodeBase {
  kind: 'image';
  thumb: string;
  src: string;
  width: number;
  height: number;
}

export interface FileNode extends NodeBase {
  kind: 'file';
  /** Plain text shown when the file is opened. */
  content: string;
  /** Page the file opens as, instead of its own path in the editor. */
  href?: string;
}

export type FsNode = FolderNode | AppNode | ImageNode | FileNode;

export const segmentsOf = (path: string): string[] => (path ? path.split('/') : []);

export const hrefOf = (node: FsNode): string => (node.kind === 'file' && node.href) || '/' + node.path;
