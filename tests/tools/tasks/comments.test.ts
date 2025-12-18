import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { handleComment, removeComment, listComments } from '../../../src/tools/tasks/comments';
import { getClientFromContext } from '../../../src/client';
import { MCPError, ErrorCode } from '../../../src/types';
import { parseMarkdown } from '../../utils/markdown';

jest.mock('../../../src/client');
jest.mock('../../../src/utils/logger');

describe('Comment operations', () => {
  const mockClient = {
    tasks: {
      createTaskComment: jest.fn(),
      getTaskComments: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('handleComment', () => {
    it('should create a comment successfully', async () => {
      const mockComment = {
        id: 1,
        comment: 'Test comment',
        created: new Date().toISOString(),
      };
      mockClient.tasks.createTaskComment.mockResolvedValue(mockComment);

      const result = await handleComment({
        id: 123,
        comment: 'Test comment',
      });

      expect(mockClient.tasks.createTaskComment).toHaveBeenCalledWith(123, {
        comment: 'Test comment',
        task_id: 123,
      });

      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ success:");
      expect(markdown).toContain('comment');
      expect(markdown).toContain('Comment added successfully');
    });

    it('should list comments when comment text is missing', async () => {
      const mockComments = [
        { id: 1, comment: 'First comment', created: '2024-01-01' },
      ];
      mockClient.tasks.getTaskComments.mockResolvedValue(mockComments);

      const result = await handleComment({ id: 123 });

      expect(mockClient.tasks.getTaskComments).toHaveBeenCalledWith(123);

      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ success:");
      expect(markdown).toContain('list');
      expect(markdown).toContain('Found 1 comments');
    });

    it('should throw error when id is missing', async () => {
      await expect(handleComment({ comment: 'Test' })).rejects.toThrow(
        'Failed to handle comment: Task id is required for comment operation'
      );
    });

    it('should throw error when id is zero', async () => {
      // id: 0 is falsy, so it's treated as missing
      await expect(handleComment({ id: 0, comment: 'Test' })).rejects.toThrow(
        'Failed to handle comment: Task id is required for comment operation'
      );
    });

    it('should throw error when id is negative', async () => {
      // Negative IDs fail validation
      await expect(handleComment({ id: -1, comment: 'Test' })).rejects.toThrow(
        'Failed to handle comment: id must be a positive integer'
      );
    });

    it('should handle API errors when creating comment', async () => {
      mockClient.tasks.createTaskComment.mockRejectedValue(new Error('API Error'));

      await expect(handleComment({ id: 123, comment: 'Test' })).rejects.toThrow(
        'Failed to handle comment: API Error'
      );
    });

    it('should handle API errors when listing comments', async () => {
      mockClient.tasks.getTaskComments.mockRejectedValue(new Error('API Error'));

      await expect(handleComment({ id: 123 })).rejects.toThrow(
        'Failed to handle comment: API Error'
      );
    });

    it('should list comments when empty string is provided', async () => {
      // Empty string is falsy, so it lists comments instead
      const mockComments = [];
      mockClient.tasks.getTaskComments.mockResolvedValue(mockComments);

      const result = await handleComment({
        id: 123,
        comment: '',
      });

      expect(mockClient.tasks.getTaskComments).toHaveBeenCalledWith(123);

      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ success:");
      expect(markdown).toContain('list');
      expect(markdown).toContain('Found 0 comments');
    });
  });

  describe('removeComment', () => {
    it('should throw NOT_IMPLEMENTED error', () => {
      expect(() => removeComment()).toThrow(
        'Comment deletion is not currently supported by the node-vikunja API'
      );
    });
  });

  describe('listComments', () => {
    it('should list comments successfully', async () => {
      const mockComments = [
        { id: 1, comment: 'First comment', created: '2024-01-01' },
        { id: 2, comment: 'Second comment', created: '2024-01-02' },
      ];
      mockClient.tasks.getTaskComments.mockResolvedValue(mockComments);

      const result = await listComments({ id: 123 });

      expect(mockClient.tasks.getTaskComments).toHaveBeenCalledWith(123);

      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ success:");
      expect(markdown).toContain('list');
      expect(markdown).toContain('Found 2 comments');
    });

    it('should throw error when id is missing', async () => {
      await expect(listComments({})).rejects.toThrow(
        'Failed to list comments: Task id is required for list-comments operation'
      );
    });

    it('should throw error when id is invalid', async () => {
      await expect(listComments({ id: -1 })).rejects.toThrow(
        'Failed to list comments: id must be a positive integer'
      );
    });

    it('should handle empty comments list', async () => {
      mockClient.tasks.getTaskComments.mockResolvedValue([]);

      const result = await listComments({ id: 123 });

      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ success:");
      expect(markdown).toContain('list');
      expect(markdown).toContain('Found 0 comments');
    });

    it('should handle API errors', async () => {
      mockClient.tasks.getTaskComments.mockRejectedValue(new Error('API Error'));

      await expect(listComments({ id: 123 })).rejects.toThrow(
        'Failed to list comments: API Error'
      );
    });
  });
});