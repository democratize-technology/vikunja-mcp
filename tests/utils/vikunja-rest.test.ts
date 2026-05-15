/**
 * Tests for the direct Vikunja REST helper.
 *
 * Covers vikunjaRestRequest (URL normalization, body handling, HTTP errors,
 * network errors, empty/non-JSON bodies) and resolveKanbanViewId.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AuthManager } from '../../src/auth/AuthManager';
import { vikunjaRestRequest, resolveKanbanViewId } from '../../src/utils/vikunja-rest';
import { MCPError, ErrorCode } from '../../src/types';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

/**
 * Builds a minimal Response-like object good enough for vikunjaRestRequest,
 * which only reads `.ok`, `.status`, `.statusText` and `.text()`.
 */
function mockResponse(opts: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  text?: string;
  textThrows?: boolean;
}): Response {
  const {
    ok = true,
    status = 200,
    statusText = 'OK',
    text = '',
    textThrows = false,
  } = opts;
  return {
    ok,
    status,
    statusText,
    text: textThrows
      ? jest.fn(async () => {
          throw new Error('stream read error');
        })
      : jest.fn(async () => text),
  } as unknown as Response;
}

describe('vikunja-rest helper', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    authManager = new AuthManager();
    authManager.connect('https://vikunja.test', 'tk_test-token');
  });

  describe('vikunjaRestRequest', () => {
    it('performs a GET request and parses the JSON body', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ text: JSON.stringify({ id: 7 }) }));

      const result = await vikunjaRestRequest(authManager, 'GET', '/tasks/7');

      expect(result).toEqual({ id: 7 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      // apiUrl had no /api/v1 prefix, so it must have been appended.
      expect(url).toBe('https://vikunja.test/api/v1/tasks/7');
      expect(init.method).toBe('GET');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer tk_test-token',
      );
      expect((init.headers as Record<string, string>)['Content-Type']).toBe(
        'application/json',
      );
      // No body when none is supplied.
      expect(init.body).toBeUndefined();
    });

    it('serializes the body as JSON when one is provided', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ text: '' }));

      await vikunjaRestRequest(authManager, 'POST', '/things', { a: 1 });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ a: 1 }));
    });

    it('does not normalize an apiUrl that already includes the /api/v1 prefix', async () => {
      authManager = new AuthManager();
      authManager.connect('https://vikunja.test/api/v1', 'tk_token');
      mockFetch.mockResolvedValueOnce(mockResponse({ text: '[]' }));

      await vikunjaRestRequest(authManager, 'GET', '/projects/4/views');

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe('https://vikunja.test/api/v1/projects/4/views');
    });

    it('strips a trailing slash from the apiUrl before building the URL', async () => {
      authManager = new AuthManager();
      authManager.connect('https://vikunja.test/', 'tk_token');
      mockFetch.mockResolvedValueOnce(mockResponse({ text: '[]' }));

      await vikunjaRestRequest(authManager, 'GET', '/projects');

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe('https://vikunja.test/api/v1/projects');
    });

    it('recognizes an /api/v2 versioned root', async () => {
      authManager = new AuthManager();
      authManager.connect('https://vikunja.test/api/v2', 'tk_token');
      mockFetch.mockResolvedValueOnce(mockResponse({ text: '[]' }));

      await vikunjaRestRequest(authManager, 'GET', '/projects');

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe('https://vikunja.test/api/v2/projects');
    });

    it('returns null when the response body is empty', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ text: '' }));

      const result = await vikunjaRestRequest(authManager, 'GET', '/empty');

      expect(result).toBeNull();
    });

    it('returns null when the response body is not valid JSON', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ text: 'not json at all' }));

      const result = await vikunjaRestRequest(authManager, 'GET', '/weird');

      expect(result).toBeNull();
    });

    it('throws an MCPError when fetch rejects (network error)', async () => {
      // Persistent rejection: this test makes two assertion calls.
      mockFetch.mockRejectedValue(new Error('connection refused'));

      await expect(
        vikunjaRestRequest(authManager, 'GET', '/tasks/1'),
      ).rejects.toThrow(MCPError);
      await expect(
        vikunjaRestRequest(authManager, 'GET', '/tasks/1'),
      ).rejects.toThrow(
        'Vikunja REST request failed (GET /tasks/1): connection refused',
      );
    });

    it('includes the error code API_ERROR on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('boom'));

      try {
        await vikunjaRestRequest(authManager, 'GET', '/tasks/1');
        throw new Error('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.API_ERROR);
      }
    });

    it('stringifies a non-Error rejection value', async () => {
      mockFetch.mockRejectedValueOnce('plain string failure');

      await expect(
        vikunjaRestRequest(authManager, 'GET', '/tasks/1'),
      ).rejects.toThrow(
        'Vikunja REST request failed (GET /tasks/1): plain string failure',
      );
    });

    it('throws an MCPError with the response detail when the response is not OK', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: 'task does not exist',
        }),
      );

      await expect(
        vikunjaRestRequest(authManager, 'GET', '/tasks/999'),
      ).rejects.toThrow(
        'Vikunja REST request failed (GET /tasks/999): HTTP 404 Not Found — task does not exist',
      );
    });

    it('omits the detail suffix when the error body is empty', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: '',
        }),
      );

      try {
        await vikunjaRestRequest(authManager, 'POST', '/things');
        throw new Error('should have thrown');
      } catch (error) {
        expect((error as MCPError).message).toBe(
          'Vikunja REST request failed (POST /things): HTTP 500 Internal Server Error',
        );
      }
    });

    it('truncates an oversized error body to 500 characters', async () => {
      const longBody = 'x'.repeat(2000);
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: longBody,
        }),
      );

      try {
        await vikunjaRestRequest(authManager, 'GET', '/tasks/1');
        throw new Error('should have thrown');
      } catch (error) {
        const message = (error as MCPError).message;
        // 500 chars of 'x' should be present, but not the full 2000.
        expect(message).toContain('x'.repeat(500));
        expect(message).not.toContain('x'.repeat(501));
      }
    });

    it('falls back to the status line when the error body cannot be read', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          textThrows: true,
        }),
      );

      await expect(
        vikunjaRestRequest(authManager, 'GET', '/tasks/1'),
      ).rejects.toThrow(
        'Vikunja REST request failed (GET /tasks/1): HTTP 502 Bad Gateway',
      );
    });
  });

  describe('resolveKanbanViewId', () => {
    it('returns the id of the Kanban view when one exists', async () => {
      const views = [
        { id: 10, title: 'List', project_id: 4, view_kind: 'list' },
        { id: 11, title: 'Kanban', project_id: 4, view_kind: 'kanban' },
        { id: 12, title: 'Gantt', project_id: 4, view_kind: 'gantt' },
      ];
      mockFetch.mockResolvedValueOnce(mockResponse({ text: JSON.stringify(views) }));

      const viewId = await resolveKanbanViewId(authManager, 4);

      expect(viewId).toBe(11);
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe('https://vikunja.test/api/v1/projects/4/views');
    });

    it('throws NOT_FOUND when the project has no Kanban view', async () => {
      const views = [{ id: 10, title: 'List', project_id: 4, view_kind: 'list' }];
      mockFetch.mockResolvedValueOnce(mockResponse({ text: JSON.stringify(views) }));

      await expect(resolveKanbanViewId(authManager, 4)).rejects.toThrow(
        new MCPError(
          ErrorCode.NOT_FOUND,
          'Project 4 has no Kanban view, so it has no buckets',
        ),
      );
    });

    it('throws NOT_FOUND when the views response is not an array', async () => {
      // A 2xx non-JSON body resolves to null inside vikunjaRestRequest.
      mockFetch.mockResolvedValueOnce(mockResponse({ text: '' }));

      try {
        await resolveKanbanViewId(authManager, 9);
        throw new Error('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.NOT_FOUND);
        expect((error as MCPError).message).toBe(
          'Project 9 has no Kanban view, so it has no buckets',
        );
      }
    });

    it('propagates an MCPError raised by the underlying request', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ ok: false, status: 403, statusText: 'Forbidden', text: 'nope' }),
      );

      await expect(resolveKanbanViewId(authManager, 4)).rejects.toThrow(MCPError);
    });
  });
});
