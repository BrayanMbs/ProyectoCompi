import { ASTNode } from './ast';
import { Token } from '../lexer/token.interface';

export class ParserService {
  parse(tokens: Token[]): ASTNode {
    const root: ASTNode = {
      type: 'PROGRAM',
      value: '',
      children: [],
    };

    const stack: string[] = [];

    for (const token of tokens) {
      if (token.value === 'Algoritmo') stack.push('Algoritmo');

      if (token.value === 'FinAlgoritmo') {
        if (stack.pop() !== 'Algoritmo') {
          throw new Error('FinAlgoritmo sin Algoritmo');
        }
      }

      if (token.value === 'Si') stack.push('Si');

      if (token.value === 'Sino' && !stack.includes('Si')) {
        throw new Error('Sino sin Si');
      }

      if (token.value === 'FinSi') {
        if (stack.pop() !== 'Si') {
          throw new Error('FinSi sin Si');
        }
      }

      if (token.value === 'Mientras') stack.push('Mientras');

      if (token.value === 'FinMientras') {
        if (stack.pop() !== 'Mientras') {
          throw new Error('FinMientras sin Mientras');
        }
      }

      if (token.value === 'Para') stack.push('Para');

      if (token.value === 'FinPara') {
        if (stack.pop() !== 'Para') {
          throw new Error('FinPara sin Para');
        }
      }

      root.children?.push({
        type: token.type,
        value: token.value,
      });
    }

    if (stack.length > 0) {
      throw new Error('Estructura no cerrada');
    }

    return root;
  }
}
