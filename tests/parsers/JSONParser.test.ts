import { parseJSONInput, importedTaskSchema, ImportedTask } from '../../src/parsers/JSONParser';
import { MCPError, ErrorCode } from '../../src/types/index';

describe('JSONParser', () => {
  describe('importedTaskSchema', () => {
    it('should validate a minimal valid task', () => {
      const task = { title: 'Test Task' };
      const result = importedTaskSchema.parse(task);
      expect(result).toEqual(task);
    });

    it('should validate a complete valid task', () => {
      const task = {
        title: 'Complete Task',
        description: 'Task description',
        done: false,
        dueDate: '2024-12-31T23:59:59Z',
        priority: 5,
        labels: ['urgent', 'backend'],
        assignees: ['user1', 'user2'],
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        hexColor: '#FF5733',
        percentDone: 50,
        repeatAfter: 3600,
        repeatMode: 1,
        reminders: ['2024-12-30T10:00:00Z'],
      };
      const result = importedTaskSchema.parse(task);
      expect(result).toEqual(task);
    });

    it('should reject task without title', () => {
      const task = { description: 'No title task' };
      expect(() => importedTaskSchema.parse(task)).toThrow();
    });

    it('should reject task with empty title', () => {
      const task = { title: '' };
      expect(() => importedTaskSchema.parse(task)).toThrow();
    });

    it('should reject task with invalid hex color', () => {
      const task = { title: 'Test', hexColor: 'invalid-color' };
      expect(() => importedTaskSchema.parse(task)).toThrow();
    });

    it('should reject task with invalid percentDone (negative)', () => {
      const task = { title: 'Test', percentDone: -1 };
      expect(() => importedTaskSchema.parse(task)).toThrow();
    });

    it('should reject task with invalid percentDone (over 100)', () => {
      const task = { title: 'Test', percentDone: 101 };
      expect(() => importedTaskSchema.parse(task)).toThrow();
    });

    it('should accept valid hex colors', () => {
      const validColors = ['#FF5733', '#000000', '#FFFFFF', '#123ABC', '#abc123'];
      validColors.forEach(color => {
        const task = { title: 'Test', hexColor: color };
        expect(() => importedTaskSchema.parse(task)).not.toThrow();
      });
    });

    it('should accept edge cases for percentDone', () => {
      const task0 = { title: 'Test 0%', percentDone: 0 };
      const task100 = { title: 'Test 100%', percentDone: 100 };

      expect(() => importedTaskSchema.parse(task0)).not.toThrow();
      expect(() => importedTaskSchema.parse(task100)).not.toThrow();
    });
  });

  describe('parseJSONInput', () => {
    it('should parse a single task object', () => {
      const json = '{"title": "Single Task"}';
      const result = parseJSONInput(json);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ title: 'Single Task' });
    });

    it('should parse an array of task objects', () => {
      const json = '[{"title": "Task 1"}, {"title": "Task 2"}]';
      const result = parseJSONInput(json);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ title: 'Task 1' });
      expect(result[1]).toEqual({ title: 'Task 2' });
    });

    it('should parse tasks with all properties', () => {
      const json = JSON.stringify([{
        title: 'Complete Task',
        description: 'Description',
        done: true,
        dueDate: '2024-12-31T23:59:59Z',
        priority: 5,
        labels: ['urgent'],
        assignees: ['user1'],
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        hexColor: '#FF5733',
        percentDone: 75,
        repeatAfter: 3600,
        repeatMode: 2,
        reminders: ['2024-12-30T10:00:00Z'],
      }]);

      const result = parseJSONInput(json);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Complete Task');
      expect(result[0].description).toBe('Description');
      expect(result[0].done).toBe(true);
    });

    it('should handle empty array', () => {
      const json = '[]';
      const result = parseJSONInput(json);
      expect(result).toHaveLength(0);
    });

    it('should handle array with mixed valid and invalid tasks', () => {
      const json = '[{"title": "Valid Task"}, {"invalid": "task"}]';

      expect(() => parseJSONInput(json)).toThrow(MCPError);
    });

    it('should reject malformed JSON', () => {
      const invalidJson = '{"title": "Task",}'; // trailing comma

      expect(() => parseJSONInput(invalidJson)).toThrow(MCPError);
    });

    it('should reject non-object data', () => {
      expect(() => parseJSONInput('null')).toThrow(MCPError);
      expect(() => parseJSONInput('undefined')).toThrow(MCPError);
      expect(() => parseJSONInput('"string"')).toThrow(MCPError);
      expect(() => parseJSONInput('123')).toThrow(MCPError);
      expect(() => parseJSONInput('true')).toThrow(MCPError);
    });

    it('should reject array with non-object elements', () => {
      const json = '[{"title": "Task 1"}, "not an object", {"title": "Task 2"}]';

      expect(() => parseJSONInput(json)).toThrow(MCPError);
    });

    it('should provide detailed error messages for validation failures', () => {
      const json = '{"title": "", "hexColor": "invalid"}';

      try {
        parseJSONInput(json);
        fail('Expected MCPError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.VALIDATION_ERROR);
        expect((error as MCPError).message).toContain('Invalid JSON data');
      }
    });

    it('should handle whitespace and formatting', () => {
      const json = `
        {
          "title": "Formatted Task",
          "description": "Task with\\nnewlines"
        }
      `;

      const result = parseJSONInput(json);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Formatted Task');
      expect(result[0].description).toBe('Task with\nnewlines');
    });

    it('should handle large arrays efficiently', () => {
      const tasks = Array.from({ length: 100 }, (_, i) => ({
        title: `Task ${i + 1}`,
        priority: (i % 6),
      }));

      const json = JSON.stringify(tasks);
      const result = parseJSONInput(json);

      expect(result).toHaveLength(100);
      expect(result[0].title).toBe('Task 1');
      expect(result[99].title).toBe('Task 100');
    });

    it('should maintain data types', () => {
      const json = JSON.stringify({
        title: 'Typed Task',
        done: true,
        priority: 5,
        percentDone: 75,
        labels: ['tag1', 'tag2'],
        repeatMode: 2,
      });

      const result = parseJSONInput(json);
      const task = result[0];

      expect(typeof task.title).toBe('string');
      expect(typeof task.done).toBe('boolean');
      expect(typeof task.priority).toBe('number');
      expect(typeof task.percentDone).toBe('number');
      expect(Array.isArray(task.labels)).toBe(true);
      expect(typeof task.repeatMode).toBe('number');
    });

    it('should handle special characters in strings', () => {
      const json = JSON.stringify({
        title: 'Task with "quotes" and \\backslashes\\',
        description: 'Special chars: àáâãäåæçèéêë ñòóôõö ùúûüý ÿ 中文 العربية',
        labels: ['emoji 🎉', 'symbols @#$%'],
      });

      const result = parseJSONInput(json);
      expect(result[0].title).toContain('quotes');
      expect(result[0].description).toContain('中文');
      expect(result[0].labels).toContain('emoji 🎉');
    });

    it('should reject tasks with invalid hex color format', () => {
      const invalidColors = ['#FF573', 'FF5733', '#GG5733', '#F5733', '#FF57333'];

      invalidColors.forEach(color => {
        const json = JSON.stringify({ title: 'Test', hexColor: color });
        expect(() => parseJSONInput(json)).toThrow(MCPError);
      });
    });

    it('should accept optional fields as undefined', () => {
      const json = JSON.stringify({ title: 'Minimal Task' });
      const result = parseJSONInput(json);
      const task = result[0];

      expect(task.description).toBeUndefined();
      expect(task.done).toBeUndefined();
      expect(task.priority).toBeUndefined();
      expect(task.labels).toBeUndefined();
      expect(task.assignees).toBeUndefined();
    });

    it('should handle nested objects in JSON (should fail validation)', () => {
      const json = JSON.stringify({
        title: 'Task with nested object',
        metadata: { key: 'value' }, // not allowed by schema
      });

      expect(() => parseJSONInput(json)).toThrow(MCPError);
    });

    it('should preserve array order', () => {
      const json = JSON.stringify([
        { title: 'First Task' },
        { title: 'Second Task' },
        { title: 'Third Task' },
      ]);

      const result = parseJSONInput(json);
      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('First Task');
      expect(result[1].title).toBe('Second Task');
      expect(result[2].title).toBe('Third Task');
    });
  });

  describe('Error handling', () => {
    it('should throw MCPError for JSON syntax errors', () => {
      const json = '{"title": "Task"'; // missing closing brace

      try {
        parseJSONInput(json);
        fail('Expected MCPError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.VALIDATION_ERROR);
        expect((error as MCPError).message).toContain('Invalid JSON data');
      }
    });

    it('should throw MCPError for schema validation errors', () => {
      const json = '{"invalid": "structure"}';

      try {
        parseJSONInput(json);
        fail('Expected MCPError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.VALIDATION_ERROR);
        expect((error as MCPError).message).toContain('Invalid JSON data');
      }
    });

    it('should provide meaningful error messages', () => {
      const json = '{"title": ""}';

      try {
        parseJSONInput(json);
        fail('Expected MCPError to be thrown');
      } catch (error) {
        const mcpError = error as MCPError;
        expect(mcpError.message).toContain('Invalid JSON data');
        expect(mcpError.code).toBe(ErrorCode.VALIDATION_ERROR);
      }
    });
  });
});