import { LexerService } from '../src/lexer/lexer.service';
import { ParserService } from '../src/parser/parser.service';
import { SemanticService } from '../src/semantic/semantic.service';
import { TranslatorService } from '../src/translator/translator.service';

const codigo = `
Algoritmo Test
x <- 10
FinAlgoritmo
`;

try {
  const lexer = new LexerService();
  const parser = new ParserService();
  const semantic = new SemanticService();
  const translator = new TranslatorService();

  // 🔥 1. LEXER
  const tokens = lexer.analizar(codigo);
  console.log('\n=== TOKENS ===');
  console.log(tokens);

  // 🔥 2. PARSER
  const ast = parser.parse(tokens);
  console.log('\n=== AST ===');
  console.log(JSON.stringify(ast, null, 2));

  // 🔥 3. SEMÁNTICO
  semantic.analyze(ast);
  console.log('\n=== SEMÁNTICO ===');
  console.log('✔ Sin errores');

  // 🔥 4. TRADUCTOR
  const java = translator.traducir(ast);
  console.log('\n=== JAVA GENERADO ===');
  console.log(java);
} catch (error) {
  console.error('\n❌ ERROR:');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
}
