import { ASTNode } from '../parser/ast';

export class SemanticService {
  analyze(ast: ASTNode): void {
    const variables = new Map<string, string>();
    const nodes = ast.children || [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      // 🔥 DECLARACIÓN
      if (node.value === 'Definir') {
        const nombre = nodes[i + 1]?.value;
        const tipo = nodes[i + 3]?.value;

        if (!nombre || !tipo) {
          throw new Error('Declaración inválida');
        }

        if (variables.has(nombre)) {
          throw new Error(`Variable ${nombre} ya declarada`);
        }

        variables.set(nombre, tipo);
      }

      // 🔥 ASIGNACIÓN
      if (node.type === 'IDENTIFICADOR' && nodes[i + 1]?.value === '<-') {
        const nombre = node.value;

        // 👇 ESTA ES LA CLAVE
        if (!nombre) {
          throw new Error('Identificador inválido');
        }

        if (!variables.has(nombre)) {
          throw new Error(`Variable ${nombre} no declarada`);
        }
      }
    }
  }
}
