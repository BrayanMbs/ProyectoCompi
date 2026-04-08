import { regex, palabrasReservadas, tiposDato } from './regex';
import { Token } from './token.interface';
import { TokenType } from './tokens';

export class LexerService {
  analizar(code: string): Token[] {
    const tokens: Token[] = [];
    const lines = code.replace(/\r/g, '').split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineNumber = lineIndex + 1;
      const line = lines[lineIndex];
      let cursor = 0;

      while (cursor < line.length) {
        if (/\s/.test(line[cursor])) {
          cursor++;
          continue;
        }

        const fragment = line.slice(cursor);
        const column = cursor + 1;
        const stringMatch = fragment.match(/^"([^"\\]|\\.)*"/);
        const assignmentMatch = fragment.match(/^<-/);
        const relationalMatch = fragment.match(/^(==|!=|<=|>=|<|>)/);
        const numberMatch = fragment.match(/^\d+(\.\d+)?/);
        const identifierMatch = fragment.match(/^[a-zA-Z][a-zA-Z0-9]*/);

        if (stringMatch) {
          tokens.push({
            type: TokenType.CADENA,
            value: stringMatch[0],
            line: lineNumber,
            column,
          });
          cursor += stringMatch[0].length;
          continue;
        }

        if (assignmentMatch) {
          tokens.push({
            type: TokenType.ASIGNACION,
            value: assignmentMatch[0],
            line: lineNumber,
            column,
          });
          cursor += assignmentMatch[0].length;
          continue;
        }

        if (relationalMatch) {
          tokens.push({
            type: TokenType.OPERADOR_RELACIONAL,
            value: relationalMatch[0],
            line: lineNumber,
            column,
          });
          cursor += relationalMatch[0].length;
          continue;
        }

        if (numberMatch) {
          tokens.push({
            type: TokenType.NUMERO,
            value: numberMatch[0],
            line: lineNumber,
            column,
          });
          cursor += numberMatch[0].length;
          continue;
        }

        if (identifierMatch) {
          const value = identifierMatch[0];
          let type = TokenType.IDENTIFICADOR;

          if (palabrasReservadas.includes(value)) {
            type = TokenType.PALABRA_RESERVADA;
          } else if (tiposDato.includes(value)) {
            type = TokenType.TIPO_DATO;
          } else if (regex.booleano.test(value)) {
            type = TokenType.BOOLEANO;
          }

          tokens.push({
            type,
            value,
            line: lineNumber,
            column,
          });
          cursor += value.length;
          continue;
        }

        tokens.push({
          type: TokenType.DESCONOCIDO,
          value: line[cursor],
          line: lineNumber,
          column,
        });
        cursor++;
      }

      tokens.push({
        type: TokenType.NUEVA_LINEA,
        value: '\\n',
        line: lineNumber,
        column: line.length + 1,
      });
    }

    return tokens;
  }
}
