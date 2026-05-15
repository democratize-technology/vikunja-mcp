/**
 * Tests for the task Kanban bucket operation (`set-bucket`).
 *
 * Covers validation of required/optional ids, project and view auto-resolution,
 * explicit project/view ids, and propagation of REST errors.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AuthManager } from '../../../src/auth/AuthManager';
import { setTaskBucket } from '../../../src/tools/tasks/buckets';
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

describe('setTaskBucket', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    authManager = new AuthManager();
    authManager.connect('https://vikunja.test', 'tk_test-token');
  });

  describe('validation', () => {
    it('throws a VALIDATION_ERROR when the task id is missing', async () => {
      await expect(setTaskBucket({ bucketId: 3 }, authManager)).rejects.toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'Task id is required for set-bucket operation',
        ),
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws a VALIDATION_ERROR when the task id is zero (falsy)', async () => {
      await expect(
        setTaskBucket({ id: 0, bucketId: 3 }, authManager),
      ).rejects.toThrow('Task id is required for set-bucket operation');
    });

    it('throws a VALIDATION_ERROR when bucketId is undefined', async () => {
      await expect(setTaskBucket({ id: 1 }, authManager)).rejects.toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'bucketId is required for set-bucket operation',
        ),
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws a VALIDATION_ERROR when bucketId is null', async () => {
      await expect(
        setTaskBucket({ id: 1, bucketId: null as unknown as number }, authManager),
      ).rejects.toThrow('bucketId is required for set-bucket operation');
    });

    it('treats a bucketId of 0 as provided and validates it as an id', async () => {
      // bucketId 0 passes the undefined/null guard but fails validateId.
      await expect(
        setTaskBucket({ id: 1, bucketId: 0 }, authManager),
      ).rejects.toThrow('bucketId must be a positive integer');
    });

    it('throws when the task id is not a positive integer', async () => {
      await expect(
        setTaskBucket({ id: -2, bucketId: 3 }, authManager),
      ).rejects.toThrow('id must be a positive integer');
    });

    it('throws when an explicit viewId is invalid', async () => {
      await expect(
        setTaskBucket({ id: 1, bucketId: 3, viewId: -1 }, authManager),
      ).rejects.toThrow('viewId must be a positive integer');
    });

    it('throws when an explicit projectId is invalid', async () => {
      await expect(
        setTaskBucket({ id: 1, bucketId: 3, projectId: 0 }, authManager),
      ).rejects.toThrow('projectId must be a positive integer');
    });
  });

  describe('project and view resolution', () => {
    it('resolves project and view ids from the API when both are omitted', async () => {
      // 1) GET /tasks/:id  2) GET /projects/:id/views  3) POST bucket task
      mockFetch
        .mockResolvedValueOnce(
          mockResponse({ text: JSON.stringify({ id: 1, project_id: 5, title: 'T' }) }),
        )
        .mockResolvedValueOnce(mockResponse({ text: kanbanViews }))
        .mockResolvedValueOnce(mockResponse({ text: '' }));

      const result = await setTaskBucket({ id: 1, bucketId: 3 }, authManager);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      const urls = mockFetch.mock.calls.map((c) => c[0]);
      expect(urls[0]).toBe('https://vikunja.test/api/v1/tasks/1');
      expect(urls[1]).toBe('https://vikunja.test/api/v1/projects/5/views');
      expect(urls[2]).toBe(
        'https://vikunja.test/api/v1/projects/5/views/11/buckets/3/tasks',
      );

      // The POST body carries the TaskBucket payload.
      const [, postInit] = mockFetch.mock.calls[2] as [string, RequestInit];
      expect(postInit.method).toBe('POST');
      expect(postInit.body).toBe(JSON.stringify({ task_id: 1, bucket_id: 3 }));

      const text = result.content[0].text;
      expect(text).toContain('Task 1 moved to bucket 3');
      expect(text).toContain('Success');
    });

    it('does not fetch the task when projectId is supplied explicitly', async () => {
      // 1) GET /projects/:id/views  2) POST bucket task
      mockFetch
        .mockResolvedValueOnce(mockResponse({ text: kanbanViews }))
        .mockResolvedValueOnce(mockResponse({ text: '' }));

      await setTaskBucket({ id: 1, bucketId: 3, projectId: 5 }, authManager);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const urls = mockFetch.mock.calls.map((c) => c[0]);
      expect(urls[0]).toBe('https://vikunja.test/api/v1/projects/5/views');
      expect(urls[1]).toBe(
        'https://vikunja.test/api/v1/projects/5/views/11/buckets/3/tasks',
      );
    });

    it('does not resolve the view when viewId is supplied explicitly', async () => {
      // projectId omitted -> GET /tasks/:id, then POST (no views lookup)
      mockFetch
        .mockResolvedValueOnce(
          mockResponse({ text: JSON.stringify({ id: 1, project_id: 8 }) }),
        )
        .mockResolvedValueOnce(mockResponse({ text: '' }));

      await setTaskBucket({ id: 1, bucketId: 3, viewId: 22 }, authManager);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const urls = mockFetch.mock.calls.map((c) => c[0]);
      expect(urls[0]).toBe('https://vikunja.test/api/v1/tasks/1');
      expect(urls[1]).toBe(
        'https://vikunja.test/api/v1/projects/8/views/22/buckets/3/tasks',
      );
    });

    it('issues only the bucket POST when both projectId and viewId are supplied', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ text: '' }));

      const result = await setTaskBucket(
        { id: 1, bucketId: 3, projectId: 5, viewId: 11, sessionId: 'sess-1' },
        authManager,
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe(
        'https://vikunja.test/api/v1/projects/5/views/11/buckets/3/tasks',
      );
      expect(result.content[0].type).toBe('text');
    });

    it('throws NOT_FOUND when the task lookup returns no body', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ text: '' }));

      await expect(
        setTaskBucket({ id: 1, bucketId: 3 }, authManager),
      ).rejects.toThrow(
        new MCPError(
          ErrorCode.NOT_FOUND,
          'Could not resolve the project of task 1',
        ),
      );
    });

    it('throws NOT_FOUND when the task has no numeric project_id', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ text: JSON.stringify({ id: 1, project_id: 'oops' }) }),
      );

      try {
        await setTaskBucket({ id: 1, bucketId: 3 }, authManager);
        throw new Error('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('throws NOT_FOUND when the project has no Kanban view', async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse({ text: JSON.stringify({ id: 1, project_id: 5 }) }),
        )
        .mockResolvedValueOnce(
          mockResponse({
            text: JSON.stringify([
              { id: 10, title: 'List', project_id: 5, view_kind: 'list' },
            ]),
          }),
        );

      await expect(
        setTaskBucket({ id: 1, bucketId: 3 }, authManager),
      ).rejects.toThrow('Project 5 has no Kanban view, so it has no buckets');
    });
  });

  describe('error propagation', () => {
    it('propagates an HTTP error from the bucket POST', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: 'invalid bucket',
        }),
      );

      await expect(
        setTaskBucket({ id: 1, bucketId: 3, projectId: 5, viewId: 11 }, authManager),
      ).rejects.toThrow(MCPError);
    });

    it('propagates a network error raised while resolving the task', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network down'));

      await expect(
        setTaskBucket({ id: 1, bucketId: 3 }, authManager),
      ).rejects.toThrow('Vikunja REST request failed (GET /tasks/1): network down');
    });
  });
});
