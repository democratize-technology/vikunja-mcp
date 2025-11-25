/**
 * AORP Markdown Formatter Unicode Tests
 */

import { formatAorpAsMarkdown } from '../../src/aorp/markdown';
import { createStandardResponse } from '../../src/types';

describe('AORP Markdown Formatter - Unicode Handling', () => {
  test('should fix unicode escapes in team names', () => {
    const teamsWithEscapedUnicode = [
      {
        id: 1,
        name: 'MCP Test Team \\ud83d\\udc65',  // Literal unicode escape
        description: 'Test team with emoji'
      },
      {
        id: 2,
        name: 'Dev Team \\u26a1',  // Lightning bolt
        description: 'Development team'
      }
    ];

    const response = createStandardResponse(
      'list-teams',
      `Retrieved ${teamsWithEscapedUnicode.length} teams`,
      { teams: teamsWithEscapedUnicode },
      { count: teamsWithEscapedUnicode.length }
    );

    const markdown = formatAorpAsMarkdown(response);

    // Should contain actual emojis, not escape sequences
    expect(markdown).toContain('MCP Test Team 👥');
    expect(markdown).toContain('Dev Team ⚡');

    // Should NOT contain the escape sequences
    expect(markdown).not.toContain('\\ud83d\\udc65');
    expect(markdown).not.toContain('\\u26a1');

    // Should NOT contain double-escaped sequences
    expect(markdown).not.toContain('\\\\ud83d\\\\udc65');
    expect(markdown).not.toContain('\\\\u26a1');
  });

  test('should handle mixed unicode content', () => {
    const mixedData = {
      projects: [
        {
          id: 1,
          name: 'Project Alpha',
          description: 'Project with \\ud83d\\ude80 rocket emoji'
        },
        {
          id: 2,
          name: 'Project Beta \\ud83c\udfaf',
          description: 'Project with target emoji'
        }
      ]
    };

    const response = createStandardResponse(
      'list-projects',
      'Retrieved projects with unicode',
      mixedData,
      { count: mixedData.projects.length }
    );

    const markdown = formatAorpAsMarkdown(response);

    expect(markdown).toContain('🚀 rocket emoji');
    expect(markdown).toContain('Project Beta 🎯');
    expect(markdown).not.toContain('\\ud83d\\ude80');
    expect(markdown).not.toContain('\\ud83c\\udfaf');
  });

  test('should preserve already correct unicode', () => {
    const correctData = {
      items: [
        {
          name: 'Item with 👍 emoji',
          description: 'Already correct'
        }
      ]
    };

    const response = createStandardResponse(
      'list-items',
      'Retrieved items with correct unicode',
      correctData,
      { count: correctData.items.length }
    );

    const markdown = formatAorpAsMarkdown(response);

    expect(markdown).toContain('Item with 👍 emoji');
    expect(markdown).toContain('Already correct');
  });

  test('should handle unicode in metadata fields', () => {
    const response = createStandardResponse(
      'create-task',
      'Task created successfully with \\u2728 emoji',
      { task: { id: 1, title: 'New Task' } },
      { success: true, operation: 'create-task \\u2705' }
    );

    const markdown = formatAorpAsMarkdown(response);

    expect(markdown).toContain('✨ emoji');
    expect(markdown).toContain('create-task ✅');
    expect(markdown).not.toContain('\\u2728');
    expect(markdown).not.toContain('\\u2705');
  });

  test('should handle complex nested unicode escapes', () => {
    const complexData = {
      teams: [
        {
          id: 1,
          name: 'Team \\ud83d\\udc65',
          members: [
            { name: 'Alice \\ud83d\udc69', role: 'Admin' },
            { name: 'Bob \\ud83d\udc68', role: 'Member' }
          ],
          projects: [
            { name: 'Project \\ud83d\\udcc2 Alpha' },
            { name: 'Project \\ud83d\udccb Beta' }
          ]
        }
      ]
    };

    const response = createStandardResponse(
      'complex-operation',
      'Complex operation with \\ud83d\udd27 unicode',
      complexData,
      { complex: true }
    );

    const markdown = formatAorpAsMarkdown(response);

    // Check that all unicode sequences are properly decoded
    expect(markdown).toContain('Team 👥');
    expect(markdown).toContain('Alice 👩');
    expect(markdown).toContain('Bob 👨');
    expect(markdown).toContain('Project 📂 Alpha');
    expect(markdown).toContain('Project 📋 Beta');
    expect(markdown).toContain('🔧 unicode');

    // Ensure no escape sequences remain
    expect(markdown).not.toContain('\\ud83d\\udc65');
    expect(markdown).not.toContain('\\ud83d\udc69');
    expect(markdown).not.toContain('\\ud83d\udc68');
    expect(markdown).not.toContain('\\ud83d\\udcc2');
    expect(markdown).not.toContain('\\ud83d\\udccb');
    expect(markdown).not.toContain('\\ud83d\udd27');
  });

  test('should handle malformed unicode gracefully', () => {
    const malformedData = {
      items: [
        {
          name: 'Item with \\uZZZZ invalid unicode',  // Invalid hex
          description: 'Item with \\uFG invalid unicode',  // Too short
          another: 'Item with valid \\ud83d\\udca0 unicode'  // Valid
        }
      ]
    };

    const response = createStandardResponse(
      'test-malformed',
      'Test malformed unicode handling',
      malformedData,
      { count: 1 }
    );

    const markdown = formatAorpAsMarkdown(response);

    // Valid unicode should be fixed
    expect(markdown).toContain('valid 💠 unicode');

    // Invalid unicode should not crash (we don't check exact behavior for invalid)
    expect(markdown).toContain('Item with');
  });
});