import {
  Project,
  SourceFile,
  ClassDeclaration,
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
  const astNodes = extractTypescriptStructures(sourceFile);

  return convertAstNodesToParsedDocument(filePath, astNodes);
};

const extractTypescriptStructures = (sourceFile: SourceFile): ASTNode[] => {
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
      if (initializer && Node.isArrowFunction(initializer)) {
        nodes.push(extractTypescriptArrowFunction(declaration, sourceFile));
      }
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
  // if file has only 1 element with no children, make the file itself a leaf node
  if (astNodes.length === 1 && !astNodes[0].children) {
    return {
      sourceFile: filePath,
      format: "code",
      sections: [],
      rawContent: astNodes[0].content,
      metadata: astNodes[0].metadata,
    };
  }

  // otherwise, create hierarchical structure with sections
  const sections = astNodes.map((node) => ({
    heading: node.name,
    content: "",
    depth: 1,
    chunks: node.children
      ? node.children.map((child) => ({
          content: child.content,
          metadata: child.metadata,
        }))
      : [
          {
            content: node.content,
            metadata: node.metadata,
          },
        ],
    metadata: {
      nodeType: node.type,
      ...node.metadata,
    },
  }));

  return {
    sourceFile: filePath,
    format: "code",
    sections,
  };
};
