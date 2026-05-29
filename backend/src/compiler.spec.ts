import { LexerService } from './lexer/lexer.service';
import { ParserService } from './parser/parser.service';
import { SemanticService } from './semantic/semantic.service';
import { TranslatorService } from './translator/translator.service';
import { CompilerService } from './compiler/compiler.service';

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

  it('reconoce bloques Segun con varios casos y defecto', () => {
    const codigo = `
Algoritmo MenuDemo
Definir opcion Como Entero
opcion <- 2
Segun opcion Hacer
Caso 1
Escribir "Crear"
Caso 2
Escribir "Editar"
Defecto
Escribir "Salir"
FinSegun
FinAlgoritmo
`;

    const lexer = new LexerService();
    const parser = new ParserService();
    const semantic = new SemanticService();
    const translator = new TranslatorService();

    const ast = parser.parse(lexer.analizar(codigo));

    expect(() => semantic.analyze(ast)).not.toThrow();

    const java = translator.traducir(ast);
    expect(java).toContain('switch (opcion)');
    expect(java).toContain('case 1:');
    expect(java).toContain('case 2:');
    expect(java).toContain('default:');
  });

  it('devuelve diagnostics con severity y ubicacion exacta', () => {
    const codigo = `
Algoritmo Diagnosticos
Definir x Como Entero
Definir x Como Real
Si x > 1
Escribir y
FinAlgoritmo
`;

    const result = new CompilerService().compile(codigo);

    expect(result.ok).toBe(false);
    expect(result.diagnostics?.length).toBeGreaterThan(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          stage: 'Semantico',
          line: 4,
          column: 9,
          message: 'Variable "x" ya declarada.',
        }),
        expect.objectContaining({
          severity: 'error',
          stage: 'Sintactico',
          line: 5,
          message: 'Se esperaba "Entonces".',
        }),
      ]),
    );
    expect(result.tokens).toBeDefined();
    expect(result.ast?.type).toBe('PROGRAM');
    expect(result.symbolTable?.length).toBeGreaterThan(0);
  });

  it('mantiene diagnostics vacio para programas validos', () => {
    const codigo = `
Algoritmo Valido
Definir x Como Entero
x <- 10
FinAlgoritmo
`;

    const result = new CompilerService().compile(codigo);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens?.length).toBeGreaterThan(0);
    expect(result.ast?.type).toBe('PROGRAM');
    expect(result.symbolTable?.length).toBeGreaterThan(0);
    expect(result.java).toContain('public class Valido');
  });

  it('acepta expresiones aritmeticas sin diagnosticarlas como lexico', () => {
    const codigo = `
Algoritmo Aritmetica
Definir x Como Entero
x <- 1
x <- x + 1
FinAlgoritmo
`;

    const result = new CompilerService().compile(codigo);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'OPERADOR_ARITMETICO',
          value: '+',
          line: 5,
        }),
      ]),
    );
    expect(result.java).toContain('x = x + 1;');
  });
});
