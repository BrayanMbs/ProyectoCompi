import { ASTNode } from '../parser/ast';

export class TranslatorService {
  traducir(ast: ASTNode): string {
    if (ast.type !== 'PROGRAM') {
      throw new Error('El AST debe iniciar con un nodo PROGRAM');
    }

    const className = ast.name ?? 'Main';
    const functions = (ast.children || []).filter((node) => node.type === 'FUNCTION');
    const mainStatements = (ast.children || []).filter((node) => node.type !== 'FUNCTION');

    const javaFunctions = functions.map((node) => this.translateFunction(node)).join('\n\n');
    const javaMain = this.translateBlock(mainStatements, 2);

    return `public class ${className} {\n${javaFunctions ? `${javaFunctions}\n\n` : ''}  public static void main(String[] args) {\n${javaMain}  }\n}`;
  }

  private translateFunction(node: ASTNode): string {
    const name = this.requireValue(node.name, `Funcion sin nombre en la linea ${node.line}`);
    const returnType = this.mapType(node.returnType ?? 'Vacio');
    const params = (node.params || [])
      .map((param) => `${this.mapType(param.dataType)} ${param.name}`)
      .join(', ');
    const body = this.translateBlock(node.children || [], 2);

    return `  public static ${returnType} ${name}(${params}) {\n${body}  }`;
  }

  private translateBlock(nodes: ASTNode[], indentLevel: number): string {
    return nodes.map((node) => this.translateNode(node, indentLevel)).join('');
  }

  private translateNode(node: ASTNode, indentLevel: number): string {
    const indent = '  '.repeat(indentLevel);

    switch (node.type) {
      case 'DECLARATION':
        return `${indent}${this.mapType(this.requireValue(node.dataType, 'Tipo faltante'))} ${this.requireValue(node.name, 'Variable faltante')};\n`;
      case 'ASSIGNMENT':
        return `${indent}${this.requireValue(node.name, 'Variable faltante')} = ${this.translateExpression(this.requireValue(node.expression, 'Expresion faltante'))};\n`;
      case 'PRINT':
        return `${indent}System.out.println(${this.translateExpression(this.requireValue(node.expression, 'Expresion faltante'))});\n`;
      case 'IF':
        return this.translateIf(node, indentLevel);
      case 'WHILE':
        return `${indent}while (${this.translateCondition(node)}) {\n${this.translateBlock(node.children || [], indentLevel + 1)}${indent}}\n`;
      case 'DO_WHILE':
        return `${indent}do {\n${this.translateBlock(node.children || [], indentLevel + 1)}${indent}} while (${this.translateCondition(node)});\n`;
      case 'FOR': {
        const variable = this.requireValue(node.name, 'Variable faltante en Para');
        const start = this.translateExpression(this.requireValue(node.value, 'Inicio faltante en Para'));
        const end = this.translateExpression(this.requireValue(node.expression, 'Fin faltante en Para'));
        return `${indent}for (${variable} = ${start}; ${variable} <= ${end}; ${variable}++) {\n${this.translateBlock(node.children || [], indentLevel + 1)}${indent}}\n`;
      }
      case 'SWITCH':
        return this.translateSwitch(node, indentLevel);
      case 'RETURN':
        return `${indent}return ${this.translateExpression(this.requireValue(node.expression, 'Expresion faltante'))};\n`;
      case 'FUNCTION':
        return '';
      default:
        throw new Error(`Nodo no soportado en traduccion: ${node.type}`);
    }
  }

  private translateIf(node: ASTNode, indentLevel: number): string {
    const indent = '  '.repeat(indentLevel);
    const thenBranch = this.translateBlock(node.children || [], indentLevel + 1);
    const elseBranch = node.elseBranch?.length
      ? `${indent} else {\n${this.translateBlock(node.elseBranch, indentLevel + 1)}${indent}}`
      : '';

    return `${indent}if (${this.translateCondition(node)}) {\n${thenBranch}${indent}}${elseBranch}\n`;
  }

  private translateSwitch(node: ASTNode, indentLevel: number): string {
    const indent = '  '.repeat(indentLevel);
    const cases = (node.cases || [])
      .map((caseNode) => {
        const caseIndent = '  '.repeat(indentLevel + 1);
        return `${caseIndent}case ${this.translateExpression(this.requireValue(caseNode.expression, 'Caso faltante'))}:\n${this.translateBlock(caseNode.children || [], indentLevel + 2)}${caseIndent}  break;\n`;
      })
      .join('');

    const defaultCase = node.defaultCase
      ? `${'  '.repeat(indentLevel + 1)}default:\n${this.translateBlock(node.defaultCase.children || [], indentLevel + 2)}${'  '.repeat(indentLevel + 1)}  break;\n`
      : '';

    return `${indent}switch (${this.translateExpression(this.requireValue(node.expression, 'Expresion faltante en Segun'))}) {\n${cases}${defaultCase}${indent}}\n`;
  }

  private translateCondition(node: ASTNode): string {
    const condition = node.condition;
    if (!condition) {
      throw new Error(`Condicion faltante en la linea ${node.line}`);
    }

    return `${this.translateExpression(condition.left)} ${condition.operator} ${this.translateExpression(condition.right)}`;
  }

  private translateExpression(expression: string): string {
    return expression.replace(/\bVerdadero\b/g, 'true').replace(/\bFalso\b/g, 'false');
  }

  private mapType(type: string): string {
    switch (type) {
      case 'Entero':
        return 'int';
      case 'Real':
        return 'double';
      case 'Cadena':
        return 'String';
      case 'Logico':
        return 'boolean';
      case 'Vacio':
        return 'void';
      default:
        throw new Error(`Tipo no soportado: ${type}`);
    }
  }

  private requireValue(value: string | undefined, message: string): string {
    if (!value) {
      throw new Error(message);
    }

    return value;
  }
}
