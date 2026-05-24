import {
  Project,
  SourceFile,
  ClassDeclaration,
  ExportAssignment,
  FunctionDeclaration,
  MethodDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  EnumDeclaration,
  Node,
  VariableDeclaration,
} from "ts-morph";
import type { ASTNode } from "../../../types/ast-node.type";
import type { CodeMetadata } from "../../../types/code-metadata.type";
import type { ParsedDocument } from "../types/parsed-document.type";
import { deriveDefaultExportSymbolName } from "./derive-default-export-symbol-name.util";

export const parseTypescript = (filePath: string, content: string): ParsedDocument => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: 99, // ESNext
      module: 99, // ESNext
      allowJs: true,
    },
  });

  const sourceFile = project.createSourceFile(filePath, content);
  const astNodes = extractTypescriptStructures(sourceFile, filePath);

  return convertAstNodesToParsedDocument(filePath, astNodes);
};

const extractTypescriptStructures = (sourceFile: SourceFile, filePath: string): ASTNode[] => {
  const nodes: ASTNode[] = [];

  for (const classDecl of sourceFile.getClasses()) {
    nodes.push(extractTypescriptClass(classDecl, sourceFile));
  }

  for (const func of sourceFile.getFunctions()) {
    nodes.push(extractTypescriptFunction(func, sourceFile));
  }

  for (const iface of sourceFile.getInterfaces()) {
    nodes.push(extractTypescriptInterface(iface, sourceFile));
  }

  for (const typeAlias of sourceFile.getTypeAliases()) {
    nodes.push(extractTypescriptTypeAlias(typeAlias, sourceFile));
  }

  for (const enumDecl of sourceFile.getEnums()) {
    nodes.push(extractTypescriptEnum(enumDecl, sourceFile));
  }

  for (const statement of sourceFile.getVariableStatements()) {
    for (const declaration of statement.getDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer) {
        continue;
      }

      // 1. direct arrow function: const foo = () => ...
      if (Node.isArrowFunction(initializer)) {
        nodes.push(extractTypescriptArrowFunction(declaration, sourceFile));
        continue;
      }

      // 2. HOC-wrapped arrow / function: const Foo = memo(() => ...), forwardRef((p, r) => ...), observer(...), etc.
      //    we unwrap the inner function so we still capture parameters/returnType, but the symbol's name/range track the outer variable
      if (Node.isCallExpression(initializer)) {
        const innerFunction = initializer
          .getArguments()
          .find((arg) => Node.isArrowFunction(arg) || Node.isFunctionExpression(arg));

        if (innerFunction && (Node.isArrowFunction(innerFunction) || Node.isFunctionExpression(innerFunction))) {
          nodes.push(extractTypescriptHocWrappedFunction(declaration, innerFunction, sourceFile));
          continue;
        }

        // 3. CallExpression initializer with no inner function: createTheme(...), axios.create(...), create<S>()(...)
        //    emit as a variable so the export is searchable by name even though we can't capture function metadata
        nodes.push(extractTypescriptVariable(declaration, sourceFile));
        continue;
      }

      // 4. styled-components: const Button = styled.div`...`
      if (Node.isTaggedTemplateExpression(initializer)) {
        nodes.push(extractTypescriptTaggedTemplate(declaration, sourceFile));
        continue;
      }

      // 5. object literal: strings maps, refine resource objects, service-as-object singletons, styles maps
      if (Node.isObjectLiteralExpression(initializer)) {
        nodes.push(extractTypescriptVariable(declaration, sourceFile));
        continue;
      }

      // 6. array literal: resource lists, plan arrays
      if (Node.isArrayLiteralExpression(initializer)) {
        nodes.push(extractTypescriptVariable(declaration, sourceFile));
        continue;
      }

      // primitives (strings, numbers, booleans) and identifier re-exports are intentionally not indexed — they'd add noise
    }
  }

  // default exports — handle four shapes:
  //  a. export default () => <div />            (anonymous arrow/function literal)
  //  b. export default memo(() => <div />)      (HOC-wrapped anonymous function)
  //  c. export default memo(Foo)                (HOC-wrapped named identifier — skipped because Foo was already extracted above)
  //  d. export default styled.div`...`          (tagged template)
  for (const exportAssignment of sourceFile.getExportAssignments()) {
    // ignore CommonJS-style "export = X"; only handle "export default X"
    if (exportAssignment.isExportEquals()) {
      continue;
    }

    const expression = exportAssignment.getExpression();

    // case a: bare anonymous arrow/function literal
    if (Node.isArrowFunction(expression) || Node.isFunctionExpression(expression)) {
      nodes.push(extractTypescriptAnonymousDefaultExport(exportAssignment, sourceFile, filePath));
      continue;
    }

    // case b/c: CallExpression default export
    if (Node.isCallExpression(expression)) {
      const hasInnerAnonymousFunction = expression
        .getArguments()
        .some((arg) => Node.isArrowFunction(arg) || Node.isFunctionExpression(arg));

      // only emit when the inner function is anonymous; identifier-arg case (memo(Foo)) is already covered by Foo's variable declaration above
      if (hasInnerAnonymousFunction) {
        nodes.push(extractTypescriptDefaultExportSynthesized(exportAssignment, sourceFile, filePath));
      }
      continue;
    }

    // case d: tagged template
    if (Node.isTaggedTemplateExpression(expression)) {
      nodes.push(extractTypescriptDefaultExportSynthesized(exportAssignment, sourceFile, filePath));
    }
  }

  return nodes;
};

const extractTypescriptClass = (classDecl: ClassDeclaration, sourceFile: SourceFile): ASTNode => {
  const name = classDecl.getName() ?? "AnonymousClass";
  const decorators = classDecl.getDecorators().map((decorator) => decorator.getText());
  const isExported = classDecl.isExported();

  const jsDocComments = classDecl.getJsDocs();
  const jsDoc = jsDocComments.length > 0 ? jsDocComments[0].getDescription().trim() : undefined;

  const startLine = sourceFile.getLineAndColumnAtPos(classDecl.getStart()).line;
  const endLine = sourceFile.getLineAndColumnAtPos(classDecl.getEnd()).line;

  const methods = classDecl.getMethods();
  const children: ASTNode[] = methods.map((method) => extractTypescriptMethod(method, sourceFile, name));

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: "class",
    name,
    decorators,
    isExported,
    jsDoc,
    imports: extractTypescriptImports(sourceFile),
  };

  return {
    type: "class",
    name,
    content: classDecl.getText(),
    metadata,
    children,
  };
};

const extractTypescriptMethod = (method: MethodDeclaration, sourceFile: SourceFile, parentClassName: string): ASTNode => {
  const name = method.getName();
  const decorators = method.getDecorators().map((decorator) => decorator.getText());
  const isAsync = method.isAsync();

  const parameters = method.getParameters().map((param) => `${param.getName()}: ${param.getType().getText()}`);
  const returnType = method.getReturnType().getText();

  const jsDocComments = method.getJsDocs();
  const jsDoc = jsDocComments.length > 0 ? jsDocComments[0].getDescription().trim() : undefined;

  const startLine = sourceFile.getLineAndColumnAtPos(method.getStart()).line;
  const endLine = sourceFile.getLineAndColumnAtPos(method.getEnd()).line;

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: "method",
    name,
    parameters,
    returnType,
    decorators,
    isAsync,
    jsDoc,
    parentClass: parentClassName,
    complexity: calculateTypescriptComplexity(method.getText()),
  };

  return {
    type: "method",
    name,
    content: method.getText(),
    metadata,
  };
};

const extractTypescriptFunction = (func: FunctionDeclaration, sourceFile: SourceFile): ASTNode => {
  const name = func.getName() ?? "AnonymousFunction";
  const isExported = func.isExported();
  const isAsync = func.isAsync();

  const parameters = func.getParameters().map((param) => `${param.getName()}: ${param.getType().getText()}`);
  const returnType = func.getReturnType().getText();

  const jsDocComments = func.getJsDocs();
  const jsDoc = jsDocComments.length > 0 ? jsDocComments[0].getDescription().trim() : undefined;

  const startLine = sourceFile.getLineAndColumnAtPos(func.getStart()).line;
  const endLine = sourceFile.getLineAndColumnAtPos(func.getEnd()).line;

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: "function",
    name,
    parameters,
    returnType,
    isExported,
    isAsync,
    jsDoc,
    imports: extractTypescriptImports(sourceFile),
    complexity: calculateTypescriptComplexity(func.getText()),
  };

  return {
    type: "function",
    name,
    content: func.getText(),
    metadata,
  };
};

const extractTypescriptInterface = (iface: InterfaceDeclaration, sourceFile: SourceFile): ASTNode => {
  const name = iface.getName();
  const isExported = iface.isExported();

  const jsDocComments = iface.getJsDocs();
  const jsDoc = jsDocComments.length > 0 ? jsDocComments[0].getDescription().trim() : undefined;

  const startLine = sourceFile.getLineAndColumnAtPos(iface.getStart()).line;
  const endLine = sourceFile.getLineAndColumnAtPos(iface.getEnd()).line;

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: "interface",
    name,
    isExported,
    jsDoc,
  };

  return {
    type: "interface",
    name,
    content: iface.getText(),
    metadata,
  };
};

const extractTypescriptTypeAlias = (typeAlias: TypeAliasDeclaration, sourceFile: SourceFile): ASTNode => {
  const name = typeAlias.getName();
  const isExported = typeAlias.isExported();

  const jsDocComments = typeAlias.getJsDocs();
  const jsDoc = jsDocComments.length > 0 ? jsDocComments[0].getDescription().trim() : undefined;

  const startLine = sourceFile.getLineAndColumnAtPos(typeAlias.getStart()).line;
  const endLine = sourceFile.getLineAndColumnAtPos(typeAlias.getEnd()).line;

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: "type",
    name,
    isExported,
    jsDoc,
  };

  return {
    type: "type",
    name,
    content: typeAlias.getText(),
    metadata,
  };
};

const extractTypescriptEnum = (enumDecl: EnumDeclaration, sourceFile: SourceFile): ASTNode => {
  const name = enumDecl.getName();
  const isExported = enumDecl.isExported();

  const jsDocComments = enumDecl.getJsDocs();
  const jsDoc = jsDocComments.length > 0 ? jsDocComments[0].getDescription().trim() : undefined;

  const startLine = sourceFile.getLineAndColumnAtPos(enumDecl.getStart()).line;
  const endLine = sourceFile.getLineAndColumnAtPos(enumDecl.getEnd()).line;

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: "enum",
    name,
    isExported,
    jsDoc,
  };

  return {
    type: "enum",
    name,
    content: enumDecl.getText(),
    metadata,
  };
};

const extractTypescriptArrowFunction = (declaration: VariableDeclaration, sourceFile: SourceFile): ASTNode => {
  const name = declaration.getName();
  const initializer = declaration.getInitializer();

  if (!initializer || !Node.isArrowFunction(initializer)) {
    throw new Error("Invalid arrow function declaration");
  }

  const variableStatement = declaration.getVariableStatement();
  const isExported = variableStatement ? variableStatement.isExported() : false;
  const isAsync = initializer.isAsync();

  const parameters = initializer.getParameters().map((param) => `${param.getName()}: ${param.getType().getText()}`);
  const returnType = initializer.getReturnType().getText();

  const jsDocComments = variableStatement ? variableStatement.getJsDocs() : [];
  const jsDoc = jsDocComments.length > 0 ? jsDocComments[0].getDescription().trim() : undefined;

  const startLine = sourceFile.getLineAndColumnAtPos(
    variableStatement ? variableStatement.getStart() : declaration.getStart(),
  ).line;
  const endLine = sourceFile.getLineAndColumnAtPos(initializer.getEnd()).line;

  const content = variableStatement ? variableStatement.getText() : declaration.getText();

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: "arrow-function",
    name,
    parameters,
    returnType,
    isExported,
    isAsync,
    jsDoc,
    imports: extractTypescriptImports(sourceFile),
    complexity: calculateTypescriptComplexity(content),
  };

  return {
    type: "function",
    name,
    content,
    metadata,
  };
};

const extractTypescriptAnonymousDefaultExport = (
  exportAssignment: ExportAssignment,
  sourceFile: SourceFile,
  filePath: string,
): ASTNode => {
  const expression = exportAssignment.getExpression();

  if (!Node.isArrowFunction(expression) && !Node.isFunctionExpression(expression)) {
    throw new Error("extractTypescriptAnonymousDefaultExport called on a non-function expression");
  }

  // synthesize a meaningful name from the file path so search_symbols finds it
  // e.g. app/users/page.tsx -> "UsersPage", components/Button/index.tsx -> "Button"
  const name = deriveDefaultExportSymbolName(filePath);

  const isAsync = expression.isAsync();
  const parameters = expression.getParameters().map((param) => `${param.getName()}: ${param.getType().getText()}`);
  const returnType = expression.getReturnType().getText();

  const jsDocComments = exportAssignment.getJsDocs();
  const jsDoc = jsDocComments.length > 0 ? jsDocComments[0].getDescription().trim() : undefined;

  // span the entire "export default ..." statement so we capture the export keyword + the function body
  const startLine = sourceFile.getLineAndColumnAtPos(exportAssignment.getStart()).line;
  const endLine = sourceFile.getLineAndColumnAtPos(exportAssignment.getEnd()).line;

  const content = exportAssignment.getText();

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: Node.isArrowFunction(expression) ? "arrow-function" : "function",
    name,
    parameters,
    returnType,
    // it's a default export, so always exported
    isExported: true,
    isAsync,
    jsDoc,
    imports: extractTypescriptImports(sourceFile),
    complexity: calculateTypescriptComplexity(content),
  };

  return {
    type: "function",
    name,
    content,
    metadata,
  };
};

// HOC-wrapped function: const Foo = memo(() => ...), forwardRef((p, r) => ...), observer(...), withRouter((p) => ...)
// the symbol's name + line range track the OUTER variable (so search_symbols("Foo") finds it),
// but parameters/returnType/isAsync come from the INNER function so the captured metadata stays accurate
const extractTypescriptHocWrappedFunction = (
  declaration: VariableDeclaration,
  innerFunction: Node,
  sourceFile: SourceFile,
): ASTNode => {
  if (!Node.isArrowFunction(innerFunction) && !Node.isFunctionExpression(innerFunction)) {
    throw new Error("extractTypescriptHocWrappedFunction called with non-function inner");
  }

  const name = declaration.getName();
  const variableStatement = declaration.getVariableStatement();
  const isExported = variableStatement ? variableStatement.isExported() : false;
  const isAsync = innerFunction.isAsync();

  const parameters = innerFunction
    .getParameters()
    .map((param) => `${param.getName()}: ${param.getType().getText()}`);
  const returnType = innerFunction.getReturnType().getText();

  const jsDocComments = variableStatement ? variableStatement.getJsDocs() : [];
  const jsDoc = jsDocComments.length > 0 ? jsDocComments[0].getDescription().trim() : undefined;

  const startLine = sourceFile.getLineAndColumnAtPos(
    variableStatement ? variableStatement.getStart() : declaration.getStart(),
  ).line;
  const endLine = sourceFile.getLineAndColumnAtPos(
    variableStatement ? variableStatement.getEnd() : declaration.getEnd(),
  ).line;

  const content = variableStatement ? variableStatement.getText() : declaration.getText();

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: "arrow-function",
    name,
    parameters,
    returnType,
    isExported,
    isAsync,
    jsDoc,
    imports: extractTypescriptImports(sourceFile),
    complexity: calculateTypescriptComplexity(content),
  };

  return {
    type: "function",
    name,
    content,
    metadata,
  };
};

// styled-components: const Button = styled.div`...`
// emitted as a function symbol since callers treat the result as a renderable component
const extractTypescriptTaggedTemplate = (declaration: VariableDeclaration, sourceFile: SourceFile): ASTNode => {
  const name = declaration.getName();
  const variableStatement = declaration.getVariableStatement();
  const isExported = variableStatement ? variableStatement.isExported() : false;

  const startLine = sourceFile.getLineAndColumnAtPos(
    variableStatement ? variableStatement.getStart() : declaration.getStart(),
  ).line;
  const endLine = sourceFile.getLineAndColumnAtPos(
    variableStatement ? variableStatement.getEnd() : declaration.getEnd(),
  ).line;

  const content = variableStatement ? variableStatement.getText() : declaration.getText();

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: "function",
    name,
    isExported,
  };

  return {
    type: "function",
    name,
    content,
    metadata,
  };
};

// constant declarations that aren't function-shaped:
//  - object literals (strings maps, refine resources, services-as-objects, styles maps)
//  - array literals (resource lists)
//  - call expressions that don't wrap a function (axios.create(...), createTheme(...))
// indexed as "variable" type so search_symbols still surfaces them by name; no parameters/returnType captured
const extractTypescriptVariable = (declaration: VariableDeclaration, sourceFile: SourceFile): ASTNode => {
  const name = declaration.getName();
  const variableStatement = declaration.getVariableStatement();
  const isExported = variableStatement ? variableStatement.isExported() : false;

  const jsDocComments = variableStatement ? variableStatement.getJsDocs() : [];
  const jsDoc = jsDocComments.length > 0 ? jsDocComments[0].getDescription().trim() : undefined;

  const startLine = sourceFile.getLineAndColumnAtPos(
    variableStatement ? variableStatement.getStart() : declaration.getStart(),
  ).line;
  const endLine = sourceFile.getLineAndColumnAtPos(
    variableStatement ? variableStatement.getEnd() : declaration.getEnd(),
  ).line;

  const content = variableStatement ? variableStatement.getText() : declaration.getText();

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: "variable",
    name,
    isExported,
    jsDoc,
  };

  return {
    type: "variable",
    name,
    content,
    metadata,
  };
};

// CallExpression / TaggedTemplate default exports — when we can't statically tie the export to an already-extracted variable,
// synthesize a symbol from the filepath (same helper next.js anonymous-component default exports use)
const extractTypescriptDefaultExportSynthesized = (
  exportAssignment: ExportAssignment,
  sourceFile: SourceFile,
  filePath: string,
): ASTNode => {
  const name = deriveDefaultExportSymbolName(filePath);

  const startLine = sourceFile.getLineAndColumnAtPos(exportAssignment.getStart()).line;
  const endLine = sourceFile.getLineAndColumnAtPos(exportAssignment.getEnd()).line;
  const content = exportAssignment.getText();

  const metadata: CodeMetadata = {
    startLine,
    endLine,
    language: "typescript",
    chunkType: "function",
    name,
    isExported: true,
  };

  return {
    type: "function",
    name,
    content,
    metadata,
  };
};

const extractTypescriptImports = (sourceFile: SourceFile): string[] => {
  const imports: string[] = [];

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    imports.push(moduleSpecifier);
  }

  return imports;
};

const calculateTypescriptComplexity = (code: string): "low" | "medium" | "high" => {
  const lines = code.split("\n").length;
  const controlFlowCount = (code.match(/\b(if|else|for|while|switch|case)\b/g) ?? []).length;

  if (lines < 20 && controlFlowCount < 5) {
    return "low";
  } else if (lines < 50 && controlFlowCount < 10) {
    return "medium";
  } else {
    return "high";
  }
};

const convertAstNodesToParsedDocument = (filePath: string, astNodes: ASTNode[]): ParsedDocument => {
  // every top-level node becomes a section so the downstream symbol extractor can read chunkType + name from the chunk
  // for nodes with children (classes) we emit the parent class as its own chunk PLUS one chunk per child method;
  //   without this the class itself was never indexed (only its methods were), and entity/module/empty-class files came out at 0 symbols
  const sections = astNodes.map((node) => {
    const parentChunk = { content: node.content, metadata: node.metadata };
    const childChunks = (node.children ?? []).map((child) => ({
      content: child.content,
      metadata: child.metadata,
    }));

    return {
      heading: node.name,
      content: "",
      depth: 1,
      chunks: [parentChunk, ...childChunks],
      metadata: {
        nodeType: node.type,
        ...node.metadata,
      },
    };
  });

  return {
    sourceFile: filePath,
    format: "code",
    sections,
  };
};
