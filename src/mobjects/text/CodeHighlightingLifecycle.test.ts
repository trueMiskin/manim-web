import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Code } from './Code';
import { tokenizeCode } from './CodeHighlighter';
import type { Token } from './CodeHighlighting';
import { logger } from '../../utils/logger';

vi.mock('./CodeHighlighter', () => ({ tokenizeCode: vi.fn() }));

function deferredTokens() {
  let resolve!: (tokens: Token[][]) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Token[][]>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(tokenizeCode).mockReset();
  vi.mocked(tokenizeCode).mockImplementation(async (source) =>
    source.split('\n').map((text) => [{ text, type: 'default' }]),
  );
});

describe('Code highlighting readiness', () => {
  // MIGRATION: awaiting readiness always follows the latest source/language;
  // earlier completion cannot overwrite it and frame synchronization is cached.
  it('follows newer edits without waiting for superseded requests', async () => {
    const first = deferredTokens();
    const second = deferredTokens();
    const latest = deferredTokens();
    vi.mocked(tokenizeCode)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(latest.promise);
    const code = new Code({ code: 'first', language: 'cpp' });
    const ready = code.waitForRender();
    expect(code.setCode('latest').setLanguage('typescript')).toBe(code);
    latest.resolve([[{ text: 'latest', type: 'function' }]]);
    await ready;
    const expected = [{ text: 'latest', type: 'function' }];
    expect(code.getLineOfCode(1)?.tokens).toEqual(expected);
    first.resolve([[{ text: 'first', type: 'comment' }]]);
    second.resolve([[{ text: 'stale', type: 'string' }]]);
    await Promise.all([first.promise, second.promise]);
    expect(code.getLineOfCode(1)?.tokens).toEqual(expected);
    code._syncToThree();
    code._syncToThree();
    expect(tokenizeCode).toHaveBeenCalledTimes(3);
    const copy = code.copy();
    expect(copy.getLineOfCode(1)?.tokens).toEqual(expected);
    expect(copy.getLineOfCode(1)?.tokens).not.toBe(code.getLineOfCode(1)?.tokens);
  });

  // MIGRATION: disposal cancels outstanding readiness and prevents late results
  // from changing the disposed object's public token state.
  it('releases pending waits and ignores late results after disposal', async () => {
    const pending = deferredTokens();
    vi.mocked(tokenizeCode).mockReturnValueOnce(pending.promise);
    const code = new Code({ code: 'value', language: 'cpp' });
    const ready = code.waitForRender();
    code.dispose();
    await ready;
    pending.resolve([[{ text: 'value', type: 'function' }]]);
    await pending.promise;
    expect(code.getLineOfCode(1)?.tokens).toEqual([{ text: 'value', type: 'default' }]);
  });

  // MIGRATION: a failed current request retains lossless fallback text, reports
  // its error to readiness callers, and does not poison subsequent edits.
  it('surfaces failures while preserving plain text and permits recovery', async () => {
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const pending = deferredTokens();
    vi.mocked(tokenizeCode).mockReturnValueOnce(pending.promise);
    const code = new Code({ code: 'source', language: 'cpp' });
    const error = new Error('Grammar unavailable');
    pending.reject(error);
    await expect(code.waitForRender()).rejects.toBe(error);
    expect(warning).toHaveBeenCalledOnce();
    expect(code.getLineOfCode(1)?.tokens).toEqual([{ text: 'source', type: 'default' }]);
    code.setCode('recovered');
    await expect(code.waitForRender()).resolves.toBeUndefined();
    expect(code.getLineOfCode(1)?.text).toBe('recovered');
  });
});
