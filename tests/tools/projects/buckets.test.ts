/**
 * Tests for the project Kanban bucket listing operation (`list-buckets`).
 *
 * Covers id validation, view auto-resolution vs an explicit viewId, empty and
 * non-array bucket responses, optional bucket fields, and error propagation.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AuthManager } from '../../../src/auth/AuthManager';
import { listBuckets } from '../../../src/tools/projects/buckets';
import { MCPError, ErrorCode } from '../../../src/types';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

/** Minimal Response-like object for the REST helper. */
function mockResponse(opts: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  text?: string;
}): Response {
  const { ok = true, status = 200, statusText = 'OK', text = '' } = opts;
  return {
    ok,
    status,
    statusText,
    text: jest.fn(async () => text),
  } as unknown as Response;
}

/** A views payload containing a Kanban view (id 11). */
const kanbanViews = JSON.stringify([
  { id: 10, title: 'List', project_id: 5, view_kind: 'list' },
  { id: 11, title: 'Kanban', project_id: 5, view_kind: 'kanban' },
]);

describe('listBuckets', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    authManager = new AuthManager();
    authManager.connect('https://vikunja.test', 'tk_test-token');
  });

  describe('validation', () => {
    it('throws a VALIDATION_ERROR when the project id is missing', async () => {
      await expect(listBuckets({}, authManager)).rejects.toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'Project id is required for list-buckets operation',
        ),
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws a VALIDATION_ERROR when the project id is zero (falsy)', async () => {
      await expect(listBuckets({ id: 0 }, authManager)).rejects.toThrow(
        'Project id is required for list-buckets operation',
      );
    });

    it('throws when the project id is not a positive integer', async () => {
      await expect(listBuckets({ id: -3 }, authManager)).rejects.toThrow(
        'id must be a positive integer',
      );
    });

    it('throws when an explicit viewId is invalid', async () => {
      await expect(listBuckets({ id: 5, viewId: 0 }, authManager)).rejects.toThrow(
        'viewId must be a positive integer',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('view resolution', () => {
    it('resolves the Kanban view id when viewId is omitted', async () => {
      // 1) GET /projects/:id/views  2) GET buckets
      mockFetch
        .mockResolvedValueOnce(mockResponse({ text: kanbanViews }))
        .mockResolvedValueOnce(
          mockResponse({
            text: JSON.stringify([
              {
                id: 100,
                title: 'Backlog',
                project_view_id: 11,
                position: 0,
                limit: 0,
                is_done_bucket: false,
              },
              {
                id: 101,
                title: 'Done',
                project_view_id: 11,
                position: 1,
                limit: 5,
                is_done_bucket: true,
              },
            ]),
          }),
        );

      const result = await listBuckets({ id: 5 }, authManager);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const urls = mockFetch.mock.calls.map((c) => c[0]);
      expect(urls[0]).toBe('https://vikunja.test/api/v1/projects/5/views');
      expect(urls[1]).toBe('https://vikunja.test/api/v1/projects/5/views/11/buckets');

      const text = result.content[0].text;
      expect(text).toContain('Found 2 buckets in the Kanban view of project 5');
      expect(text).toContain('Backlog');
      expect(text).toContain('Done');
    });

    it('uses an explicit viewId without resolving the Kanban view', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          text: JSON.stringify([{ id: 100, title: 'Backlog' }]),
        }),
      );

      const result = await listBuckets({ id: 5, viewId: 42 }, authManager);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe('https://vikunja.test/api/v1/projects/5/views/42/buckets');
      expect(result.content[0].text).toContain('Found 1 buckets');
    });

    it('throws NOT_FOUND when the project has no Kanban view', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          text: JSON.stringify([
            { id: 10, title: 'List', project_id: 5, view_kind: 'list' },
          ]),
        }),
      );

      await expect(listBuckets({ id: 5 }, authManager)).rejects.toThrow(
        'Project 5 has no Kanban view, so it has no buckets',
      );
    });
  });

  describe('bucket response handling', () => {
    it('returns an empty bucket list when the API returns an empty array', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ text: '[]' }));

      const result = await listBuckets({ id: 5, viewId: 11 }, authManager);

      expect(result.content[0].text).toContain('Found 0 buckets');
    });

    it('treats a non-array bucket response as an empty list', async () => {
      // An empty 2xx body resolves to null inside vikunjaRestRequest.
      mockFetch.mockResolvedValueOnce(mockResponse({ text: '' }));

      const result = await listBuckets({ id: 5, viewId: 11 }, authManager);

      expect(result.content[0].text).toContain('Found 0 buckets');
    });

    it('defaults isDoneBucket to false when the field is absent', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          text: JSON.stringify([{ id: 100, title: 'Backlog' }]),
        }),
      );

      const result = await listBuckets({ id: 5, viewId: 11 }, authManager);

      const text = result.content[0].text;
      expect(text).toContain('Found 1 buckets');
      expect(text).toContain('"isDoneBucket": false');
    });

    it('passes a session id through to the response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ text: '[]' }));

      const result = await listBuckets(
        { id: 5, viewId: 11, sessionId: 'sess-9' },
        authManager,
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Success');
    });
  });

  describe('error propagation', () => {
    it('propagates an HTTP error from the buckets request', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: 'view does not exist',
        }),
      );

      await expect(
        listBuckets({ id: 5, viewId: 11 }, authManager),
      ).rejects.toThrow(MCPError);
    });

    it('propagates a network error raised while resolving the view', async () => {
      mockFetch.mockRejectedValueOnce(new Error('offline'));

      await expect(listBuckets({ id: 5 }, authManager)).rejects.toThrow(
        'Vikunja REST request failed (GET /projects/5/views): offline',
      );
    });
  });
});
