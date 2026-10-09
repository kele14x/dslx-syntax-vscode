const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { before, test } = require('node:test');
const { Registry, INITIAL, parseRawGrammar } = require('vscode-textmate');
const { loadWASM, OnigScanner, OnigString } = require('vscode-oniguruma');

const root = path.resolve(__dirname, '..');
let grammar;
let rawGrammar;

before(async () => {
  const wasm = await fs.readFile(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const filename = path.join(root, 'syntaxes/dslx.tmLanguage.json');
  rawGrammar = parseRawGrammar(await fs.readFile(filename, 'utf8'), filename);
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new OnigScanner(patterns),
      createOnigString: (value) => new OnigString(value),
    }),
    loadGrammar: async (scope) => scope === 'source.dslx' ? rawGrammar : null,
  });
  grammar = await registry.loadGrammar('source.dslx');
});

function tokenize(source) {
  let stack = INITIAL;
  return source.split('\n').map((line) => {
    const result = grammar.tokenizeLine(line, stack);
    stack = result.ruleStack;
    return { line, ...result };
  });
}

function scopesAt(source, needle, occurrence = 0) {
  let offset = -1;
  for (let i = 0; i <= occurrence; i++) offset = source.indexOf(needle, offset + 1);
  assert.notEqual(offset, -1, `Missing fixture text ${needle}`);
  const prefix = source.slice(0, offset);
  const lineIndex = prefix.split('\n').length - 1;
  const column = offset - prefix.lastIndexOf('\n') - 1;
  const { tokens } = tokenize(source)[lineIndex];
  const token = tokens.find((item) => item.startIndex <= column && item.endIndex > column);
  assert.ok(token, `Missing token at ${needle}`);
  return token.scopes;
}

function hasScope(source, needle, scope, occurrence = 0) {
  const scopes = scopesAt(source, needle, occurrence);
  assert.ok(scopes.includes(scope), `${needle}: expected ${scope}, got ${scopes.join(' ')}`);
}

test('manifest contributes a self-contained, runtime-free DSLX grammar', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.main, undefined);
  assert.equal(manifest.browser, undefined);
  assert.equal(manifest.dependencies, undefined);
  assert.deepEqual(manifest.contributes.languages[0].extensions, ['.x', '.dslx']);
  assert.equal(manifest.contributes.grammars[0].scopeName, rawGrammar.scopeName);
  for (const filename of [manifest.contributes.languages[0].configuration, manifest.contributes.grammars[0].path]) {
    await fs.access(path.join(root, filename));
  }
  function checkIncludes(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.include === 'string' && value.include.startsWith('#')) {
      assert.ok(rawGrammar.repository[value.include.slice(1)], `Unresolved ${value.include}`);
    }
    Object.values(value).forEach(checkIncludes);
  }
  checkIncludes(rawGrammar);
});

test('includes Marketplace metadata, documentation and matching lockfile metadata', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(manifest.publisher, 'kele14x');
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.repository.type, 'git');
  assert.equal(manifest.repository.url, 'https://github.com/kele14x/dslx-syntax-vscode.git');
  assert.equal(lockfile.version, manifest.version);
  assert.equal(lockfile.packages[''].version, manifest.version);
  assert.equal(lockfile.packages[''].license, manifest.license);
  assert.match(await fs.readFile(path.join(root, 'LICENSE'), 'utf8'), /^MIT License\n/);
  await fs.access(path.join(root, 'README.md'));
});

test('highlights declarations, imports, control flow and booleans', () => {
  const source = 'pub fn add(x: u32) -> u32 { if true { x } else { u32:0 } }\nstruct Packet { payload: u8 }\nenum Mode : u2 { IDLE = 0 }\ntype Word = u32;\nimport std;\nuse std::clog2;';
  hasScope(source, 'pub', 'storage.modifier.dslx');
  hasScope(source, 'fn', 'storage.type.function.dslx');
  hasScope(source, 'add', 'entity.name.function.dslx');
  for (const name of ['Packet', 'Mode', 'Word']) hasScope(source, name, 'entity.name.type.dslx');
  for (const keyword of ['if', 'else']) hasScope(source, keyword, 'keyword.control.dslx');
  hasScope(source, 'true', 'constant.language.boolean.dslx');
  hasScope(source, 'import', 'keyword.control.import.dslx');
  hasScope(source, 'use', 'keyword.control.import.dslx');
});

test('highlights DSLX bit types and typed literals', () => {
  const source = 'u1 u32 u64 s1 s32 s64 bool bits[8] uN[128] sN[65] xN[bool:0][32] token chan<u32>\nu32:0xff s8:-42 u8:0b1010_0011 1000';
  for (const type of ['u1', 'u32', 'u64', 's1', 's32', 's64', 'bool', 'bits', 'uN', 'sN', 'xN', 'token', 'chan']) {
    hasScope(source, type, 'support.type.builtin.dslx');
  }
  hasScope(source, '0xff', 'constant.numeric.hex.dslx');
  hasScope(source, '0b1010_0011', 'constant.numeric.binary.dslx');
  hasScope(source, '42', 'constant.numeric.decimal.dslx');
  hasScope(source, '1000', 'constant.numeric.decimal.dslx');
});

test('does not apply keyword or type rules to identifier prefixes', () => {
  for (const name of ['if_ready', 'true_value', 'u32_data', 'uN_count', 'bits_per_word', "if'", "u32'", 's64_counter']) {
    const scopes = scopesAt(name, name);
    assert.equal(scopes.at(-1), 'variable.other.dslx', name);
  }
});

test('highlights proc and channel constructs', () => {
  const source = 'proc Counter { output: chan<u32> out; config(output: chan<u32> out) { (output,) } init { u32:0 } next(state: u32) { let tok = join(); send(tok, output, state); state + u32:1 } }\nspawn Counter(tx);';
  hasScope(source, 'Counter', 'entity.name.type.dslx');
  for (const keyword of ['config', 'init', 'next', 'spawn']) hasScope(source, keyword, 'keyword.control.dslx');
  hasScope(source, 'out;', 'storage.modifier.dslx');
  for (const builtin of ['join', 'send']) hasScope(source, builtin, 'support.function.builtin.dslx');
});

test('handles test attributes and nested brackets without swallowing later code', () => {
  const source = '#![allow(nonstandard_constant_naming)]\n#[quickcheck(test_count = 100)]\n#[sv_type("logic [7:0]")]\nfn check() { assert_eq(u32:1, u32:1); }';
  for (const attribute of ['allow', 'quickcheck', 'sv_type']) hasScope(source, attribute, 'entity.other.attribute-name.dslx');
  hasScope(source, '100', 'constant.numeric.decimal.dslx');
  hasScope(source, 'logic', 'string.quoted.double.dslx');
  hasScope(source, 'check()', 'entity.name.function.dslx');
  assert.ok(!scopesAt(source, 'fn').includes('meta.attribute.dslx'));
});

test('recognizes macros and qualified calls', () => {
  const source = 'trace_fmt!("value={}", x); fail!("bad", x); const_assert!(N > u32:0); unroll_for! (i, acc) in u32:0..u32:4 { acc + i }(u32:0); std::clog2(u32:8);';
  for (const macro of ['trace_fmt', 'fail', 'const_assert', 'unroll_for']) hasScope(source, macro, 'entity.name.function.macro.dslx');
  hasScope(source, 'std', 'entity.name.namespace.dslx');
  hasScope(source, 'clog2', 'entity.name.function.dslx');
});

test('line comments do not leak to the next line or parse embedded keywords', () => {
  const source = '// fn fake() { "ignored" }\nfn real() { u32:1 }';
  hasScope(source, 'fake', 'comment.line.double-slash.dslx');
  hasScope(source, 'real', 'entity.name.function.dslx');
  assert.ok(!scopesAt(source, 'real').some((scope) => scope.startsWith('comment.')));
});

test('strings protect comment markers and highlight escape sequences', () => {
  const source = '"hello // world\\n\\x41\\u{1f600}\\\""; let value = u8:1;';
  hasScope(source, '//', 'string.quoted.double.dslx');
  for (const escape of ['\\n', '\\x41', '\\u{1f600}', '\\"']) hasScope(source, escape, 'constant.character.escape.dslx');
  hasScope(source, 'let', 'storage.type.dslx');
});

test('distinguishes character literals from primed identifiers', () => {
  const source = "'a' '\\n' '\\x41' let value' = old_value''; fn tick'(value': u8) { value' }";
  for (const character of ["'a'", "'\\n'", "'\\x41'"]) hasScope(source, character, 'string.quoted.single.dslx');
  hasScope(source, "value'", 'variable.other.dslx');
  hasScope(source, "old_value''", 'variable.other.dslx');
  hasScope(source, "tick'", 'entity.name.function.dslx');
});

test('supports multiline backtick strings and their escape sequences', () => {
  const source = '`fn fake() // text\n"quoted" \\n\\x60`\nfn real() { u32:1 }';
  hasScope(source, 'fake', 'string.quoted.other.backtick.dslx');
  hasScope(source, 'quoted', 'string.quoted.other.backtick.dslx');
  hasScope(source, '\\n', 'constant.character.escape.dslx');
  hasScope(source, '\\x60', 'constant.character.escape.dslx');
  hasScope(source, 'real', 'entity.name.function.dslx');
});

test('highlights bit slicing, concatenation, ranges and shifts', () => {
  const source = 'value[u32:0+:u8] ++ other; a << u32:1; b >> u32:2; u32:0..u32:4; x => y; x -> y; a != b && c || d;';
  for (const operator of ['+:', '++', '<<', '>>', '..', '=>', '->', '!=', '&&', '||']) hasScope(source, operator, 'keyword.operator.dslx');
});

test('does not inherit Rust-only keywords, types, lifetimes or block comments', () => {
  for (const identifier of ['async', 'await', 'unsafe', 'crate', 'mod', 'i32', 'usize', 'macro_rules', 'u0', 'u65', 'u128', 's128', 'u01']) {
    assert.equal(scopesAt(identifier, identifier).at(-1), 'variable.other.dslx');
  }
  assert.ok(!scopesAt('/* ordinary tokens */', 'ordinary').some((scope) => scope.startsWith('comment.')));
  assert.ok(!scopesAt("'lifetime", 'lifetime').some((scope) => scope.includes('lifetime')));
});

test('covers every current scanner keyword and sized type', () => {
  const keywords = ['as', 'const', 'else', 'enum', 'false', 'fn', 'for', 'if', 'impl', 'import', 'in', 'out', 'let', 'match', 'pub', 'proc', 'self', 'struct', 'trait', 'true', 'type', 'unroll_for!', 'use', 'mut'];
  for (const keyword of keywords) {
    assert.notEqual(scopesAt(keyword, keyword).at(-1), 'variable.other.dslx', keyword);
  }
  for (const prefix of ['u', 's']) {
    for (let width = 1; width <= 64; width++) {
      const type = `${prefix}${width}`;
      hasScope(type, type, 'support.type.builtin.dslx');
    }
  }
  hasScope('Self', 'Self', 'support.type.builtin.dslx');
});

test('supports impl-style procs, traits and mutable bindings', () => {
  const source = 'trait Echo {}\nproc Loopback<N: u32> { input: chan<uN[N]> in, }\nimpl Loopback<N> { fn new(input: chan<uN[N]> in) -> Self { Loopback { input: input } } fn next(self) { let mut value = u32:0; value } }';
  hasScope(source, 'Echo', 'entity.name.type.dslx');
  hasScope(source, 'Loopback', 'entity.name.type.dslx');
  hasScope(source, 'impl', 'storage.type.dslx');
  hasScope(source, 'new', 'entity.name.function.dslx');
  hasScope(source, 'next', 'entity.name.function.dslx');
  hasScope(source, 'self', 'variable.language.dslx');
  hasScope(source, 'Self', 'support.type.builtin.dslx');
  hasScope(source, 'mut', 'storage.modifier.dslx');
});

test('supports declarations split across lines and comments', () => {
  const source = 'fn // declaration\nexample<N: u32>(value: uN[N]) -> uN[N] { value }\nstruct\nPacket { payload: u8 }';
  hasScope(source, 'declaration', 'comment.line.double-slash.dslx');
  hasScope(source, 'example', 'entity.name.function.dslx');
  hasScope(source, 'Packet', 'entity.name.type.dslx');
});

test('keeps bang and apostrophe identifiers intact', () => {
  for (const name of ["a'b", 'foo!bar', 'if!bar', 'u32!bar', "trace!'next", "unroll_for!'"]) {
    assert.equal(scopesAt(name, name).at(-1), 'variable.other.dslx', name);
    const tokens = tokenize(name)[0].tokens;
    assert.equal(tokens.length, 1, name);
    assert.equal(tokens[0].endIndex, name.length, name);
  }
  hasScope("'loop_label: example()", "'loop_label", 'entity.name.label.dslx');
});

test('handles nested attribute arguments and incomplete editing states', () => {
  const source = '#[example(values = [1, [2, 3]])]\nfn following() {}';
  hasScope(source, 'following', 'entity.name.function.dslx');
  assert.ok(!scopesAt(source, 'fn').includes('meta.attribute.dslx'));
  for (const incomplete of ['fn', '#[test', '"unterminated', '`unterminated', 'fn example<N: u32>(']) {
    assert.equal(tokenize(incomplete)[0].stoppedEarly, false);
  }
  const multiline = '"first\nsecond"\nfn after() {}';
  hasScope(multiline, 'second', 'string.quoted.double.dslx');
  hasScope(multiline, 'after', 'entity.name.function.dslx');
});

test('rejects unsupported escape sequences', () => {
  hasScope('"\\q"', '\\q', 'invalid.illegal.escape.dslx');
  hasScope('`\\u{1234567}`', '\\u', 'invalid.illegal.escape.dslx');
});

test('editor configuration supports primes without Rust-style quote pairing', async () => {
  const config = JSON.parse(await fs.readFile(path.join(root, 'language-configuration.json'), 'utf8'));
  assert.equal(config.comments.lineComment, '//');
  assert.equal(config.comments.blockComment, undefined);
  assert.ok(!config.autoClosingPairs.some((pair) => ["'", '<'].includes(pair.open)));
  assert.deepEqual("counter''".match(new RegExp(config.wordPattern, 'g')), ["counter''"]);
});

test('tokenizes the complete example and returns to the root scope', async () => {
  const source = await fs.readFile(path.join(root, 'examples/highlighting.x'), 'utf8');
  const lines = tokenize(source);
  assert.ok(lines.length > 30);
  for (const { line, tokens, stoppedEarly } of lines) {
    assert.equal(stoppedEarly, false);
    if (line.length) {
      assert.equal(tokens[0].startIndex, 0);
      assert.ok(tokens.at(-1).endIndex >= line.length);
    }
  }
  assert.equal(lines.at(-1).ruleStack.depth, 1);
});
