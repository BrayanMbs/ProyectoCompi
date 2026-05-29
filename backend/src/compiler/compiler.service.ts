import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { LexerService } from '../lexer/lexer.service';
import { Token } from '../lexer/token.interface';
import { ParserService } from '../parser/parser.service';
import { ASTNode } from '../parser/ast';
import { regex } from '../lexer/regex';
import { SemanticService } from '../semantic/semantic.service';
import { TranslatorService } from '../translator/translator.service';

const execFileAsync = promisify(execFile);

export interface CompileResult {
  ok: boolean;
  tokens?: ReturnType<LexerService['analizar']>;
  ast?: ReturnType<ParserService['parse']>;
  symbolTable?: SymbolTableEntry[];
  diagnostics?: Diagnostic[];
  java?: string;
  error?: string;
  errorLine?: number;
  errorType?: CompileStage;
  suggestion?: string;
}

export interface RunJavaResult {
  ok: boolean;
  status: string;
  output?: string;
  error?: string;
}

type CompileStage = 'Lexico' | 'Sintactico' | 'Semantico' | 'Traduccion';
type DiagnosticSeverity = 'error' | 'warning' | 'info';

interface BlockFrame {
  kind: 'PROGRAM' | 'IF' | 'WHILE' | 'FOR' | 'SWITCH' | 'FUNCTION' | 'DO_WHILE';
  line: number;
  expected: string;
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  stage: CompileStage;
  line: number;
  column: number;
  endColumn?: number;
  message: string;
  suggestion: string;
  source?: string;
}

export interface SymbolTableEntry {
  nombre: string;
  categoria: 'programa' | 'variable' | 'funcion' | 'parametro';
  tipo: string;
  ambito: string;
  linea?: number;
}

@Injectable()
export class CompilerService {
  private readonly lexer = new LexerService();
  private readonly parser = new ParserService();
  private readonly semantic = new SemanticService();
  private readonly translator = new TranslatorService();

  compile(code: string): CompileResult {
    let stage: CompileStage = 'Lexico';
    let tokens: Token[] = [];
    let ast: ASTNode | undefined;
    const diagnostics = this.collectDiagnostics(code);
    const recoveredAst = this.buildRecoveredAst(code);
    const symbolTable = this.buildSymbolTableFromSource(code);

    try {
      tokens = this.lexer.analizar(code);
      stage = 'Sintactico';
      ast = this.parser.parse(tokens);
      const parsedSymbolTable = this.buildSymbolTable(ast);
      stage = 'Semantico';
      this.semantic.analyze(ast);
      stage = 'Traduccion';
      const java = this.translator.traducir(ast);

      return {
        ok: true,
        tokens,
        ast,
        symbolTable: parsedSymbolTable,
        diagnostics,
        java,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      const fallbackDiagnostic = this.errorToDiagnostic(message, stage, code);
      const allDiagnostics = this.mergeDiagnostics(diagnostics, fallbackDiagnostic);

      return {
        ok: false,
        error: message,
        errorLine: this.extractErrorLine(message),
        errorType: stage,
        suggestion: this.buildSuggestion(message, stage),
        tokens,
        ast: ast ?? recoveredAst,
        symbolTable,
        diagnostics: allDiagnostics,
      };
    }
  }

  private collectDiagnostics(code: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const tokens = this.lexer.analizar(code);
    const lines = code.replace(/\r/g, '').split('\n');
    const declarations = new Map<string, { type: string; line: number; column: number }>();
    const functions = new Map<string, { returnType: string; line: number; column: number; params: Array<{ name: string; dataType: string }> }>();
    const blockStack: BlockFrame[] = [];
    let currentFunctionReturn: string | null = null;

    for (const token of tokens) {
      if (token.type === 'DESCONOCIDO') {
        this.pushDiagnostic(diagnostics, {
          severity: 'error',
          stage: 'Lexico',
          line: token.line,
          column: token.column,
          endColumn: token.column + token.value.length,
          message: `Caracter no reconocido "${token.value}".`,
          suggestion: 'Elimina el caracter o reemplazalo por un simbolo valido del lenguaje NEBULA.',
          source: lines[token.line - 1]?.trim(),
        });
      }
    }

    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      const lineNumber = index + 1;
      const column = rawLine.search(/\S/) + 1 || 1;

      if (!line) {
        return;
      }

      if (lineNumber === 1 && !regex.lineaPrograma.test(line)) {
        this.pushDiagnostic(diagnostics, {
          severity: 'error',
          stage: 'Sintactico',
          line: lineNumber,
          column,
          message: 'Se esperaba "Algoritmo Nombre".',
          suggestion: 'Agregue una linea inicial como: Algoritmo MiPrograma.',
          source: line,
        });
      }

      if (regex.lineaPrograma.test(line)) {
        blockStack.push({ kind: 'PROGRAM', line: lineNumber, expected: 'FinAlgoritmo' });
        return;
      }

      if (regex.declaracion.test(line)) {
        const match = line.match(/^Definir\s+([a-zA-Z][a-zA-Z0-9]*)\s+Como\s+(Entero|Real|Cadena|Logico)$/);
        const name = match?.[1];
        if (name) {
          if (declarations.has(name)) {
            const previous = declarations.get(name);
            this.pushDiagnostic(diagnostics, {
              severity: 'error',
              stage: 'Semantico',
              line: lineNumber,
              column: rawLine.indexOf(name) + 1,
              endColumn: rawLine.indexOf(name) + name.length + 1,
              message: `Variable "${name}" ya declarada.`,
              suggestion: `Cambie el nombre o elimine esta declaracion duplicada. Primera declaracion en linea ${previous?.line}.`,
              source: line,
            });
          } else {
            declarations.set(name, {
              type: match[2],
              line: lineNumber,
              column: rawLine.indexOf(name) + 1,
            });
          }
        }
        return;
      }

      if (line.startsWith('Definir')) {
        this.pushDiagnostic(diagnostics, {
          severity: 'error',
          stage: 'Sintactico',
          line: lineNumber,
          column,
          message: 'Declaracion invalida.',
          suggestion: 'Use el formato: Definir nombre Como Tipo.',
          source: line,
        });
        return;
      }

      if (regex.funcion.test(line)) {
        const functionInfo = this.parseFunctionHeader(line);
        if (functionInfo) {
          if (functions.has(functionInfo.name)) {
            this.pushDiagnostic(diagnostics, {
              severity: 'error',
              stage: 'Semantico',
              line: lineNumber,
              column: rawLine.indexOf(functionInfo.name) + 1,
              message: `Funcion "${functionInfo.name}" ya declarada.`,
              suggestion: 'Cambie el nombre de la funcion o elimine la declaracion duplicada.',
              source: line,
            });
          }
          functions.set(functionInfo.name, {
            returnType: functionInfo.returnType,
            line: lineNumber,
            column: rawLine.indexOf(functionInfo.name) + 1,
            params: functionInfo.params,
          });

          for (const param of functionInfo.params) {
            declarations.set(param.name, {
              type: param.dataType,
              line: lineNumber,
              column: rawLine.indexOf(param.name) + 1,
            });
          }

          currentFunctionReturn = functionInfo.returnType;
          blockStack.push({ kind: 'FUNCTION', line: lineNumber, expected: 'FinFuncion' });
        }
        return;
      }

      if (line.startsWith('Funcion')) {
        this.pushDiagnostic(diagnostics, {
          severity: 'error',
          stage: 'Sintactico',
          line: lineNumber,
          column,
          message: 'Declaracion de funcion invalida.',
          suggestion: 'Use: Funcion Nombre(param Como Tipo) Como Tipo.',
          source: line,
        });
        return;
      }

      if (/^Si\b/.test(line)) {
        if (!/\bEntonces$/.test(line)) {
          this.pushDiagnostic(diagnostics, {
            severity: 'error',
            stage: 'Sintactico',
            line: lineNumber,
            column: rawLine.length + 1,
            message: 'Se esperaba "Entonces".',
            suggestion: 'Agregue la palabra reservada "Entonces" despues de la condicion.',
            source: line,
          });
        } else if (!regex.si.test(line)) {
          this.pushDiagnostic(diagnostics, {
            severity: 'error',
            stage: 'Sintactico',
            line: lineNumber,
            column,
            message: 'Condicion invalida en estructura Si.',
            suggestion: 'Use una condicion como: Si edad >= 18 Entonces.',
            source: line,
          });
        }
        blockStack.push({ kind: 'IF', line: lineNumber, expected: 'FinSi' });
        return;
      }

      if (/^Mientras\b/.test(line)) {
        const top = blockStack[blockStack.length - 1];
        if (top?.kind === 'DO_WHILE' && regex.condicion.test(line.replace(/^Mientras\s+/, ''))) {
          blockStack.pop();
          return;
        }

        if (!/\bHacer$/.test(line)) {
          this.pushDiagnostic(diagnostics, {
            severity: 'error',
            stage: 'Sintactico',
            line: lineNumber,
            column: rawLine.length + 1,
            message: 'Se esperaba "Hacer".',
            suggestion: 'Agregue "Hacer" al final del ciclo Mientras.',
            source: line,
          });
        } else if (!regex.mientras.test(line)) {
          this.pushDiagnostic(diagnostics, {
            severity: 'error',
            stage: 'Sintactico',
            line: lineNumber,
            column,
            message: 'Condicion invalida en ciclo Mientras.',
            suggestion: 'Use una condicion como: Mientras i < 10 Hacer.',
            source: line,
          });
        }
        blockStack.push({ kind: 'WHILE', line: lineNumber, expected: 'FinMientras' });
        return;
      }

      if (/^Para\b/.test(line)) {
        if (!regex.para.test(line)) {
          this.pushDiagnostic(diagnostics, {
            severity: 'error',
            stage: 'Sintactico',
            line: lineNumber,
            column,
            message: 'Estructura Para invalida.',
            suggestion: 'Use: Para i <- inicio Hasta fin Hacer.',
            source: line,
          });
        }
        const loopVar = line.match(/^Para\s+([a-zA-Z][a-zA-Z0-9]*)/)?.[1];
        if (loopVar && !declarations.has(loopVar)) {
          this.pushDiagnostic(diagnostics, {
            severity: 'error',
            stage: 'Semantico',
            line: lineNumber,
            column: rawLine.indexOf(loopVar) + 1,
            message: `Variable "${loopVar}" no declarada.`,
            suggestion: `Declare la variable antes del ciclo: Definir ${loopVar} Como Entero.`,
            source: line,
          });
        }
        blockStack.push({ kind: 'FOR', line: lineNumber, expected: 'FinPara' });
        return;
      }

      if (/^Segun\b/.test(line)) {
        if (!regex.switchInicio.test(line)) {
          this.pushDiagnostic(diagnostics, {
            severity: 'error',
            stage: 'Sintactico',
            line: lineNumber,
            column,
            message: 'Estructura Segun invalida.',
            suggestion: 'Use: Segun opcion Hacer.',
            source: line,
          });
        }
        blockStack.push({ kind: 'SWITCH', line: lineNumber, expected: 'FinSegun' });
        return;
      }

      if (line === 'Hacer') {
        blockStack.push({ kind: 'DO_WHILE', line: lineNumber, expected: 'Mientras condicion' });
        return;
      }

      if (['FinSi', 'FinMientras', 'FinPara', 'FinSegun', 'FinFuncion', 'FinAlgoritmo'].includes(line)) {
        this.closeBlock(blockStack, line, lineNumber, column, diagnostics, line);
        if (line === 'FinFuncion') {
          currentFunctionReturn = null;
        }
        return;
      }

      if (line === 'Sino' || regex.caso.test(line) || line === 'Defecto') {
        return;
      }

      if (regex.asignacionLinea.test(line)) {
        this.validateAssignment(line, rawLine, lineNumber, declarations, functions, diagnostics);
        return;
      }

      if (regex.escribir.test(line)) {
        const expression = line.replace(/^Escribir\s+/, '').trim();
        this.inferExpressionType(expression, declarations, functions, lineNumber, diagnostics);
        return;
      }

      if (regex.retornar.test(line)) {
        const expression = line.replace(/^Retornar\s+/, '').trim();
        if (!currentFunctionReturn || currentFunctionReturn === 'Vacio') {
          this.pushDiagnostic(diagnostics, {
            severity: 'error',
            stage: 'Semantico',
            line: lineNumber,
            column,
            message: 'Retorno incorrecto.',
            suggestion: 'Use Retornar solo dentro de una funcion con tipo de retorno distinto de Vacio.',
            source: line,
          });
        } else {
          const expressionType = this.inferExpressionType(expression, declarations, functions, lineNumber, diagnostics);
          if (expressionType && !this.isAssignable(currentFunctionReturn, expressionType)) {
            this.pushDiagnostic(diagnostics, {
              severity: 'error',
              stage: 'Semantico',
              line: lineNumber,
              column,
              message: `Tipo de retorno incompatible. Se esperaba ${currentFunctionReturn} y se obtuvo ${expressionType}.`,
              suggestion: 'Devuelva una expresion compatible con el tipo declarado por la funcion.',
              source: line,
            });
          }
        }
        return;
      }

      this.pushDiagnostic(diagnostics, {
        severity: 'error',
        stage: 'Sintactico',
        line: lineNumber,
        column,
        message: `Instruccion no valida: ${line}`,
        suggestion: this.suggestInstructionFix(line) ?? 'Revise la palabra reservada o la estructura de la instruccion.',
        source: line,
      });
    });

    for (const frame of blockStack.reverse()) {
      this.pushDiagnostic(diagnostics, {
        severity: 'error',
        stage: 'Sintactico',
        line: frame.line,
        column: 1,
        message: `Falta cerrar el bloque con "${frame.expected}".`,
        suggestion: `Agregue ${frame.expected} para cerrar el bloque iniciado en esta linea.`,
        source: lines[frame.line - 1]?.trim(),
      });
    }

    return diagnostics.sort((left, right) => left.line - right.line || left.column - right.column);
  }

  private validateAssignment(
    line: string,
    rawLine: string,
    lineNumber: number,
    declarations: Map<string, { type: string; line: number; column: number }>,
    functions: Map<string, { returnType: string; line: number; column: number; params: Array<{ name: string; dataType: string }> }>,
    diagnostics: Diagnostic[],
  ): void {
    const match = line.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*<-\s*(.+)$/);
    const name = match?.[1];
    const expression = match?.[2]?.trim();

    if (!name || !expression) {
      return;
    }

    const declaration = declarations.get(name);
    if (!declaration) {
      this.pushDiagnostic(diagnostics, {
        severity: 'error',
        stage: 'Semantico',
        line: lineNumber,
        column: rawLine.indexOf(name) + 1,
        endColumn: rawLine.indexOf(name) + name.length + 1,
        message: `Variable "${name}" no declarada.`,
        suggestion: `Declare la variable antes de usarla: Definir ${name} Como Entero.`,
        source: line,
      });
      return;
    }

    const expressionType = this.inferExpressionType(expression, declarations, functions, lineNumber, diagnostics);
    if (expressionType && !this.isAssignable(declaration.type, expressionType)) {
      this.pushDiagnostic(diagnostics, {
        severity: 'error',
        stage: 'Semantico',
        line: lineNumber,
        column: rawLine.indexOf(expression) + 1,
        message: `Tipo incompatible. Se esperaba ${declaration.type} y se obtuvo ${expressionType}.`,
        suggestion: 'Cambie el valor asignado o el tipo de la variable para que coincidan.',
        source: line,
      });
    }
  }

  private inferExpressionType(
    expression: string,
    declarations: Map<string, { type: string; line: number; column: number }>,
    functions: Map<string, { returnType: string; line: number; column: number; params: Array<{ name: string; dataType: string }> }>,
    line: number,
    diagnostics: Diagnostic[],
  ): string | undefined {
    const trimmed = expression.trim();

    if (/^".*"$/.test(trimmed)) return 'Cadena';
    if (/^(Verdadero|Falso)$/.test(trimmed)) return 'Logico';
    if (/^\d+$/.test(trimmed)) return 'Entero';
    if (/^\d+\.\d+$/.test(trimmed)) return 'Real';

    const call = trimmed.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*\((.*)\)$/);
    if (call) {
      const fn = functions.get(call[1]);
      if (!fn) {
        this.pushDiagnostic(diagnostics, {
          severity: 'error',
          stage: 'Semantico',
          line,
          column: 1,
          message: `La funcion "${call[1]}" no existe.`,
          suggestion: 'Declare la funcion antes de llamarla o corrija el nombre.',
          source: trimmed,
        });
        return undefined;
      }

      const args = call[2].split(',').map((arg) => arg.trim()).filter(Boolean);
      if (args.length !== fn.params.length) {
        this.pushDiagnostic(diagnostics, {
          severity: 'error',
          stage: 'Semantico',
          line,
          column: 1,
          message: `Cantidad invalida de argumentos para "${call[1]}".`,
          suggestion: `La funcion espera ${fn.params.length} argumento(s).`,
          source: trimmed,
        });
      }
      return fn.returnType;
    }

    if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(trimmed)) {
      const declaration = declarations.get(trimmed);
      if (!declaration) {
        this.pushDiagnostic(diagnostics, {
          severity: 'error',
          stage: 'Semantico',
          line,
          column: 1,
          message: `Variable "${trimmed}" no declarada.`,
          suggestion: `Declare la variable antes de usarla: Definir ${trimmed} Como Entero.`,
          source: trimmed,
        });
        return undefined;
      }
      return declaration.type;
    }

    const arithmeticParts = trimmed
      .split(/(\+|-|\*|\/)/)
      .map((part) => part.trim())
      .filter((part) => part && !['+', '-', '*', '/'].includes(part));

    if (arithmeticParts.length > 1) {
      let result = 'Entero';
      for (const part of arithmeticParts) {
        const partType = this.inferExpressionType(part, declarations, functions, line, diagnostics);
        if (partType === 'Real') result = 'Real';
        if (partType && partType !== 'Entero' && partType !== 'Real') {
          this.pushDiagnostic(diagnostics, {
            severity: 'error',
            stage: 'Semantico',
            line,
            column: 1,
            message: `Operacion aritmetica invalida con tipo ${partType}.`,
            suggestion: 'Use solo valores Entero o Real en operaciones aritmeticas.',
            source: trimmed,
          });
        }
      }
      return result;
    }

    return undefined;
  }

  private closeBlock(
    stack: BlockFrame[],
    closer: string,
    line: number,
    column: number,
    diagnostics: Diagnostic[],
    source: string,
  ): void {
    const expectedByCloser: Record<string, BlockFrame['kind']> = {
      FinSi: 'IF',
      FinMientras: 'WHILE',
      FinPara: 'FOR',
      FinSegun: 'SWITCH',
      FinFuncion: 'FUNCTION',
      FinAlgoritmo: 'PROGRAM',
    };
    const expectedKind = expectedByCloser[closer];
    const index = [...stack].reverse().findIndex((frame) => frame.kind === expectedKind);

    if (index < 0) {
      this.pushDiagnostic(diagnostics, {
        severity: 'error',
        stage: 'Sintactico',
        line,
        column,
        message: `Cierre inesperado "${closer}".`,
        suggestion: 'Elimine este cierre o agregue antes la estructura que corresponde.',
        source,
      });
      return;
    }

    const stackIndex = stack.length - 1 - index;
    stack.splice(stackIndex, 1);
  }

  private parseFunctionHeader(line: string): { name: string; returnType: string; params: Array<{ name: string; dataType: string }> } | null {
    const match = line.match(/^Funcion\s+([a-zA-Z][a-zA-Z0-9]*)\s*\((.*)\)\s+Como\s+(Entero|Real|Cadena|Logico|Vacio)$/);
    if (!match) {
      return null;
    }

    const params = match[2]
      .split(',')
      .map((param) => param.trim())
      .filter(Boolean)
      .map((param) => {
        const paramMatch = param.match(/^([a-zA-Z][a-zA-Z0-9]*)\s+Como\s+(Entero|Real|Cadena|Logico)$/);
        return paramMatch ? { name: paramMatch[1], dataType: paramMatch[2] } : null;
      })
      .filter((param): param is { name: string; dataType: string } => Boolean(param));

    return { name: match[1], returnType: match[3], params };
  }

  private buildRecoveredAst(code: string): ASTNode | undefined {
    const lines = code.replace(/\r/g, '').split('\n');
    const header = lines.find((line) => regex.lineaPrograma.test(line.trim()));
    const name = header?.trim().match(/^Algoritmo\s+([a-zA-Z][a-zA-Z0-9]*)$/)?.[1] ?? 'Programa';

    return {
      type: 'PROGRAM',
      name,
      line: Math.max(1, lines.findIndex((line) => regex.lineaPrograma.test(line.trim())) + 1),
      children: lines
        .map((rawLine, index) => this.recoverNode(rawLine.trim(), index + 1))
        .filter((node): node is ASTNode => Boolean(node)),
    };
  }

  private recoverNode(line: string, lineNumber: number): ASTNode | null {
    if (!line || regex.lineaPrograma.test(line) || regex.finPrograma.test(line)) return null;
    const declaration = line.match(/^Definir\s+([a-zA-Z][a-zA-Z0-9]*)\s+Como\s+(Entero|Real|Cadena|Logico)$/);
    if (declaration) return { type: 'DECLARATION', name: declaration[1], dataType: declaration[2], line: lineNumber };
    const assignment = line.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*<-\s*(.+)$/);
    if (assignment) return { type: 'ASSIGNMENT', name: assignment[1], expression: assignment[2].trim(), line: lineNumber };
    const print = line.match(/^Escribir\s+(.+)$/);
    if (print) return { type: 'PRINT', expression: print[1].trim(), line: lineNumber };
    const functionInfo = this.parseFunctionHeader(line);
    if (functionInfo) return { type: 'FUNCTION', name: functionInfo.name, params: functionInfo.params, returnType: functionInfo.returnType, line: lineNumber, children: [] };
    return { type: 'UNKNOWN', expression: line, line: lineNumber };
  }

  private buildSymbolTableFromSource(code: string): SymbolTableEntry[] {
    const rows: SymbolTableEntry[] = [];
    const lines = code.replace(/\r/g, '').split('\n');
    const headerIndex = lines.findIndex((line) => regex.lineaPrograma.test(line.trim()));
    const programName = headerIndex >= 0
      ? lines[headerIndex].trim().match(/^Algoritmo\s+([a-zA-Z][a-zA-Z0-9]*)$/)?.[1]
      : 'Programa';

    rows.push({
      nombre: programName ?? 'Programa',
      categoria: 'programa',
      tipo: 'Algoritmo',
      ambito: 'global',
      linea: headerIndex >= 0 ? headerIndex + 1 : 1,
    });

    let scope = programName ?? 'global';
    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      const declaration = line.match(/^Definir\s+([a-zA-Z][a-zA-Z0-9]*)\s+Como\s+(Entero|Real|Cadena|Logico)$/);
      if (declaration) {
        rows.push({ nombre: declaration[1], categoria: 'variable', tipo: declaration[2], ambito: scope, linea: index + 1 });
      }

      const functionInfo = this.parseFunctionHeader(line);
      if (functionInfo) {
        scope = functionInfo.name;
        rows.push({ nombre: functionInfo.name, categoria: 'funcion', tipo: functionInfo.returnType, ambito: 'global', linea: index + 1 });
        for (const param of functionInfo.params) {
          rows.push({ nombre: param.name, categoria: 'parametro', tipo: param.dataType, ambito: functionInfo.name, linea: index + 1 });
        }
      }

      if (line === 'FinFuncion') {
        scope = programName ?? 'global';
      }
    });

    return rows;
  }

  private errorToDiagnostic(message: string, stage: CompileStage, code: string): Diagnostic {
    const line = this.extractErrorLine(message) ?? 1;
    const source = code.replace(/\r/g, '').split('\n')[line - 1]?.trim();
    return {
      severity: 'error',
      stage,
      line,
      column: 1,
      message,
      suggestion: this.buildSuggestion(message, stage),
      source,
    };
  }

  private mergeDiagnostics(diagnostics: Diagnostic[], fallback: Diagnostic): Diagnostic[] {
    const exists = diagnostics.some((diagnostic) =>
      diagnostic.line === fallback.line &&
      (diagnostic.stage === fallback.stage || diagnostic.message === fallback.message),
    );

    return exists ? diagnostics : [...diagnostics, fallback];
  }

  private pushDiagnostic(diagnostics: Diagnostic[], diagnostic: Diagnostic): void {
    const exists = diagnostics.some((item) =>
      item.line === diagnostic.line &&
      item.column === diagnostic.column &&
      item.message === diagnostic.message,
    );

    if (!exists) {
      diagnostics.push(diagnostic);
    }
  }

  private isAssignable(expectedType: string, expressionType: string): boolean {
    return expectedType === expressionType || (expectedType === 'Real' && expressionType === 'Entero');
  }

  private buildSymbolTable(ast: ReturnType<ParserService['parse']>): SymbolTableEntry[] {
    const rows: SymbolTableEntry[] = [];

    rows.push({
      nombre: ast.name ?? 'Programa',
      categoria: 'programa',
      tipo: 'Algoritmo',
      ambito: 'global',
      linea: ast.line,
    });

    this.collectSymbols(ast.children || [], ast.name ?? 'global', rows);
    return rows;
  }

  private collectSymbols(nodes: NonNullable<ReturnType<ParserService['parse']>['children']>, scope: string, rows: SymbolTableEntry[]): void {
    for (const node of nodes) {
      if (node.type === 'DECLARATION' && node.name && node.dataType) {
        rows.push({
          nombre: node.name,
          categoria: 'variable',
          tipo: node.dataType,
          ambito: scope,
          linea: node.line,
        });
      }

      if (node.type === 'FUNCTION' && node.name) {
        rows.push({
          nombre: node.name,
          categoria: 'funcion',
          tipo: node.returnType ?? 'Vacio',
          ambito: 'global',
          linea: node.line,
        });

        for (const param of node.params || []) {
          rows.push({
            nombre: param.name,
            categoria: 'parametro',
            tipo: param.dataType,
            ambito: node.name,
            linea: node.line,
          });
        }
      }

      const childScope = node.type === 'FUNCTION' && node.name ? node.name : scope;
      this.collectSymbols(node.children || [], childScope, rows);
      this.collectSymbols(node.elseBranch || [], childScope, rows);
      this.collectSymbols(node.cases || [], childScope, rows);

      if (node.defaultCase) {
        this.collectSymbols([node.defaultCase], childScope, rows);
      }
    }
  }

  private extractErrorLine(message: string): number | undefined {
    const match = message.match(/(?:linea|Linea)\s+(\d+)/);
    return match ? Number(match[1]) : undefined;
  }

  private buildSuggestion(message: string, stage: CompileStage): string {
    const invalidInstruction = this.extractInvalidInstruction(message);
    if (invalidInstruction) {
      const instructionSuggestion = this.suggestInstructionFix(invalidInstruction);
      if (instructionSuggestion) {
        return instructionSuggestion;
      }
    }

    if (message.includes('FinAlgoritmo')) {
      return 'Verifica que el programa termine con FinAlgoritmo y que no haya codigo despues.';
    }

    if (message.includes('FinSi')) {
      return 'Agrega FinSi para cerrar el bloque Si.';
    }

    if (message.includes('FinMientras')) {
      return 'Agrega FinMientras para cerrar el ciclo Mientras.';
    }

    if (message.includes('FinPara')) {
      return 'Agrega FinPara para cerrar el ciclo Para.';
    }

    if (message.includes('FinSegun')) {
      return 'Agrega FinSegun para cerrar la estructura Segun.';
    }

    if (message.includes('FinFuncion')) {
      return 'Agrega FinFuncion para cerrar la funcion.';
    }

    if (message.includes('Declaracion')) {
      return 'Usa el formato: Definir nombre Como Tipo.';
    }

    if (message.includes('Asignacion')) {
      return 'Usa el operador de asignacion <-. Ejemplo: x <- 10.';
    }

    if (message.includes('Escribir')) {
      return 'La instruccion de salida debe ser: Escribir expresion. Ejemplo: Escribir x.';
    }

    if (message.includes('Estructura Para')) {
      return 'El ciclo Para debe escribirse asi: Para i <- inicio Hasta fin Hacer.';
    }

    if (message.includes('Estructura Segun')) {
      return 'La estructura Segun debe escribirse asi: Segun opcion Hacer.';
    }

    if (message.includes('Declaracion de funcion')) {
      return 'La funcion debe escribirse asi: Funcion Nombre(param Como Tipo) Como Tipo.';
    }

    if (message.includes('Parametro invalido')) {
      return 'Cada parametro debe escribirse como: nombre Como Tipo. Ejemplo: edad Como Entero.';
    }

    if (message.includes('Retornar')) {
      return 'El retorno debe escribirse asi: Retornar expresion.';
    }

    if (message.includes('Condicion')) {
      return 'Usa una condicion con dos operandos y un operador relacional, por ejemplo: x >= 10.';
    }

    if (message.includes('Variable') && message.includes('no declarada')) {
      const variable = message.match(/Variable\s+([A-Za-z][A-Za-z0-9]*)/)?.[1];
      return variable
        ? `La variable ${variable} no esta declarada. Agrega antes una linea como: Definir ${variable} Como Entero.`
        : 'Declara la variable antes de usarla con: Definir nombre Como Tipo.';
    }

    if (message.includes('Variable') && message.includes('ya declarada')) {
      const variable = message.match(/Variable\s+([A-Za-z][A-Za-z0-9]*)/)?.[1];
      return variable
        ? `La variable ${variable} ya fue declarada antes. Cambia el nombre de esta declaracion o elimina la linea duplicada.`
        : 'Esta variable ya fue declarada antes. Cambia el nombre o elimina la declaracion duplicada.';
    }

    if (message.includes('Tipo incompatible')) {
      return 'Revisa que el valor asignado coincida con el tipo declarado.';
    }

    if (message.includes('Tipos incompatibles en la condicion')) {
      return 'Los dos lados de la condicion deben ser comparables. Ejemplo valido: edad >= 18.';
    }

    if (message.includes('Cantidad invalida de argumentos')) {
      return 'Revisa que la llamada tenga la misma cantidad de argumentos que la funcion declara.';
    }

    if (message.includes('La funcion') && message.includes('no existe')) {
      return 'Declara la funcion antes de llamarla o corrige el nombre de la llamada.';
    }

    if (message.includes('No se puede retornar')) {
      return 'Usa Retornar solo dentro de una funcion que tenga tipo de retorno distinto de Vacio.';
    }

    return `Revisa la estructura reportada por el analizador ${stage.toLowerCase()}.`;
  }

  private extractInvalidInstruction(message: string): string | undefined {
    const match = message.match(/Instruccion no valida en la linea \d+:\s*(.+)$/);
    return match?.[1]?.trim();
  }

  private suggestInstructionFix(instruction: string): string | undefined {
    const firstWord = instruction.split(/\s+/)[0]?.toLowerCase() ?? '';
    const displayWord = instruction.split(/\s+/)[0] ?? instruction;
    const closestKeyword = this.findClosestKeyword(firstWord);

    if (/^[A-Za-z][A-Za-z0-9]*\s*=/.test(instruction)) {
      return 'En NEBULA la asignacion usa <-, no =. Ejemplo: x <- 10.';
    }

    if (/^[A-Za-z][A-Za-z0-9]*\s+<-/.test(instruction)) {
      return 'Antes de <- debe ir solo el nombre de la variable. Ejemplo correcto: x <- 10.';
    }

    if (firstWord.startsWith('algoritm')) {
      return 'El encabezado correcto es: Algoritmo NombreDelPrograma.';
    }

    if (firstWord.startsWith('finalgoritm')) {
      return 'El cierre correcto del programa es exactamente: FinAlgoritmo.';
    }

    if (firstWord.startsWith('finsi')) {
      return 'FinSi solo se usa para cerrar un bloque iniciado con: Si condicion Entonces.';
    }

    if (firstWord.startsWith('finmientras')) {
      return 'FinMientras solo se usa para cerrar un ciclo iniciado con: Mientras condicion Hacer.';
    }

    if (firstWord.startsWith('finpara')) {
      return 'FinPara solo se usa para cerrar un ciclo iniciado con: Para i <- inicio Hasta fin Hacer.';
    }

    if (firstWord.startsWith('finsegun')) {
      return 'FinSegun solo se usa para cerrar una estructura iniciada con: Segun expresion Hacer.';
    }

    if (firstWord.startsWith('finfuncion')) {
      return 'FinFuncion solo se usa para cerrar una funcion iniciada con: Funcion Nombre(...) Como Tipo.';
    }

    if (closestKeyword) {
      if (closestKeyword === 'FinMientras') {
        return `No se reconoce "${displayWord}". Si querias cerrar un ciclo Mientras, escribe exactamente FinMientras. Si estas usando Hacer, no lleva FinMientras: termina con una linea como Mientras intentos <= 3.`;
      }

      return `No se reconoce "${displayWord}". Quiza quisiste escribir ${closestKeyword}. Revisa la palabra reservada y escribela exactamente igual.`;
    }

    if (/^[A-Za-z][A-Za-z0-9]*$/.test(instruction)) {
      return `La linea "${instruction}" no es una instruccion completa. Si quieres asignar, usa: ${instruction} <- valor.`;
    }

    if (firstWord.startsWith('defin')) {
      return 'La declaracion correcta es: Definir variable Como Tipo.';
    }

    if (firstWord.startsWith('escri')) {
      return 'La instruccion para imprimir es: Escribir expresion. Ejemplo: Escribir x.';
    }

    if (firstWord === 'si') {
      return 'La condicion correcta es: Si x >= 10 Entonces.';
    }

    if (firstWord.startsWith('mient')) {
      return 'El ciclo correcto es: Mientras x < 10 Hacer.';
    }

    if (firstWord === 'para') {
      return 'El ciclo Para correcto es: Para i <- 1 Hasta 10 Hacer.';
    }

    if (firstWord.startsWith('seg')) {
      return 'La estructura correcta es: Segun opcion Hacer.';
    }

    if (firstWord.startsWith('func')) {
      return 'La funcion correcta es: Funcion Nombre(param Como Tipo) Como Tipo.';
    }

    if (firstWord.startsWith('ret')) {
      return 'El retorno correcto es: Retornar expresion.';
    }

    return `No se reconoce la instruccion "${displayWord}". Revisa si la palabra reservada esta mal escrita o usa una regla valida como Definir, Escribir, Si, Mientras, Para, Segun, Funcion o Retornar.`;
  }

  private findClosestKeyword(word: string): string | undefined {
    if (!word) {
      return undefined;
    }

    const keywords = [
      'Algoritmo',
      'FinAlgoritmo',
      'Definir',
      'Escribir',
      'Si',
      'Sino',
      'FinSi',
      'Mientras',
      'FinMientras',
      'Hacer',
      'Para',
      'FinPara',
      'Segun',
      'Caso',
      'Defecto',
      'FinSegun',
      'Funcion',
      'FinFuncion',
      'Retornar',
    ];

    let best: { keyword: string; distance: number } | undefined;
    for (const keyword of keywords) {
      const distance = this.levenshtein(word, keyword.toLowerCase());
      if (!best || distance < best.distance) {
        best = { keyword, distance };
      }
    }

    return best && best.distance <= 3 ? best.keyword : undefined;
  }

  private levenshtein(left: string, right: string): number {
    const dp = Array.from({ length: left.length + 1 }, () =>
      Array(right.length + 1).fill(0),
    );

    for (let i = 0; i <= left.length; i++) {
      dp[i][0] = i;
    }

    for (let j = 0; j <= right.length; j++) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= left.length; i++) {
      for (let j = 1; j <= right.length; j++) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }

    return dp[left.length][right.length];
  }

  async runJava(java: string): Promise<RunJavaResult> {
    const source = java.trim();

    if (!source) {
      return {
        ok: false,
        status: 'Sin codigo Java',
        error: 'No se recibio codigo Java para ejecutar.',
      };
    }

    const className = this.extractClassName(source);
    if (!className) {
      return {
        ok: false,
        status: 'Clase invalida',
        error: 'El Java generado debe incluir una linea como: public class NombreClase',
      };
    }

    const javacCommand = await this.resolveJavaCommand('javac');
    if (!javacCommand) {
      return {
        ok: false,
        status: 'Falta el compilador de Java',
        error:
          'El backend encontro Java instalado, pero no encontro javac. Instala un JDK o configura JAVA_HOME apuntando a tu carpeta jdk para poder compilar y ejecutar el codigo.',
      };
    }

    const javaCommand = await this.resolveJavaCommand('java');
    if (!javaCommand) {
      return {
        ok: false,
        status: 'Falta el ejecutor de Java',
        error: 'No se encontro el comando java ni en JAVA_HOME ni en el PATH del backend.',
      };
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'nebula-java-'));
    const sourcePath = join(tempDir, `${className}.java`);

    try {
      await writeFile(sourcePath, source, 'utf8');

      try {
        await execFileAsync(javacCommand, [sourcePath], {
          cwd: tempDir,
          timeout: 10000,
        });
      } catch (error) {
        return {
          ok: false,
          status: 'Error de compilacion Java',
          error: this.formatExecutionError(error, 'javac no pudo compilar el archivo.'),
        };
      }

      try {
        const { stdout, stderr } = await execFileAsync(javaCommand, ['-cp', tempDir, className], {
          cwd: tempDir,
          timeout: 10000,
        });

        const output = [stdout, stderr].filter(Boolean).join('\n').trim();
        return {
          ok: true,
          status: 'Programa ejecutado correctamente.',
          output,
        };
      } catch (error) {
        return {
          ok: false,
          status: 'Error en tiempo de ejecucion',
          error: this.formatExecutionError(error, 'java no pudo ejecutar la clase compilada.'),
        };
      }
    } catch (error) {
      return {
        ok: false,
        status: 'Error preparando la ejecucion',
        error: error instanceof Error ? error.message : 'No se pudo preparar el archivo Java temporal.',
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private extractClassName(java: string): string | null {
    return java.match(/public\s+class\s+([A-Za-z][A-Za-z0-9_]*)/)?.[1] ?? null;
  }

  private async resolveJavaCommand(command: 'java' | 'javac'): Promise<string | null> {
    const extension = process.platform === 'win32' ? '.exe' : '';
    const javaHome = process.env.JAVA_HOME?.trim();

    if (javaHome) {
      const candidate = join(javaHome, 'bin', `${command}${extension}`);
      if (await this.fileExists(candidate)) {
        return candidate;
      }
    }

    return (await this.commandExists(command)) ? command : null;
  }

  private async commandExists(command: string): Promise<boolean> {
    const locator = process.platform === 'win32' ? 'where' : 'which';

    try {
      await execFileAsync(locator, [command], { timeout: 4000 });
      return true;
    } catch {
      return false;
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private formatExecutionError(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null) {
      const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : '';
      const stdout = 'stdout' in error && typeof error.stdout === 'string' ? error.stdout.trim() : '';
      const message = 'message' in error && typeof error.message === 'string' ? error.message.trim() : '';
      return stderr || stdout || message || fallback;
    }

    return fallback;
  }
}
