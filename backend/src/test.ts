import { LexerService } from './lexer/lexer.service';
import { ParserService } from './parser/parser.service';
import { SemanticService } from './semantic/semantic.service';
import { TranslatorService } from './translator/translator.service';

const codigo = `
Algoritmo Test
Definir x Como Entero
Definir mensaje Como Cadena
x <- 10
mensaje <- "Mayor"
Si x > 5 Entonces
Escribir mensaje
Sino
Escribir "Menor"
FinSi
FinAlgoritmo
`;

try {
  const lexer = new LexerService();
  const parser = new ParserService();
  const semantic = new SemanticService();
  const translator = new TranslatorService();

  const tokens = lexer.analizar(codigo);
  console.log('\n=== TOKENS ===');
  console.log(tokens);

  const ast = parser.parse(tokens);
  console.log('\n=== AST ===');
  console.log(JSON.stringify(ast, null, 2));

  semantic.analyze(ast);
  console.log('\n=== SEMANTICO ===');
  console.log('OK Sin errores');

  const java = translator.traducir(ast);
  console.log('\n=== JAVA GENERADO ===');
  console.log(java);
} catch (error) {
  console.error('\nERROR:');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
}
