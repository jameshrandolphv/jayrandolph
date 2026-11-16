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

/** A row that opens a page on another site, such as a store listing, in a new tab, or downloads a file. */
export interface LinkNode extends NodeBase {
  kind: 'link';
  /** Absent while there is nowhere to go yet: the row shows disabled. */
  url?: string;
  /** Picture shown in place of a `NodeIcon`; without one the row shows its `icon`. */
  image?: string;
  /** The picture has its own shape (a macOS app icon), so it is shown as is rather than rounded. */
  shapedImage?: boolean;
  /** `NodeIcon` key shown small after the name, e.g. the platform of a download. */
  badge?: string;
  /** The URL is a file to save rather than a page to open. */
  download?: boolean;
}

export type FsNode = FolderNode | AppNode | ImageNode | FileNode | LinkNode;

export const segmentsOf = (path: string): string[] => (path ? path.split('/') : []);

export const hrefOf = (node: FsNode): string =>
  (node.kind === 'file' && node.href) || (node.kind === 'link' && node.url) || '/' + node.path;
