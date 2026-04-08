export interface ASTNode {
  type: string;
  value?: string;
  name?: string;
  dataType?: string;
  expression?: string;
  operator?: string;
  returnType?: string;
  params?: Array<{ name: string; dataType: string }>;
  condition?: {
    left: string;
    operator: string;
    right: string;
  };
  cases?: ASTNode[];
  defaultCase?: ASTNode;
  elseBranch?: ASTNode[];
  children?: ASTNode[];
  line?: number;
}
