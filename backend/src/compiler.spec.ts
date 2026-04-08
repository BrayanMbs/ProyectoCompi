import { LexerService } from './lexer/lexer.service';
import { ParserService } from './parser/parser.service';
import { SemanticService } from './semantic/semantic.service';
import { TranslatorService } from './translator/translator.service';

describe('Compiler flow', () => {
  it('traduce un programa simple a Java valido', () => {
    const codigo = `
Algoritmo Demo
Definir x Como Entero
Definir mensaje Como Cadena
x <- 10
mensaje <- "Hola"
Si x > 5 Entonces
Escribir mensaje
Sino
Escribir "Adios"
FinSi
FinAlgoritmo
`;

    const lexer = new LexerService();
    const parser = new ParserService();
    const semantic = new SemanticService();
    const translator = new TranslatorService();

    const tokens = lexer.analizar(codigo);
    const ast = parser.parse(tokens);

    expect(() => semantic.analyze(ast)).not.toThrow();

    const java = translator.traducir(ast);
    expect(java).toContain('public class Demo');
    expect(java).toContain('int x;');
    expect(java).toContain('String mensaje;');
    expect(java).toContain('x = 10;');
    expect(java).toContain('System.out.println(mensaje);');
    expect(java).toContain('if (x > 5)');
  });

  it('detecta uso de variable no declarada', () => {
    const codigo = `
Algoritmo ErrorDemo
x <- 10
FinAlgoritmo
`;

    const lexer = new LexerService();
    const parser = new ParserService();
    const semantic = new SemanticService();

    const ast = parser.parse(lexer.analizar(codigo));

    expect(() => semantic.analyze(ast)).toThrow('Variable x no declarada');
  });
});
