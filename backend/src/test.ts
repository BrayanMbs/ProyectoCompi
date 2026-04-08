import { LexerService } from './lexer/lexer.service';
import { ParserService } from './parser/parser.service';
import { SemanticService } from './semantic/semantic.service';
import { TranslatorService } from './translator/translator.service';

const codigo = `
Algoritmo DemoComplejo
Definir x Como Entero
Definir limite Como Entero
Definir acumulado Como Entero
Definir mensaje Como Cadena
Definir activo Como Logico

x <- 1
limite <- 3
acumulado <- sumar(x, limite)
mensaje <- "Inicio"
activo <- Verdadero

Mientras x < limite Hacer
Escribir x
x <- x + 1
FinMientras

Para x <- 1 Hasta 3 Hacer
Escribir x
FinPara

Hacer
Escribir mensaje
activo <- Falso
Mientras activo == Verdadero

Segun acumulado Hacer
Caso 4
Escribir "Cuatro"
Defecto
Escribir "Otro"
FinSegun

Si acumulado >= 4 Entonces
Escribir "Listo"
Sino
Escribir "Pendiente"
FinSi

Funcion sumar(a Como Entero, b Como Entero) Como Entero
Definir resultado Como Entero
resultado <- a + b
Retornar resultado
FinFuncion
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
