import { ASTNode } from '../parser/ast';

export class TranslatorService {
  private getValue(node?: ASTNode): string {
    if (!node || !node.value) {
      throw new Error('Token inválido o incompleto');
    }
    return node.value;
  }

  traducir(ast: ASTNode): string {
    let java = `
public class Main {
  public static void main(String[] args) {
`;

    const variables = new Map<string, string>();
    const nodes = ast.children || [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      // 🔥 DECLARACIÓN
      if (node.value === 'Definir') {
        const nombre = this.getValue(nodes[i + 1]);
        const tipo = this.getValue(nodes[i + 3]);

        if (variables.has(nombre)) {
          throw new Error(`Variable ${nombre} ya declarada`);
        }

        let javaTipo = 'int';

        if (tipo === 'Real') javaTipo = 'double';
        if (tipo === 'Cadena') javaTipo = 'String';
        if (tipo === 'Logico') javaTipo = 'boolean';

        variables.set(nombre, tipo);

        java += `${javaTipo} ${nombre};\n`;
      }

      // 🔥 ASIGNACIÓN
      if (node.type === 'IDENTIFICADOR' && nodes[i + 1]?.value === '<-') {
        const nombre = node.value;
        const valor = this.getValue(nodes[i + 2]);

        if (!variables.has(nombre)) {
          throw new Error(`Variable ${nombre} no declarada`);
        }

        java += `${nombre} = ${valor};\n`;
      }

      // 🔥 ESCRIBIR
      if (node.value === 'Escribir') {
        const valor = this.getValue(nodes[i + 1]);

        java += `System.out.println(${valor});\n`;
      }

      // 🔥 IF
      if (node.value === 'Si') {
        const izq = this.getValue(nodes[i + 1]);
        const op = this.getValue(nodes[i + 2]);
        const der = this.getValue(nodes[i + 3]);

        java += `if (${izq} ${op} ${der}) {\n`;
      }

      if (node.value === 'Sino') {
        java += `} else {\n`;
      }

      if (node.value === 'FinSi') {
        java += `}\n`;
      }

      // 🔥 WHILE
      if (node.value === 'Mientras') {
        const izq = this.getValue(nodes[i + 1]);
        const op = this.getValue(nodes[i + 2]);
        const der = this.getValue(nodes[i + 3]);

        java += `while (${izq} ${op} ${der}) {\n`;
      }

      if (node.value === 'FinMientras') {
        java += `}\n`;
      }

      // 🔥 FOR
      if (node.value === 'Para') {
        const variable = this.getValue(nodes[i + 1]);
        const inicio = this.getValue(nodes[i + 3]);
        const fin = this.getValue(nodes[i + 5]);

        java += `for (int ${variable} = ${inicio}; ${variable} <= ${fin}; ${variable}++) {\n`;
      }

      if (node.value === 'FinPara') {
        java += `}\n`;
      }
    }

    java += `
  }
}
`;

    return java;
  }
}
