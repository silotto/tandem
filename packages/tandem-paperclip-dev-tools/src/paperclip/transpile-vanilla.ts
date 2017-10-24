import * as fs from "fs";
import * as md5 from "md5";
import * as path from "path";
import { parse } from "./parser";
import { flatten, repeat } from "lodash";
import * as postcss from "postcss";
import { weakMemo } from "../utils";
import { 
  traversePCAST, 
  getExpressionPath,
  getPCStartTagAttribute,
  hasPCStartTagAttribute,
  getPCASTElementsByTagName,
} from "./utils";
import {
  PCFragment,
  PCExpression,
  ExpressionPosition,
  PCExpressionType,
  PCSelfClosingElement,
  PCElement,
  PCStartTag,
  PCEndTag,
  PCAttribute,
  PCParent,
  PCString,
  PCBlock,
} from "./ast";

// const SOURCE_AST_VAR = "$$sourceAST";
const EXPORTS_VAR = "$$exports";
const STYLES_VAR  = "$$styles";
const IMPORTS_VAR  = "$$imports";

type TranspileContext = {
  uri: string;
  source: string;
  varCount: number;
  root: PCFragment;
  imports: {
    [identifier: string]: string
  },
  templateNames: {
    [identifier: string]: string
  }
}

type Declaration = {
  varName: string;
  content: string;
};

type Bundle = {
  [identifier: string]: {
    content: string
  }
}

/**
 * transpiles the PC AST to vanilla javascript with no frills
 */

export const transpilePCASTToVanillaJS = (source: string, uri: string, assignTo?: string) => {
  return transpileBundle(source, uri, assignTo);
};

export const transpileBundle = (source: string, uri: string, assignTo?: string) => {
  
  let buffer = `(function(document) {
    function module(fn) {
    var exports;
    return function(modules) {
      return exports || (exports = fn(function(path) {
        return modules[path]();
      }));
    };
  }\n`;
  
  buffer += `var modules = {\n`;

  const modules = bundle(source, uri);
  
  for (const uri in modules) {
    buffer += `"${uri}": ${modules[uri].content},`
  };

  buffer += "}\n";
  buffer += `return {
    entry: modules["${uri}"](modules),
    modules: modules
  }`;
  buffer += `})(document);`

  if (assignTo) {
    buffer = `${assignTo} = ${buffer}`;
  }

  return buffer;
};

const bundle = (source: string, uri: string, modules: any = {}): Bundle => {
  const ast = parse(source);
  const imports = getPCASTElementsByTagName(ast, "import");
  const importMap = {};
  for (const _import of imports) {
    const src = getPCStartTagAttribute(_import, "src");
    if (!src) continue;
    const importFullPath = "file://" + path.resolve(path.dirname(uri.replace("file://", "")), src);
    importMap[src] = importFullPath;
    if (!modules[importFullPath]) {

      // define to prevent recursion
      modules[importFullPath] = {};
      bundle(
        fs.readFileSync(importFullPath.replace("file://", ""), "utf8"),
        importFullPath,
        modules
      )
    }
  }

  modules[uri] = {
    content: transpileModule(ast, source, uri, importMap)
  }

  return modules;
};

const transpileModule = weakMemo((root: PCFragment, source: string, uri: string, importsMap: any = {}) => {
  
  const context: TranspileContext = {
    varCount: 0,
    uri,
    source,
    root,
    imports: importsMap,
    templateNames: {}
  };

  let buffer = "module(function(require) {\n";
  buffer += `var ${EXPORTS_VAR} = {};\n`;
  buffer += `var ${STYLES_VAR} = [];\n`;
  buffer += `var ${IMPORTS_VAR} = ${JSON.stringify(importsMap)};\n`;
  buffer += transpileChildren(root, context);

  buffer += `${EXPORTS_VAR}.${STYLES_VAR} = ${STYLES_VAR};\n`;
  buffer += `return ${EXPORTS_VAR};\n`;
  buffer += `})\n`

  return buffer;
});

const transpileChildren = (parent: PCParent, context: TranspileContext) => parent.children.map((child) => getTranspileContent(transpileNode(child, context))).join("\n");

const transpileNode = (node: PCExpression, context: TranspileContext): Declaration => {
  if (node.type === PCExpressionType.STRING) {
    return transpileText(node as PCString, context);
  } else if (node.type === PCExpressionType.BLOCK) {
    return transpileTextBlock(node as PCBlock, context);
  } else if (node.type === PCExpressionType.SELF_CLOSING_ELEMENT) {
    return transpileSelfClosingElement(node as PCSelfClosingElement, context);
  } else if (node.type === PCExpressionType.ELEMENT) {
    return transpileElement(node as PCElement, context);
  }
};

const transpileStartTag = (startTag: PCSelfClosingElement | PCStartTag, context: TranspileContext, element?: PCElement) => {
  if (context.templateNames[startTag.name]) {
    return transpileTemplateCall(startTag, context, element);
  }
  const declaration = createNodeDeclaration(`document.createElement("${startTag.name}")`, element || startTag, context);

  for (let i = 0, {length} = startTag.attributes; i < length; i++) {
    const attribute = startTag.attributes[i];
    callDeclarationProperty(declaration, "setAttribute", `"${attribute.name}", ${transpileAttributeValue(attribute)}`, context);
  }
  
  return declaration;
};

const transpileSelfClosingElement = (element: PCSelfClosingElement, context: TranspileContext) => {
  if (element.name === "import") {
    return transpileImport(element, context);
  }
  return transpileStartTag(element, context);
}

const transpileAttributeValue = (attribute: PCAttribute) => {
  if (!attribute.value) {
    return `true`;
  }

  if (attribute.value.type === PCExpressionType.STRING) {
    return `"${(attribute.value as PCString).value}"`;
  } else if (attribute.value.type === PCExpressionType.BLOCK) {
    return `${(attribute.value as PCBlock).value}`;
  }
}

const transpileElement = (node: PCElement, context: TranspileContext) => {

  let declaration: Declaration;

  if (node.startTag.name === "template") {
    declaration = transpileTemplate(node, context);
  } else if (node.startTag.name === "import") {
    declaration = transpileImport(node.startTag, context);
  } else if (node.startTag.name === "repeat") {
    // TODO
  } else if (node.startTag.name === "style") {
    // TODO
    declaration = transpileStyleElement(node, context);
    
  } else {
    declaration = transpileBasicElement(node, context);
  } 

  tryExportingDeclaration(declaration, node, context);

  return declaration;
};

// TODO - eventually need to put these style elements within the global context, or check if they've already
// been registered. Otherwise they'll pollute the CSSOM when used repeatedly. 
const transpileStyleElement = (node: PCElement, context: TranspileContext) => {
  const scoped = hasPCStartTagAttribute(node, "scoped");
  const path = getExpressionPath(node, context.root);

  const varName = `style_${context.varCount++}_${md5(context.uri)}`;

  let buffer = `
    var ${varName} = document.createElement("style");
    ${varName}.setAttribute("data-style-id", "${varName}");
  `;

  // add lines so that source maps point to the correct location
  let css = repeat("\n", node.location.start.line) + context.source.substr(node.startTag.location.end.pos, node.endTag.location.start.pos - node.startTag.location.end.pos);

  if (scoped) { 

    const cssRulePrefixes = [`[data-style-id=${varName}] ~ `, `[data-style-id=${varName}] ~ * `];

    const declaration = declareNode(`document.createElement("style")`, context);

    // TODO - call CSSOM, don't set textContent. Also need to define CSS AST in the scope
    const result = postcss().use(prefixCSSRules(cssRulePrefixes)).process(css, {
      map: {
        inline: true
      }
    });

    css = result.css;
  }

  buffer += `${varName}.textContent = "${css.replace(/[\n\r\s\t]+/g, " ")}";\n`

  // in the root scope, so export as a global style
  if (path.length === 2) {
    buffer += `${STYLES_VAR}.push(${varName});\n`;
  }

  return {
    varName: varName,
    content: buffer
  };
};

const prefixCSSRules = (prefixes: string[]) => (root: postcss.Root) => {
  // from https://github.com/RadValentin/postcss-prefix-selector/blob/master/index.js
  root.walkRules(rule => {
    rule.selectors = flatten(rule.selectors.map((selector) => {
      return prefixes.map((prefix) => prefix + selector);
    }));
  });
}

const transpileTemplateCall = (node: PCStartTag, context: TranspileContext, element?: PCElement) => {

  let buffer = '';

  const attributeBuffer = node.attributes.map((attr) => (
    `"${attr.name}": ${transpileAttributeValue(attr)}`
  ));

  if (element && element.children.length > 0) {
    const childDeclarations = element.children.map((child) => transpileNode(child, context));
    buffer += childDeclarations.map((decl) => decl.content).join("");

    attributeBuffer.push(
      `"children":[` +
      childDeclarations.map((decl) => decl.varName).join(",") + 
      `]`
    )
  }

  const decl = declareNode(`${context.templateNames[node.name]}({${attributeBuffer.join(",")}})`, context);
  decl.content = buffer + decl.content;
  return decl;
}

const assertAttributeExists = (node: PCElement|PCSelfClosingElement, name: string, context: TranspileContext) => {
  if (!getPCStartTagAttribute(node, name)) {

    // TODO - show actual source code here
    throw new Error(`Missing "${name}" element attribute at ${node.location.start}`);
  }
}

const tryExportingDeclaration = (declaration: Declaration, node: PCElement, context: TranspileContext) => {
  const name = getPCStartTagAttribute(node, "name");
  const shouldExport = hasPCStartTagAttribute(node, "export");

  if (shouldExport) {
    declaration.content += `${EXPORTS_VAR}["${name || declaration.varName}"] = ${declaration.varName};\n`;
  }
}

const transpileImport = (node: PCStartTag, context: TranspileContext) => {
  const src    = getPCStartTagAttribute(node, "src");
  assertAttributeExists(node, "src", context);
  
  const imports = declare("imports", `require("${context.imports[src]}");`, context);

  imports.content += `${STYLES_VAR} = ${STYLES_VAR}.concat(${imports.varName}.${STYLES_VAR});`

  return imports;
};

const getJSFriendlyVarName = (name: string) => name.replace(/\-/g, "_");

const transpileTemplate = (node: PCElement, context: TranspileContext) => {
  const name    = getPCStartTagAttribute(node, "name");
  const shouldExport = hasPCStartTagAttribute(node, "export");

  assertAttributeExists(node, "name", context);
  const jsFriendlyName = getJSFriendlyVarName(name);

  context.templateNames[name] = jsFriendlyName;

  let newContext = { ...context, varCount: 0 };
  const fragmentDeclaration = declareNode(`document.createDocumentFragment()`, newContext);
  
  fragmentDeclaration.content += "with(context) {\n";
  addNodeDeclarationChildren(fragmentDeclaration, node, newContext);
  fragmentDeclaration.content += "}";

  let buffer = `function ${jsFriendlyName}(context) {
    ${fragmentDeclaration.content}
    return ${fragmentDeclaration.varName};
  }\n`;

  return {
    varName: jsFriendlyName,
    content: buffer
  };
}

const transpileBasicElement = (node: PCElement, context: TranspileContext) => {
  const declaration = transpileStartTag(node.startTag, context, node);

  // do not include -- already part of attributes
  if (!context.templateNames[node.startTag.name]) {
    addNodeDeclarationChildren(declaration, node, context);
  }
  return declaration;
};

const addNodeDeclarationChildren = (declaration: Declaration, node: PCElement, context: TranspileContext) => {
  for (let i = 0, {length} = node.children; i < length; i++) {
    const child = node.children[i];
    const childDeclaration = transpileNode(child, context);
    declaration.content += childDeclaration.content;
    callDeclarationProperty(declaration, "appendChild", childDeclaration.varName, context);
  }
  return declaration;
};

const transpileText = (node: PCString, context: TranspileContext) => createTextNodeDeclaration(`"${node.value.replace(/\n/g, "\\n").replace(/"/g, '\\"')}"`, node, context);

const transpileTextBlock = (node: PCBlock, context: TranspileContext) => {

  // reserved
  if (node.value === "children") {
    return transpileChildBlock(node, context);
  }

  return createTextNodeDeclaration(`${node.value}`, node, context);
}

const transpileChildBlock = (node: PCBlock, context: TranspileContext) => {

  // span must exist so that we can attach the source
  const fragmentDeclaration = createNodeDeclaration(`document.createElement("span")`, node, context);

  const iDeclaration = declare("i", undefined, context);
  const nDeclaration = declare("n", undefined, context);

  let buffer = `
    for (var ${iDeclaration.varName} = 0, ${nDeclaration.varName} = ${node.value}.length; ${iDeclaration.varName} < ${nDeclaration.varName}; ${iDeclaration.varName}++) {
      ${fragmentDeclaration.varName}.appendChild(${node.value}[${iDeclaration.varName}]);
    }
  `;
  
  fragmentDeclaration.content += buffer;

  return fragmentDeclaration;
}

const createTextNodeDeclaration = (statement: string, expr: PCExpression, context: TranspileContext) => createNodeDeclaration(`document.createTextNode(${statement})`, expr, context);

const createNodeDeclaration = (statement: string, expr: PCExpression, context: TranspileContext) => {
  let declaration = declareNode(statement, context);
  declaration
  if (expr) {
    addDeclarationSourceReference(declaration, expr, context);
  }
  return declaration;
};

const getTranspileContent = (result: Declaration | string) => typeof result === "string" ? result : result.content;

const declareNode = (assignment: string, context: TranspileContext) => declare("node", assignment, context);

const declare = (baseName: string, assignment: string, context: TranspileContext): Declaration => {
  const varName = `${baseName}_${context.varCount++}`;
  return {
    varName,
    content: assignment ? `var ${varName} = ${assignment};\n` : `var ${varName};`
  };
};

const addDeclarationProperty = (declaration: Declaration, propertyName: string, assignment: string, context: TranspileContext): Declaration => {
  declaration.content += `${declaration.varName}.${propertyName} = ${assignment};\n`;
  return declaration;
};

const callDeclarationProperty = (declaration: Declaration, propertyName: string, args: string, context: TranspileContext): Declaration => {
  declaration.content += `${declaration.varName}.${propertyName}(${args});\n`;
  return declaration;
};

const addDeclarationSourceReference = (declaration: Declaration, expression: PCExpression, context: TranspileContext) => {
  // const nodePath = getExpressionPath(expression, context.root);

  const buffer = JSON.stringify({
    uri: context.uri,
    fingerprint: md5(context.source),
    type: expression.type,
    ...expression.location,
  });

  // let buffer = `${SOURCE_AST_VAR}`;

  // for (const part of nodePath) {
  //   if (typeof part === "number") {
  //     buffer += `[${part}]`;
  //   } else if (typeof part === "string") {
  //     buffer += `.${part}`;
  //   }
  // }
  addDeclarationProperty(declaration, "source", buffer, context);
}