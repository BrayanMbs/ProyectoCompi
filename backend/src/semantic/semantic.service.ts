import { ASTNode } from '../parser/ast';

type NebulaType = 'Entero' | 'Real' | 'Cadena' | 'Logico' | 'Vacio';

interface Scope {
  variables: Map<string, NebulaType>;
}

interface FunctionInfo {
  returnType: NebulaType;
  params: Array<{ name: string; dataType: NebulaType }>;
}

export class SemanticService {
  analyze(ast: ASTNode): void {
    if (ast.type !== 'PROGRAM') {
      throw new Error('El AST debe iniciar con un nodo PROGRAM');
    }

    const functions = this.collectFunctions(ast.children || []);
    const globalScope: Scope = { variables: new Map() };
    this.analyzeBlock(ast.children || [], [globalScope], functions, 'Vacio');
  }

  private collectFunctions(nodes: ASTNode[]): Map<string, FunctionInfo> {
    const functions = new Map<string, FunctionInfo>();

    for (const node of nodes) {
      if (node.type !== 'FUNCTION') {
        continue;
      }

      const name = this.requireValue(
        node.name,
        `Funcion sin nombre en la linea ${node.line}`,
      );
      const returnType = (node.returnType ?? 'Vacio') as NebulaType;
      const params = (node.params ?? []).map((param) => ({
        name: param.name,
        dataType: param.dataType as NebulaType,
      }));

      if (functions.has(name)) {
        throw new Error(`La funcion ${name} ya fue declarada`);
      }

      functions.set(name, {
        returnType,
        params,
      });
    }

    return functions;
  }

  private analyzeBlock(
    nodes: ASTNode[],
    scopes: Scope[],
    functions: Map<string, FunctionInfo>,
    returnType: NebulaType,
  ): void {
    for (const node of nodes) {
      switch (node.type) {
        case 'DECLARATION':
          this.handleDeclaration(node, scopes);
          break;
        case 'ASSIGNMENT':
          this.handleAssignment(node, scopes, functions);
          break;
        case 'PRINT':
          this.ensureExpressionType(
            this.requireExpression(node),
            scopes,
            functions,
          );
          break;
        case 'IF':
          this.ensureCondition(node, scopes, functions);
          this.analyzeBlock(
            node.children || [],
            [...scopes, { variables: new Map() }],
            functions,
            returnType,
          );
          this.analyzeBlock(
            node.elseBranch || [],
            [...scopes, { variables: new Map() }],
            functions,
            returnType,
          );
          break;
        case 'WHILE':
        case 'DO_WHILE':
          this.ensureCondition(node, scopes, functions);
          this.analyzeBlock(
            node.children || [],
            [...scopes, { variables: new Map() }],
            functions,
            returnType,
          );
          break;
        case 'FOR':
          this.handleFor(node, scopes, functions, returnType);
          break;
        case 'SWITCH':
          this.handleSwitch(node, scopes, functions, returnType);
          break;
        case 'FUNCTION':
          this.handleFunction(node, scopes, functions);
          break;
        case 'RETURN':
          if (returnType === 'Vacio') {
            throw new Error(
              `No se puede retornar un valor fuera de una funcion con retorno. Linea ${node.line}`,
            );
          }
          this.ensureAssignable(
            returnType,
            this.requireExpression(node),
            scopes,
            functions,
            node.line,
          );
          break;
        default:
          throw new Error(`Nodo semantico no soportado: ${node.type}`);
      }
    }
  }

  private handleDeclaration(node: ASTNode, scopes: Scope[]): void {
    const name = this.requireValue(
      node.name,
      `Variable invalida en la linea ${node.line}`,
    );
    const dataType = this.requireValue(
      node.dataType,
      `Tipo invalido en la linea ${node.line}`,
    ) as NebulaType;
    const currentScope = scopes[scopes.length - 1];

    if (currentScope.variables.has(name)) {
      throw new Error(`Variable ${name} ya declarada en la linea ${node.line}`);
    }

    currentScope.variables.set(name, dataType);
  }

  private handleAssignment(
    node: ASTNode,
    scopes: Scope[],
    functions: Map<string, FunctionInfo>,
  ): void {
    const name = this.requireValue(
      node.name,
      `Asignacion invalida en la linea ${node.line}`,
    );
    const variableType = this.findVariableType(name, scopes);

    if (!variableType) {
      throw new Error(`Variable ${name} no declarada. Linea ${node.line}`);
    }

    this.ensureAssignable(
      variableType,
      this.requireExpression(node),
      scopes,
      functions,
      node.line,
    );
  }

  private handleFor(
    node: ASTNode,
    scopes: Scope[],
    functions: Map<string, FunctionInfo>,
    returnType: NebulaType,
  ): void {
    const variable = this.requireValue(
      node.name,
      `Variable de Para invalida en la linea ${node.line}`,
    );
    const variableType = this.findVariableType(variable, scopes);

    if (!variableType) {
      throw new Error(
        `La variable ${variable} debe declararse antes del Para. Linea ${node.line}`,
      );
    }

    if (variableType !== 'Entero' && variableType !== 'Real') {
      throw new Error(
        `La variable ${variable} del Para debe ser numerica. Linea ${node.line}`,
      );
    }

    this.ensureAssignable(
      variableType,
      this.requireValue(node.value, 'Inicio de Para invalido'),
      scopes,
      functions,
      node.line,
    );
    this.ensureAssignable(
      variableType,
      this.requireExpression(node),
      scopes,
      functions,
      node.line,
    );
    this.analyzeBlock(
      node.children || [],
      [...scopes, { variables: new Map() }],
      functions,
      returnType,
    );
  }

  private handleSwitch(
    node: ASTNode,
    scopes: Scope[],
    functions: Map<string, FunctionInfo>,
    returnType: NebulaType,
  ): void {
    const controlType = this.ensureExpressionType(
      this.requireExpression(node),
      scopes,
      functions,
    );

    for (const caseNode of node.cases || []) {
      const caseType = this.ensureExpressionType(
        this.requireExpression(caseNode),
        scopes,
        functions,
      );

      if (caseType !== controlType) {
        throw new Error(
          `El Caso de la linea ${caseNode.line} no coincide con el tipo del Segun`,
        );
      }

      this.analyzeBlock(
        caseNode.children || [],
        [...scopes, { variables: new Map() }],
        functions,
        returnType,
      );
    }

    if (node.defaultCase) {
      this.analyzeBlock(
        node.defaultCase.children || [],
        [...scopes, { variables: new Map() }],
        functions,
        returnType,
      );
    }
  }

  private handleFunction(
    node: ASTNode,
    scopes: Scope[],
    functions: Map<string, FunctionInfo>,
  ): void {
    const name = this.requireValue(
      node.name,
      `Funcion sin nombre en la linea ${node.line}`,
    );
    const functionInfo = functions.get(name);

    if (!functionInfo) {
      throw new Error(`No se encontro la funcion ${name}`);
    }

    const functionScope: Scope = { variables: new Map() };
    for (const param of functionInfo.params) {
      if (functionScope.variables.has(param.name)) {
        throw new Error(
          `Parametro duplicado ${param.name} en la funcion ${name}`,
        );
      }
      functionScope.variables.set(param.name, param.dataType);
    }

    this.analyzeBlock(
      node.children || [],
      [...scopes, functionScope],
      functions,
      functionInfo.returnType,
    );
  }

  private ensureCondition(
    node: ASTNode,
    scopes: Scope[],
    functions: Map<string, FunctionInfo>,
  ): void {
    const condition = node.condition;

    if (!condition) {
      throw new Error(`Condicion invalida en la linea ${node.line}`);
    }

    const leftType = this.ensureExpressionType(
      condition.left,
      scopes,
      functions,
    );
    const rightType = this.ensureExpressionType(
      condition.right,
      scopes,
      functions,
    );

    if (leftType !== rightType && !this.isNumeric(leftType, rightType)) {
      throw new Error(
        `Tipos incompatibles en la condicion de la linea ${node.line}`,
      );
    }
  }

  private ensureAssignable(
    expectedType: NebulaType,
    expression: string,
    scopes: Scope[],
    functions: Map<string, FunctionInfo>,
    line?: number,
  ): void {
    const expressionType = this.ensureExpressionType(
      expression,
      scopes,
      functions,
    );

    if (expectedType === expressionType) {
      return;
    }

    if (expectedType === 'Real' && expressionType === 'Entero') {
      return;
    }

    throw new Error(
      `Tipo incompatible en la linea ${line}. Se esperaba ${expectedType} pero se obtuvo ${expressionType}`,
    );
  }

  private ensureExpressionType(
    expression: string,
    scopes: Scope[],
    functions: Map<string, FunctionInfo>,
  ): NebulaType {
    const trimmed = expression.trim();

    if (/^".*"$/.test(trimmed)) {
      return 'Cadena';
    }

    if (/^(Verdadero|Falso)$/.test(trimmed)) {
      return 'Logico';
    }

    if (/^\d+$/.test(trimmed)) {
      return 'Entero';
    }

    if (/^\d+\.\d+$/.test(trimmed)) {
      return 'Real';
    }

    const callMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*\((.*)\)$/);
    if (callMatch) {
      const functionInfo = functions.get(callMatch[1]);
      if (!functionInfo) {
        throw new Error(`La funcion ${callMatch[1]} no existe`);
      }

      const args = callMatch[2]
        .split(',')
        .map((arg) => arg.trim())
        .filter((arg) => arg.length > 0);

      if (args.length !== functionInfo.params.length) {
        throw new Error(`Cantidad invalida de argumentos para ${callMatch[1]}`);
      }

      args.forEach((arg, index) => {
        this.ensureAssignable(
          functionInfo.params[index].dataType,
          arg,
          scopes,
          functions,
        );
      });

      return functionInfo.returnType;
    }

    if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(trimmed)) {
      const variableType = this.findVariableType(trimmed, scopes);
      if (!variableType) {
        throw new Error(`Variable ${trimmed} no declarada`);
      }
      return variableType;
    }

    const arithmeticParts = trimmed
      .split(/(\+|-|\*|\/)/)
      .map((part) => part.trim())
      .filter(
        (part) => part.length > 0 && !['+', '-', '*', '/'].includes(part),
      );

    if (arithmeticParts.length > 1) {
      let result: NebulaType = 'Entero';

      for (const part of arithmeticParts) {
        const partType = this.ensureExpressionType(part, scopes, functions);
        if (partType !== 'Entero' && partType !== 'Real') {
          throw new Error(`Operacion invalida con tipo ${partType}`);
        }
        if (partType === 'Real') {
          result = 'Real';
        }
      }

      return result;
    }

    throw new Error(`Expresion invalida: ${expression}`);
  }

  private findVariableType(
    name: string,
    scopes: Scope[],
  ): NebulaType | undefined {
    for (let index = scopes.length - 1; index >= 0; index--) {
      const type = scopes[index].variables.get(name);
      if (type) {
        return type;
      }
    }

    return undefined;
  }

  private isNumeric(left: NebulaType, right: NebulaType): boolean {
    const numericTypes: NebulaType[] = ['Entero', 'Real'];
    return numericTypes.includes(left) && numericTypes.includes(right);
  }

  private requireValue(value: string | undefined, message: string): string {
    if (!value) {
      throw new Error(message);
    }

    return value;
  }

  private requireExpression(node: ASTNode): string {
    return this.requireValue(
      node.expression,
      `Expresion invalida en la linea ${node.line}`,
    );
  }
}
