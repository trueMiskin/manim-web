import type { HighlighterCore } from 'shiki/core';
import type { Token, TokenType } from './CodeHighlighting';

// Explicit imports limit browser chunks to supported grammars. Going through
// Shiki's re-exports keeps their versions aligned with its core and JS engine.
const languageLoaders = {
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  go: () => import('shiki/langs/go.mjs'),
};

type Language = keyof typeof languageLoaders;

const aliases = new Map<string, Language>([
  ...Object.keys(languageLoaders).map((name): [string, Language] => [name, name as Language]),
  ['c++', 'cpp'],
  ['cxx', 'cpp'],
  ['cc', 'cpp'],
  ['js', 'javascript'],
  ['ts', 'typescript'],
  ['py', 'python'],
  ['python3', 'python'],
  ['rs', 'rust'],
  ['golang', 'go'],
]);

const scopeCategories: ReadonlyArray<readonly [RegExp, TokenType]> = [
  [/^(?:comment|punctuation\.definition\.comment)(?:\.|$)/, 'comment'],
  [/^(?:string|constant\.character|punctuation\.definition\.string)(?:\.|$)/, 'string'],
  [/^constant\.numeric(?:\.|$)/, 'number'],
  [/^keyword\.operator(?:\.|$)/, 'operator'],
  [/^(?:keyword|constant\.language)(?:\.|$)/, 'keyword'],
  [/^(?:entity\.name|support|variable)\.function(?:\.|$)/, 'function'],
  [
    /^(?:storage\.type\.(?:primitive|built-in|numeric|integral|floating-point|boolean)|support\.(?:type|class)|entity\.name\.(?:type|class|struct|enum|interface|trait))(?:\.|$)/,
    'type',
  ],
  [/^storage(?:\.|$)/, 'keyword'],
  [/^punctuation(?:\.|$)/, 'punctuation'],
];

let highlighterPromise: Promise<HighlighterCore> | undefined;
const languagePromises = new Map<Language, Promise<void>>();

function getHighlighter(): Promise<HighlighterCore> {
  return (highlighterPromise ??= Promise.all([
    import('shiki/core'),
    import('shiki/engine/javascript'),
  ])
    .then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        engine: createJavaScriptRegexEngine(),
        langs: [],
        // Grammar scopes are sufficient: the canvas owns colors and font style.
        themes: [],
      }),
    )
    .catch((error: unknown) => {
      highlighterPromise = undefined;
      throw error;
    }));
}

function loadLanguage(language: Language, highlighter: HighlighterCore): Promise<void> {
  let pending = languagePromises.get(language);
  if (!pending) {
    pending = languageLoaders[language]()
      .then((grammar) => highlighter.loadLanguage(grammar.default))
      .catch((error: unknown) => {
        languagePromises.delete(language);
        throw error;
      });
    languagePromises.set(language, pending);
  }
  return pending;
}

function category(scopes: readonly string[]): TokenType {
  // The innermost specific scope wins. In particular, meta.function enclosing
  // a whole body must not turn its strings, comments or arguments into functions.
  for (let index = scopes.length - 1; index >= 0; index--) {
    const match = scopeCategories.find(([pattern]) => pattern.test(scopes[index]));
    if (match) return match[1];
  }
  return 'default';
}

/**
 * Tokenize a complete document with grammar state shared across its canvas lines.
 * @post result.map(line => line.map(token => token.text).join('')).join('\n') === source
 * @post result.every(line => line.every(token => token.text.length > 0))
 * @note Unsupported languages use plain text without loading a grammar or engine.
 */
export async function tokenizeCode(source: string, language: string): Promise<Token[][]> {
  const canonical = aliases.get(language.trim().toLowerCase());
  if (!canonical)
    return source.split('\n').map((text) => (text ? [{ type: 'default', text }] : []));
  const highlighter = await getHighlighter();
  await loadLanguage(canonical, highlighter);
  const grammar = highlighter.getLanguage(canonical);
  let state: ReturnType<typeof grammar.tokenizeLine>['ruleStack'] | null = null;
  return source.split('\n').map((line) => {
    // One scope pass with no time budget: a cold grammar must not yield partial
    // results. Carry state across every line for comments and multiline strings.
    const result = grammar.tokenizeLine(line, state, 0);
    state = result.ruleStack;
    const tokens: Token[] = [];
    for (const token of result.tokens) {
      const text = line.slice(token.startIndex, token.endIndex);
      if (!text) continue;
      const type = category(token.scopes);
      const previous = tokens[tokens.length - 1];
      if (previous?.type === type) previous.text += text;
      else tokens.push({ type, text });
    }
    return tokens;
  });
}
