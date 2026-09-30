/** Canvas token categories and palette contracts shared by all code highlighters. */

/**
 * Token types for syntax highlighting
 */
export type TokenType =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'function'
  | 'operator'
  | 'punctuation'
  | 'type'
  | 'default';

/**
 * A token with its type and text
 */
export interface Token {
  type: TokenType;
  text: string;
}

/**
 * Color scheme for syntax highlighting
 */
export interface CodeColorScheme {
  keyword: string;
  string: string;
  comment: string;
  number: string;
  function: string;
  operator: string;
  punctuation: string;
  type: string;
  default: string;
  background: string;
  lineNumber: string;
}

/**
 * Default color scheme (VS Code dark theme inspired)
 */
export const DEFAULT_COLOR_SCHEME: CodeColorScheme = {
  keyword: '#569cd6', // Blue
  string: '#6a9955', // Green
  comment: '#6a9955', // Gray-green (comments)
  number: '#b5cea8', // Light green (numbers)
  function: '#dcdcaa', // Yellow
  operator: '#d4d4d4', // Light gray
  punctuation: '#d4d4d4', // Light gray
  type: '#4ec9b0', // Cyan
  default: '#d4d4d4', // White/light gray
  background: '#1e1e1e', // Dark background
  lineNumber: '#858585', // Gray for line numbers
};

/**
 * Monokai color scheme
 */
export const MONOKAI_COLOR_SCHEME: CodeColorScheme = {
  keyword: '#f92672', // Pink
  string: '#e6db74', // Yellow
  comment: '#75715e', // Gray
  number: '#ae81ff', // Purple
  function: '#a6e22e', // Green
  operator: '#f8f8f2', // White
  punctuation: '#f8f8f2', // White
  type: '#66d9ef', // Cyan
  default: '#f8f8f2', // White
  background: '#272822', // Dark background
  lineNumber: '#75715e', // Gray
};
