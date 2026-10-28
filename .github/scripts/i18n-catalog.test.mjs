import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { compileTemplate, parse } from '@vue/compiler-sfc';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);

function parseTypescript(source, filename) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.deepEqual(tree.parseDiagnostics, [], `Invalid TypeScript in ${filename}`);
  return tree;
}

function unwrap(expression) {
  while (expression && (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression))) {
    expression = expression.expression;
  }
  return expression;
}

function literalKeys(expression) {
  const node = unwrap(expression);
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isConditionalExpression(node)) return [...literalKeys(node.whenTrue), ...literalKeys(node.whenFalse)];
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
    return [...literalKeys(node.left), ...literalKeys(node.right)];
  }
  // Runtime values (provider errors, status maps, interpolated template keys)
  // cannot be enumerated statically. Their literal fallbacks/conditional arms
  // are checked above; behavior for unknown keys is covered by locale tests.
  return [];
}

function translationCalls(source, filename) {
  const tree = parseTypescript(source, filename);
  const keys = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if ((ts.isIdentifier(callee) && callee.text === 't') || (ts.isPropertyAccessExpression(callee) && callee.name.text === 't')) {
        for (const key of literalKeys(node.arguments[0])) keys.push({ key, filename });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return keys;
}

function vueTranslationCalls(source, filename) {
  const { descriptor, errors } = parse(source, { filename });
  assert.deepEqual(errors, [], `Invalid Vue component ${filename}`);
  const keys = [];
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (block) keys.push(...translationCalls(block.content, filename));
  }
  if (descriptor.template) {
    const compiled = compileTemplate({
      source: descriptor.template.content,
      filename,
      id: filename,
      transformAssetUrls: false,
      compilerOptions: { expressionPlugins: ['typescript'] },
    });
    assert.deepEqual(compiled.errors, [], `Invalid template ${filename}`);
    keys.push(...translationCalls(compiled.code, `${filename} (template)`));
  }
  return keys;
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(new URL(directory, root), { withFileTypes: true })) {
    const path = `${directory}${entry.name}`;
    if (entry.isDirectory()) files.push(...sourceFiles(`${path}/`));
    else if (/\.(?:vue|ts)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function variableInitializer(tree, name) {
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) initializer = unwrap(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(initializer && ts.isObjectLiteralExpression(initializer), `${name} must be a literal message catalog`);
  return initializer;
}

function catalogEntries() {
  // Follow the actual catalog merge so an unused file cannot accidentally make
  // a missing runtime translation pass this test.
  const filename = 'lib/i18n/messages.ts';
  const tree = parseTypescript(readFileSync(new URL(filename, root), 'utf8'), filename);
  const imports = new Map();
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const path = statement.moduleSpecifier.text.replace(/^~\//, '');
    for (const binding of bindings.elements) {
      imports.set(binding.name.text, { path: `${path}.ts`, exportName: binding.propertyName?.text ?? binding.name.text });
    }
  }
  const entries = [];
  for (const property of variableInitializer(tree, 'frenchMessages').properties) {
    assert.ok(ts.isSpreadAssignment(property) && ts.isIdentifier(property.expression), 'Register message catalogs with named spreads');
    const imported = imports.get(property.expression.text);
    assert.ok(imported, `No import for catalog ${property.expression.text}`);
    const domainTree = parseTypescript(readFileSync(new URL(imported.path, root), 'utf8'), imported.path);
    for (const entry of variableInitializer(domainTree, imported.exportName).properties) {
      assert.ok(ts.isPropertyAssignment(entry), `${imported.path}: catalog entries must be literal properties`);
      const key = ts.isIdentifier(entry.name) ? entry.name.text : literalKeys(entry.name)[0];
      const value = unwrap(entry.initializer);
      assert.ok(typeof key === 'string' && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)), `${imported.path}: catalog entries must be literal strings`);
      assert.ok(value.text.trim(), `${imported.path}: empty translation for ${JSON.stringify(key)}`);
      entries.push({ key, value: value.text, filename: imported.path });
    }
  }
  assert.ok(entries.length > 0, 'The French message catalog must not be empty');
  return entries;
}

function placeholders(value) {
  return [...new Set([...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort();
}

test('translation scanner handles Vue expressions, escaped quotes and conditional literal keys', () => {
  const source = String.raw`<template><p :title="t(ready ? 'Ready' : 'Please wait')">{{ t('Don\'t stop') }}</p></template>
<script setup lang="ts">const sample = "t('not a call')"; const label = t(problem ?? 'Try again');</script>`;
  const keys = vueTranslationCalls(source, 'scanner-fixture.vue').map(call => call.key).sort();
  assert.deepEqual(keys, ["Don't stop", 'Please wait', 'Ready', 'Try again'].sort());
});

test('every literal UI translation key has a French catalog entry', () => {
  const french = new Set(catalogEntries().map(entry => entry.key));
  const missing = [];
  for (const filename of ['pages/', 'components/', 'composables/'].flatMap(sourceFiles)) {
    const source = readFileSync(new URL(filename, root), 'utf8');
    const calls = filename.endsWith('.vue') ? vueTranslationCalls(source, filename) : translationCalls(source, filename);
    for (const { key, filename: location } of calls) {
      if (!french.has(key)) missing.push(`${location}: ${JSON.stringify(key)}`);
    }
  }
  assert.deepEqual([...new Set(missing)].sort(), [], 'Add missing French translations to a registered catalog');
});

test('French translations preserve every interpolation placeholder', () => {
  const mismatches = catalogEntries().filter(entry => JSON.stringify(placeholders(entry.key)) !== JSON.stringify(placeholders(entry.value)));
  assert.deepEqual(mismatches, [], 'Translation parameters must match their English source');
});

test('duplicate keys across message domains have the same French translation', () => {
  const seen = new Map();
  const conflicts = [];
  for (const entry of catalogEntries()) {
    const previous = seen.get(entry.key);
    if (previous && previous.value !== entry.value) conflicts.push({ key: entry.key, first: previous, second: entry });
    else seen.set(entry.key, entry);
  }
  assert.deepEqual(conflicts, [], 'Catalog merge order must not change a translation');
});
