import { Token } from '../lexer/token.interface';
import { regex } from '../lexer/regex';
import { TokenType } from '../lexer/tokens';
import { ASTNode } from './ast';

interface LineInfo {
  text: string;
  line: number;
}

export class ParserService {
  private lines: LineInfo[] = [];
  private index = 0;

  parse(tokens: Token[]): ASTNode {
    this.lines = this.groupLines(tokens);
    this.index = 0;

    if (this.lines.length === 0) {
      throw new Error('Programa vacio');
    }

    const header = this.lines[this.index];
    const programMatch = header.text.match(
      /^Algoritmo\s+([a-zA-Z][a-zA-Z0-9]*)$/,
    );

    if (!programMatch) {
      throw new Error(
        `Se esperaba "Algoritmo Nombre" en la linea ${header.line}`,
      );
    }

    const root: ASTNode = {
      type: 'PROGRAM',
      name: programMatch[1],
      line: header.line,
      children: [],
    };

    this.index++;
    root.children = this.parseBlock(['FinAlgoritmo']);

    const endLine = this.currentLine();
    if (!endLine || endLine.text !== 'FinAlgoritmo') {
      throw new Error('Falta FinAlgoritmo');
    }

    this.index++;

    if (this.index < this.lines.length) {
      const extra = this.lines[this.index];
      throw new Error(
        `No puede haber codigo fuera del programa. Linea ${extra.line}`,
      );
    }

    return root;
  }

  private groupLines(tokens: Token[]): LineInfo[] {
    const lines = new Map<number, string[]>();

    for (const token of tokens) {
      if (token.type === TokenType.NUEVA_LINEA) {
        continue;
      }

      const parts = lines.get(token.line) ?? [];
      parts.push(token.value);
      lines.set(token.line, parts);
    }

    return [...lines.entries()]
      .map(([line, parts]) => ({
        line,
        text: parts.join(' ').trim(),
      }))
      .filter((line) => line.text.length > 0);
  }

  private parseBlock(stopWords: string[]): ASTNode[] {
    const nodes: ASTNode[] = [];

    while (this.index < this.lines.length) {
      const line = this.currentLine();

      if (!line) {
        break;
      }

      if (stopWords.includes(line.text)) {
        break;
      }

      if (line.text === 'Sino' && stopWords.includes('Sino')) {
        break;
      }

      if (
        regex.finSi.test(line.text) ||
        regex.finMientras.test(line.text) ||
        regex.finPara.test(line.text)
      ) {
        throw new Error(`Cierre inesperado en la linea ${line.line}`);
      }

      nodes.push(this.parseStatement());
    }

    return nodes;
  }

  private parseStatement(): ASTNode {
    const line = this.currentLine();

    if (!line) {
      throw new Error('Fin inesperado del archivo');
    }

    if (regex.declaracion.test(line.text)) {
      return this.parseDeclaration(line);
    }

    if (regex.asignacionLinea.test(line.text)) {
      return this.parseAssignment(line);
    }

    if (regex.escribir.test(line.text)) {
      return this.parsePrint(line);
    }

    if (regex.si.test(line.text)) {
      return this.parseIf(line);
    }

    if (regex.mientras.test(line.text)) {
      return this.parseWhile(line);
    }

    if (regex.para.test(line.text)) {
      return this.parseFor(line);
    }

    if (regex.hacer.test(line.text)) {
      return this.parseDoWhile(line);
    }

    if (regex.switchInicio.test(line.text)) {
      return this.parseSwitch(line);
    }

    if (regex.funcion.test(line.text)) {
      return this.parseFunction(line);
    }

    if (regex.retornar.test(line.text)) {
      return this.parseReturn(line);
    }

    throw new Error(
      `Instruccion no valida en la linea ${line.line}: ${line.text}`,
    );
  }

  private parseDeclaration(line: LineInfo): ASTNode {
    const match = line.text.match(
      /^Definir\s+([a-zA-Z][a-zA-Z0-9]*)\s+Como\s+(Entero|Real|Cadena|Logico)$/,
    );
    if (!match) {
      throw new Error(`Declaracion invalida en la linea ${line.line}`);
    }

    this.index++;
    return {
      type: 'DECLARATION',
      name: match[1],
      dataType: match[2],
      line: line.line,
    };
  }

  private parseAssignment(line: LineInfo): ASTNode {
    const match = line.text.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*<-\s*(.+)$/);
    if (!match) {
      throw new Error(`Asignacion invalida en la linea ${line.line}`);
    }

    this.index++;
    return {
      type: 'ASSIGNMENT',
      name: match[1],
      expression: match[2].trim(),
      line: line.line,
    };
  }

  private parsePrint(line: LineInfo): ASTNode {
    const match = line.text.match(/^Escribir\s+(.+)$/);
    if (!match) {
      throw new Error(`Instruccion Escribir invalida en la linea ${line.line}`);
    }

    this.index++;
    return {
      type: 'PRINT',
      expression: match[1].trim(),
      line: line.line,
    };
  }

  private parseIf(line: LineInfo): ASTNode {
    const condition = this.parseConditionHeader(line, /^Si\s+(.+)\s+Entonces$/);
    this.index++;

    const thenBranch = this.parseBlock(['Sino', 'FinSi']);
    let elseBranch: ASTNode[] | undefined;
    const current = this.currentLine();

    if (current?.text === 'Sino') {
      this.index++;
      elseBranch = this.parseBlock(['FinSi']);
    }

    const end = this.currentLine();
    if (!end || end.text !== 'FinSi') {
      throw new Error(
        `Falta FinSi para el bloque iniciado en la linea ${line.line},`,
      );
    }

    this.index++;

    return {
      type: 'IF',
      condition,
      children: thenBranch,
      elseBranch,
      line: line.line,
    };
  }

  private parseWhile(line: LineInfo): ASTNode {
    const condition = this.parseConditionHeader(
      line,
      /^Mientras\s+(.+)\s+Hacer$/,
    );
    this.index++;
    const children = this.parseBlock(['FinMientras']);
    const end = this.currentLine();

    if (!end || end.text !== 'FinMientras') {
      throw new Error(
        `Falta FinMientras para el bloque iniciado en la linea ${line.line}`,
      );
    }

    this.index++;

    return {
      type: 'WHILE',
      condition,
      children,
      line: line.line,
    };
  }

  private parseFor(line: LineInfo): ASTNode {
    const match = line.text.match(
      /^Para\s+([a-zA-Z][a-zA-Z0-9]*)\s*<-\s*(.+)\s+Hasta\s+(.+)\s+Hacer$/,
    );
    if (!match) {
      throw new Error(`Estructura Para invalida en la linea ${line.line}`);
    }

    this.index++;
    const children = this.parseBlock(['FinPara']);
    const end = this.currentLine();

    if (!end || end.text !== 'FinPara') {
      throw new Error(
        `Falta FinPara para el bloque iniciado en la linea ${line.line}`,
      );
    }

    this.index++;

    return {
      type: 'FOR',
      name: match[1],
      value: match[2].trim(),
      expression: match[3].trim(),
      children,
      line: line.line,
    };
  }

  private parseDoWhile(line: LineInfo): ASTNode {
    this.index++;
    const children = this.parseBlock(['Mientras']);
    const whileLine = this.currentLine();

    if (!whileLine) {
      throw new Error(
        `Falta la condicion de Mientras para el bloque Hacer iniciado en la linea ${line.line}`,
      );
    }

    const condition = this.parseConditionHeader(whileLine, /^Mientras\s+(.+)$/);
    this.index++;

    if (children.length === 0) {
      throw new Error(
        `El bloque Hacer de la linea ${line.line} debe tener al menos una instruccion`,
      );
    }

    return {
      type: 'DO_WHILE',
      condition,
      children,
      line: line.line,
    };
  }

  private parseSwitch(line: LineInfo): ASTNode {
    const match = line.text.match(/^Segun\s+(.+)\s+Hacer$/);
    if (!match) {
      throw new Error(`Estructura Segun invalida en la linea ${line.line}`);
    }

    this.index++;
    const cases: ASTNode[] = [];
    let defaultCase: ASTNode | undefined;

    while (this.index < this.lines.length) {
      const current = this.currentLine();
      if (!current) {
        break;
      }

      if (current.text === 'FinSegun') {
        break;
      }

      const caseMatch = current.text.match(/^Caso\s+(.+)$/);
      if (caseMatch) {
        this.index++;
        const body = this.parseBlock(['Caso', 'Defecto', 'FinSegun']);
        cases.push({
          type: 'CASE',
          expression: caseMatch[1].trim(),
          children: body,
          line: current.line,
        });
        continue;
      }

      if (current.text === 'Defecto') {
        this.index++;
        const body = this.parseBlock(['FinSegun']);
        defaultCase = {
          type: 'DEFAULT',
          children: body,
          line: current.line,
        };
        continue;
      }

      throw new Error(
        `Se esperaba Caso, Defecto o FinSegun en la linea ${current.line}`,
      );
    }

    const end = this.currentLine();
    if (!end || end.text !== 'FinSegun') {
      throw new Error(
        `Falta FinSegun para el bloque iniciado en la linea ${line.line}`,
      );
    }

    this.index++;

    return {
      type: 'SWITCH',
      expression: match[1].trim(),
      cases,
      defaultCase,
      line: line.line,
    };
  }

  private parseFunction(line: LineInfo): ASTNode {
    const match = line.text.match(
      /^Funcion\s+([a-zA-Z][a-zA-Z0-9]*)\s*\((.*)\)\s+Como\s+(Entero|Real|Cadena|Logico|Vacio)$/,
    );

    if (!match) {
      throw new Error(
        `Declaracion de funcion invalida en la linea ${line.line}`,
      );
    }

    const params = match[2]
      .split(',')
      .map((param) => param.trim())
      .filter((param) => param.length > 0)
      .map((param) => {
        const paramMatch = param.match(
          /^([a-zA-Z][a-zA-Z0-9]*)\s+Como\s+(Entero|Real|Cadena|Logico)$/,
        );
        if (!paramMatch) {
          throw new Error(
            `Parametro invalido "${param}" en la linea ${line.line}`,
          );
        }

        return {
          name: paramMatch[1],
          dataType: paramMatch[2],
        };
      });

    this.index++;
    const children = this.parseBlock(['FinFuncion']);
    const end = this.currentLine();

    if (!end || end.text !== 'FinFuncion') {
      throw new Error(
        `Falta FinFuncion para la funcion iniciada en la linea ${line.line}`,
      );
    }

    this.index++;

    return {
      type: 'FUNCTION',
      name: match[1],
      params,
      returnType: match[3],
      children,
      line: line.line,
    };
  }

  private parseReturn(line: LineInfo): ASTNode {
    const match = line.text.match(/^Retornar\s+(.+)$/);
    if (!match) {
      throw new Error(`Retornar invalido en la linea ${line.line}`);
    }

    this.index++;
    return {
      type: 'RETURN',
      expression: match[1].trim(),
      line: line.line,
    };
  }

  private parseConditionHeader(line: LineInfo, wrapper: RegExp) {
    const headerMatch = line.text.match(wrapper);
    const rawCondition = headerMatch?.[1]?.trim();

    if (!rawCondition) {
      throw new Error(`Condicion invalida en la linea ${line.line}`);
    }

    const conditionMatch = rawCondition.match(
      /^([a-zA-Z][a-zA-Z0-9]*|\d+(\.\d+)?|Verdadero|Falso|".+?")\s*(==|!=|<=|>=|<|>)\s*([a-zA-Z][a-zA-Z0-9]*|\d+(\.\d+)?|Verdadero|Falso|".+?")$/,
    );

    if (!conditionMatch) {
      throw new Error(
        `Condicion invalida en la linea ${line.line}: ${rawCondition}`,
      );
    }

    return {
      left: conditionMatch[1],
      operator: conditionMatch[3],
      right: conditionMatch[4],
    };
  }

  private currentLine(): LineInfo | undefined {
    return this.lines[this.index];
  }
}
