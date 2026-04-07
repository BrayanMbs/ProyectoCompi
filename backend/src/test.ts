import { LexerService } from './lexer/lexer.service';
import { ParserService } from './parser/parser.service';
import { TranslatorService } from './translator/translator.service';

const lexer = new LexerService();
const parser = new ParserService();
const translator = new TranslatorService();

const code = `
Algoritmo Prueba
Definir edad Como Entero
edad <- 20
Si edad > 18 Entonces
Escribir "Mayor"
FinSi
FinAlgoritmo
`;

try {
  const tokens = lexer.analizar(code);
  console.log('TOKENS:', tokens);

  const ast = parser.parse(tokens);
  console.log('AST:', ast);

  const java = translator.traducir(ast);
  console.log('JAVA:\n', java);
} catch (error) {
  console.error('ERROR:', error);
}
