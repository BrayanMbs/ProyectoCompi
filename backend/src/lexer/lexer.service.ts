import { regex, palabrasReservadas } from './regex';
import { TokenType } from './tokens';

export class LexerService {
  analizar(code: string) {
    const tokens: { type: TokenType; value: string }[] = [];

    const palabras = code.match(/"[^"]*"|\S+/g) || [];

    for (const palabra of palabras) {
      if (palabrasReservadas.includes(palabra)) {
        tokens.push({
          type: TokenType.PALABRA_RESERVADA,
          value: palabra,
        });
      } else if (regex.numero.test(palabra)) {
        tokens.push({
          type: TokenType.NUMERO,
          value: palabra,
        });
      } else if (regex.cadena.test(palabra)) {
        tokens.push({
          type: TokenType.CADENA,
          value: palabra,
        });
      } else if (regex.operadorRelacional.test(palabra)) {
        tokens.push({
          type: TokenType.OPERADOR,
          value: palabra,
        });
      } else if (regex.identificador.test(palabra)) {
        tokens.push({
          type: TokenType.IDENTIFICADOR,
          value: palabra,
        });
      } else {
        tokens.push({
          type: TokenType.DESCONOCIDO,
          value: palabra,
        });
      }
    }

    return tokens;
  }
}
