"use strict";
// infer based on styles
// show how each ref extends attribute it's being assigned to
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
var ast_1 = require("./ast");
var parser_utils_1 = require("./parser-utils");
var utils_1 = require("./utils");
var InferenceType;
(function (InferenceType) {
    InferenceType[InferenceType["OBJECT"] = 1] = "OBJECT";
    InferenceType[InferenceType["ARRAY"] = 2] = "ARRAY";
    InferenceType[InferenceType["STRING"] = 4] = "STRING";
    InferenceType[InferenceType["NUMBER"] = 8] = "NUMBER";
    InferenceType[InferenceType["BOOLEAN"] = 16] = "BOOLEAN";
    InferenceType[InferenceType["PRIMITIVE"] = 28] = "PRIMITIVE";
    InferenceType[InferenceType["ANY"] = 31] = "ANY";
    InferenceType[InferenceType["OBJECT_OR_ARRAY"] = 3] = "OBJECT_OR_ARRAY";
})(InferenceType = exports.InferenceType || (exports.InferenceType = {}));
;
exports.EACH_KEY = "$$each";
exports.EAT_KEY = "$$eat";
var createAnyInference = function () { return ({ type: InferenceType.ANY, properties: {} }); };
exports.ANY_REFERENCE = createAnyInference();
// TODO - accept alias here. Also, do not use DependencyGraph - instead use registeredComponents
exports.inferNodeProps = utils_1.weakMemo(function (element, filePath, options) {
    if (options === void 0) { options = {}; }
    var _a = inferNode(element, createInferenceContext(filePath, options)), diagnostics = _a.diagnostics, inference = _a.inference;
    return { diagnostics: diagnostics, inference: inference };
});
var createInferenceContext = function (filePath, options) { return ({
    filePath: filePath,
    options: options,
    inference: createAnyInference(),
    diagnostics: [],
    currentScopes: {},
    typeLimit: InferenceType.ANY
}); };
var inferNode = function (expr, context) {
    switch (expr.type) {
        case ast_1.PCExpressionType.BLOCK: return inferDynamicTextNode(expr, context);
        case ast_1.PCExpressionType.FRAGMENT: return inferFragment(expr, context);
        case ast_1.PCExpressionType.SELF_CLOSING_ELEMENT:
        case ast_1.PCExpressionType.ELEMENT: return inferElement(expr, context);
    }
    return context;
};
var inferStartTag = function (startTag, context) {
    var attributes = startTag.attributes, name = startTag.name, modifiers = startTag.modifiers;
    for (var i = 0, length_1 = modifiers.length; i < length_1; i++) {
        var modifier = modifiers[i].value;
        if (modifier.type === ast_1.BKExpressionType.IF || modifier.type === ast_1.BKExpressionType.ELSEIF || modifier.type === ast_1.BKExpressionType.BIND) {
            context = inferExprType(modifier, setTypeLimit(InferenceType.ANY, null, context));
        }
    }
    for (var i = 0, length_2 = attributes.length; i < length_2; i++) {
        context = inferAttribute(startTag, attributes[i], setTypeLimit(InferenceType.ANY, null, context));
    }
    return context;
};
var inferAttribute = function (startTag, _a, context) {
    var name = _a.name, value = _a.value;
    // TODO - check for reserved attribute types like href
    if (value) {
        context = inferAttributeValue(startTag, value, context);
    }
    return context;
};
var inferAttributeValue = function (startTag, value, context) {
    switch (value.type) {
        case ast_1.PCExpressionType.STRING: {
            return context;
        }
        case ast_1.PCExpressionType.STRING_BLOCK: {
            var block = value;
            for (var i = 0, length_3 = block.values.length; i < length_3; i++) {
                context = inferAttributeValue(startTag, block.values[i], setTypeLimit(InferenceType.PRIMITIVE, null, context));
            }
            return context;
        }
        case ast_1.PCExpressionType.BLOCK: {
            var block = value;
            return inferExprType(block.value, context);
        }
    }
    return context;
};
var inferElement = function (element, context) {
    var childNodes = [];
    var startTag;
    if (element.type === ast_1.PCExpressionType.SELF_CLOSING_ELEMENT) {
        childNodes = [];
        startTag = element;
    }
    else {
        var el = element;
        childNodes = el.childNodes;
        startTag = el.startTag;
    }
    if (context.options.ignoreTagNames && context.options.ignoreTagNames.indexOf(startTag.name) !== -1) {
        return context;
    }
    var modifiers = startTag.modifiers;
    var _repeat;
    for (var i = 0, length_4 = modifiers.length; i < length_4; i++) {
        var modifier = modifiers[i].value;
        if (modifier.type === ast_1.BKExpressionType.REPEAT) {
            _repeat = modifier;
            break;
        }
    }
    if (_repeat) {
        context = inferExprType(_repeat, setTypeLimit(InferenceType.ANY, null, context));
        context = setContextScope(_repeat.asValue.name, isReference(_repeat.each) ? exports.getReferenceKeyPath(_repeat.each).concat([exports.EACH_KEY]) : [exports.EAT_KEY], context);
    }
    context = inferStartTag(startTag, context);
    context = inferChildNodes(childNodes, context);
    if (_repeat) {
        context = removeContextScope(_repeat.asValue.name, context);
    }
    return context;
};
var isReference = function (expr) { return expr.type === ast_1.BKExpressionType.VAR_REFERENCE || expr.type === ast_1.BKExpressionType.PROP_REFERENCE; };
exports.getReferenceKeyPath = function (expr) { return expr.type === ast_1.BKExpressionType.VAR_REFERENCE ? [expr.name] : expr.path.map(function (ref) { return ref.name; }); };
var inferFragment = function (expr, context) { return inferChildNodes(expr.childNodes, context); };
var inferChildNodes = function (childNodes, context) {
    for (var i = 0, length_5 = childNodes.length; i < length_5; i++) {
        context = inferNode(childNodes[i], context);
    }
    return context;
};
var inferDynamicTextNode = function (expr, context) {
    return inferExprType(expr.value, setTypeLimit(InferenceType.ANY, null, context));
};
var inferExprType = function (expr, context) {
    switch (expr.type) {
        case ast_1.BKExpressionType.NUMBER: {
            if (!exports.isValidReturnType(InferenceType.NUMBER, context)) {
                return addInvalidTypeError(expr, InferenceType.NUMBER, context);
            }
            return setTypeLimit(InferenceType.NUMBER, null, context);
        }
        case ast_1.BKExpressionType.STRING: {
            if (!exports.isValidReturnType(InferenceType.STRING, context)) {
                return addInvalidTypeError(expr, InferenceType.STRING, context);
            }
            return setTypeLimit(InferenceType.STRING, null, context);
        }
        case ast_1.BKExpressionType.OPERATION: {
            var _a = expr, left = _a.left, operator = _a.operator, right = _a.right;
            var newTypeLimit = (/^[\*/\-%]$/.test(operator) ? InferenceType.NUMBER : context.typeLimit);
            if (!exports.isValidReturnType(newTypeLimit, context)) {
                return addInvalidTypeError(expr, newTypeLimit, context);
            }
            var previousTypeLimit = context.typeLimit;
            var leftTypeLimit = newTypeLimit;
            var rightTypeLimit = newTypeLimit;
            context = inferExprType(left, setTypeLimit(leftTypeLimit, "The left-hand side of an arithmetic operation must be " + exports.getPrettyTypeLabelEnd(newTypeLimit), context));
            context = inferExprType(right, operator !== "===" ? setTypeLimit(rightTypeLimit, "The right-hand side of an arithmetic operation must be " + exports.getPrettyTypeLabelEnd(context.typeLimit), context) : context);
            return context;
        }
        case ast_1.BKExpressionType.GROUP: {
            var value = expr.value;
            return inferExprType(value, context);
        }
        case ast_1.BKExpressionType.VAR_REFERENCE:
        case ast_1.BKExpressionType.PROP_REFERENCE: {
            var keypath = exports.getReferenceKeyPath(expr);
            context = reduceInferenceType(expr, keypath, context);
            return context;
        }
        case ast_1.BKExpressionType.BIND: {
            var value = expr.value;
            return inferExprType(value, context);
        }
        case ast_1.BKExpressionType.OBJECT: {
            var properties = expr.properties;
            for (var i = 0, length_6 = properties.length; i < length_6; i++) {
                var _b = properties[i], key = _b.key, value = _b.value;
                context = inferExprType(value, setTypeLimit(InferenceType.ANY, null, context));
            }
            return setTypeLimit(InferenceType.OBJECT, null, context);
        }
        case ast_1.BKExpressionType.NOT: {
            var value = expr.value;
            return setTypeLimit(InferenceType.BOOLEAN, null, inferExprType(value, setTypeLimit(InferenceType.ANY, null, context)));
        }
        case ast_1.BKExpressionType.ELSEIF:
        case ast_1.BKExpressionType.IF: {
            var condition = expr.condition;
            return inferExprType(condition, setTypeLimit(InferenceType.ANY, null, context));
        }
        case ast_1.BKExpressionType.REPEAT: {
            var each = expr.each;
            return inferExprType(each, context);
        }
        default: {
            return context;
        }
    }
};
var reduceInferenceType = function (expr, keyPath, context) {
    var newTypeLimit = getContextInferenceType(keyPath, context) & context.typeLimit;
    if (!exports.isValidReturnType(newTypeLimit, context)) {
        return addDiagnosticError(expr, context, context.typeLimitErrorMessage);
    }
    return setTypeLimit(newTypeLimit, context.typeLimitErrorMessage, setContextInferenceType(expr, keyPath, newTypeLimit, context));
};
var getContextInference = function (keyPath, context) {
    var scopedKeyPath = getScopedKeyPath(keyPath, context);
    return exports.getNestedInference(scopedKeyPath, context.inference);
};
exports.getNestedInference = function (keypath, context) {
    var current = context;
    for (var i = 0, length_7 = keypath.length; i < length_7; i++) {
        current = current.properties[keypath[i]];
        if (!current)
            return null;
    }
    return current;
};
var getContextInferenceType = function (keyPath, context, notFoundType) {
    if (notFoundType === void 0) { notFoundType = InferenceType.ANY; }
    var inference = getContextInference(keyPath, context);
    return inference ? inference.type : notFoundType;
};
var getLowestPropInference = function (keyPath, context, notFoundType) {
    if (notFoundType === void 0) { notFoundType = InferenceType.ANY; }
    var current = context.inference;
    for (var i = 0, length_8 = keyPath.length; i < length_8; i++) {
        var next = current.properties[keyPath[i]];
        if (!next)
            return current;
        current = next;
    }
    return current;
};
var getLowestPropInferenceType = function (keyPath, context, notFoundType) {
    if (notFoundType === void 0) { notFoundType = InferenceType.ANY; }
    var inference = getLowestPropInference(keyPath, context);
    return inference ? inference.type : notFoundType;
};
var setTypeLimit = function (typeLimit, typeLimitErrorMessage, context) { return (__assign({}, context, { typeLimit: typeLimit,
    typeLimitErrorMessage: typeLimitErrorMessage })); };
var updateNestedInference = function (keyPath, newProps, target, keyPathIndex) {
    if (keyPathIndex === void 0) { keyPathIndex = -1; }
    keyPathIndex++;
    if (keyPath.indexOf(exports.EAT_KEY) !== -1) {
        return target;
    }
    if (keyPathIndex === keyPath.length) {
        return __assign({}, target, newProps);
    }
    return __assign({}, target, { type: target.type & InferenceType.OBJECT_OR_ARRAY, properties: __assign({}, target.properties, (_a = {}, _a[keyPath[keyPathIndex]] = updateNestedInference(keyPath, newProps, target.properties[keyPath[keyPathIndex]] || createAnyInference(), keyPathIndex), _a)) });
    var _a;
};
exports.getTypeLabels = function (type) {
    var labels = [];
    if (type & InferenceType.ARRAY) {
        labels.push("array");
    }
    if (type & InferenceType.OBJECT) {
        labels.push("object");
    }
    if (type & InferenceType.STRING) {
        labels.push("string");
    }
    if (type & InferenceType.NUMBER) {
        labels.push("number");
    }
    if (type & InferenceType.BOOLEAN) {
        labels.push("boolean");
    }
    return labels;
};
exports.getPrettyTypeLabelEnd = function (type) {
    var labels = exports.getTypeLabels(type);
    return labels.length === 1 ? "a " + labels[0] : "an " + labels.slice(0, labels.length - 1).join(", ") + ", or " + labels[labels.length - 1];
};
var assertCanSetNestedProperty = function (keyPath, expr, context) {
    var current = context.inference;
    for (var i = 0, length_9 = keyPath.length; i < length_9 - 1; i++) {
        current = current.properties[keyPath[i]];
        if (!current) {
            return context;
        }
        if (!(current.type & InferenceType.OBJECT_OR_ARRAY)) {
            context = addDiagnosticError(expr, setTypeLimit(context.typeLimit, null, context), "Cannot call property \"" + keyPath.slice(i + 1).join(".") + "\" on primitive \"" + keyPath.slice(0, i + 1).join(".") + "\"");
        }
    }
    return context;
};
var setContextInferenceType = function (expr, keyPath, type, context) {
    // TODO - get current scope
    context = assertCanSetNestedProperty(keyPath, expr, context);
    return updateContextInference(updateNestedInference(getScopedKeyPath(keyPath, context), { type: type }, context.inference), context);
};
var setContextScope = function (name, keyPath, context) {
    return (__assign({}, context, { currentScopes: __assign({}, context.currentScopes, (_a = {}, _a[name] = keyPath, _a)) }));
    var _a;
};
var EMPTY_ARRAY = [];
var getContextScope = function (name, context) { return context.currentScopes[name] || EMPTY_ARRAY; };
var getScopedKeyPath = function (keyPath, context) {
    var scope = context.currentScopes[keyPath[0]];
    return scope ? getScopedKeyPath(scope, context).concat(keyPath.slice(1)) : keyPath;
};
var removeContextScope = function (name, context) {
    return (__assign({}, context, { currentScopes: __assign({}, context.currentScopes, (_a = {}, _a[name] = null, _a)) }));
    var _a;
};
var updateContextInference = function (inference, context) { return (__assign({}, context, { inference: inference })); };
exports.isValidReturnType = function (type, _a) {
    var typeLimit = _a.typeLimit;
    return Boolean(type & typeLimit);
};
var addInvalidTypeError = function (expr, type, context) { return addDiagnosticError(expr, context, context.typeLimitErrorMessage || "Type mismatch " + type + " to " + context.typeLimit); };
var addDiagnosticError = function (expr, context, message) { return addDiagnostic(expr, parser_utils_1.DiagnosticType.ERROR, context, message); };
var addDiagnosticWarning = function (expr, context, message) { return addDiagnostic(expr, parser_utils_1.DiagnosticType.WARNING, context, message); };
var addDiagnostic = function (expr, level, context, message) { return (__assign({}, context, { diagnostics: context.diagnostics.concat([{
            type: parser_utils_1.DiagnosticType.ERROR,
            location: expr.location,
            message: message,
            filePath: context.filePath
        }]) })); };
//# sourceMappingURL=inferencing.js.map