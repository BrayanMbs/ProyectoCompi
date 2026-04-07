import { Token } from '../lexer/token.interface';
import { ASTNode } from './ast';

export class ParserService {
  parse(tokens: Token[]): ASTNode {
    const root: ASTNode = {
      type: 'PROGRAMA',
      children: [],
    };

    for (const token of tokens) {
      root.children?.push({
        type: token.type,
        value: token.value,
      });
    }

    return root;
  }
}
