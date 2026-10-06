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

export type FsNode = FolderNode | AppNode | ImageNode;

export const segmentsOf = (path: string): string[] => (path ? path.split('/') : []);

export const hrefOf = (node: FsNode): string => '/' + node.path;
