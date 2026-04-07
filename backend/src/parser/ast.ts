export interface ASTNode {
  type: string;
  value?: string;
  children?: ASTNode[];
}
