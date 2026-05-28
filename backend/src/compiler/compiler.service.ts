import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { LexerService } from '../lexer/lexer.service';
import { ParserService } from '../parser/parser.service';
import { SemanticService } from '../semantic/semantic.service';
import { TranslatorService } from '../translator/translator.service';

const execFileAsync = promisify(execFile);

export interface CompileResult {
  ok: boolean;
  tokens?: ReturnType<LexerService['analizar']>;
  ast?: ReturnType<ParserService['parse']>;
  symbolTable?: SymbolTableEntry[];
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

    try {
      const tokens = this.lexer.analizar(code);
      stage = 'Sintactico';
      const ast = this.parser.parse(tokens);
      const symbolTable = this.buildSymbolTable(ast);
      stage = 'Semantico';
      this.semantic.analyze(ast);
      stage = 'Traduccion';
      const java = this.translator.traducir(ast);

      return {
        ok: true,
        tokens,
        ast,
        symbolTable,
        java,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';

      return {
        ok: false,
        error: message,
        errorLine: this.extractErrorLine(message),
        errorType: stage,
        suggestion: this.buildSuggestion(message, stage),
      };
    }
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
