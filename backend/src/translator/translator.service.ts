import { ASTNode } from '../parser/ast';

export class TranslatorService {
  private getValue(node?: ASTNode): string {
    if (!node?.value) {
      throw new Error('Token invalido o incompleto');
    }

    return node.value;
  }

  traducir(ast: ASTNode): string {
    let java = `
public class Main {
  public static void main(String[] args) {
`;

    const variables = new Map<string, string>(); // nombre → tipo

    const nodes = ast.children || [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      // 🔥 DECLARACIÓN
      if (node.value === 'Definir') {
        const nombre = nodes[i + 1]?.value;
        const tipo = nodes[i + 3]?.value;

        if (!nombre || !tipo) {
          throw new Error('Error en declaración de variable');
        }

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
        const nombre = this.getValue(node);
        const valor = this.getValue(nodes[i + 2]);

        if (!variables.has(nombre)) {
          throw new Error(`Variable ${nombre} no declarada`);
        }

        java += `${nombre} = ${valor};\n`;
      }

      // 🔥 ESCRIBIR
      if (node.value === 'Escribir') {
        const valor = nodes[i + 1]?.value;

        if (!valor) throw new Error('Escribir sin valor');

        java += `System.out.println(${valor});\n`;
      }

      // 🔥 IF
      if (node.value === 'Si') {
        const izq = nodes[i + 1]?.value;
        const op = nodes[i + 2]?.value;
        const der = nodes[i + 3]?.value;

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
        const izq = nodes[i + 1]?.value;
        const op = nodes[i + 2]?.value;
        const der = nodes[i + 3]?.value;

        java += `while (${izq} ${op} ${der}) {\n`;
      }

      if (node.value === 'FinMientras') {
        java += `}\n`;
      }

      // 🔥 FOR
      if (node.value === 'Para') {
        const variable = nodes[i + 1]?.value;
        const inicio = nodes[i + 3]?.value;
        const fin = nodes[i + 5]?.value;

        if (!variable || !inicio || !fin) {
          throw new Error('Error en estructura Para');
        }

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
