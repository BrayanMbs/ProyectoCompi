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
  java?: string;
  error?: string;
}

export interface RunJavaResult {
  ok: boolean;
  status: string;
  output?: string;
  error?: string;
}

@Injectable()
export class CompilerService {
  private readonly lexer = new LexerService();
  private readonly parser = new ParserService();
  private readonly semantic = new SemanticService();
  private readonly translator = new TranslatorService();

  compile(code: string): CompileResult {
    try {
      const tokens = this.lexer.analizar(code);
      const ast = this.parser.parse(tokens);
      this.semantic.analyze(ast);
      const java = this.translator.traducir(ast);

      return {
        ok: true,
        tokens,
        ast,
        java,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
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
