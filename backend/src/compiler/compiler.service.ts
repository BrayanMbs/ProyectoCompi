import { Injectable } from '@nestjs/common';
import { LexerService } from '../lexer/lexer.service';
import { ParserService } from '../parser/parser.service';
import { SemanticService } from '../semantic/semantic.service';
import { TranslatorService } from '../translator/translator.service';

export interface CompileResult {
  ok: boolean;
  tokens?: ReturnType<LexerService['analizar']>;
  ast?: ReturnType<ParserService['parse']>;
  java?: string;
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
}
