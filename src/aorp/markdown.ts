/**
 * AORP Markdown Formatter
 * Formats AORP responses as clean, readable Markdown with security hardening
 * Manual string building (no external libraries) per audit approval
 */

import type { AorpResponse, AorpStatus, AorpUrgency, SimpleAorpResponse } from './types';
import { isSimpleAorpResponse } from './types';
import { fixLiteralUnicodeEscapesInData } from '../utils/unicode-fix';

/**
 * Escapes Markdown special characters to prevent injection attacks
 *
 * **CommonMark Spec Compliance** (v0.30):
 * Escaped Characters: \ * _ [ ] ` ~ > < & | #
 *
 * **Security Properties**:
 * - Backslash escaped FIRST to prevent double-escaping
 * - Prevents HTML tag injection (< >)
 * - Prevents HTML entity injection (&)
 * - Prevents table delimiter injection (|)
 * - All user-controlled content MUST pass through this function
 *
 * **Reference**: https://spec.commonmark.org/0.30/#backslash-escapes
 *
 * @param text - Raw text that may contain Markdown special characters
 * @returns Sanitized text safe for Markdown output
 * @example
 * escapeMarkdown('**Bold** <script>alert("xss")</script>')
 * // Returns: '\\*\\*Bold\\*\\* \\<script\\>alert("xss")\\</script\\>'
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')  // Backslash first to avoid double-escaping
    .replace(/\*/g, '\\*')   // Bold/italic markers
    .replace(/_/g, '\\_')    // Alternative italic markers
    .replace(/\[/g, '\\[')   // Link brackets
    .replace(/\]/g, '\\]')
    .replace(/`/g, '\\`')    // Code markers
    .replace(/~/g, '\\~')    // Strikethrough markers
    .replace(/>/g, '\\>')    // Blockquote markers
    .replace(/#/g, '\\#')    // Header markers
    .replace(/</g, '\\<')    // HTML tags
    .replace(/&/g, '\\&')    // HTML entities
    .replace(/\|/g, '\\|');  // Table delimiters
}

/**
 * Maps AORP status to appropriate emoji indicator
 */
function getStatusEmoji(status: AorpStatus): string {
  const emojiMap: Record<AorpStatus, string> = {
    success: '✅',
    error: '❌',
    partial: '⚠️',
    pending: '⏳',
  };
  return emojiMap[status];
}

/**
 * Maps AORP urgency to appropriate emoji indicator
 */
function getUrgencyEmoji(urgency: AorpUrgency): string {
  const emojiMap: Record<AorpUrgency, string> = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  };
  return emojiMap[urgency];
}

const MAX_INPUT_LENGTH = 10_000_000; // 10MB

/**
 * Formats Simple AORP response as concise Markdown
 *
 * @param aorp - The simple AORP response to format
 * @returns Concise Markdown-formatted string representation
 * @throws Error if any input field exceeds MAX_INPUT_LENGTH (DoS protection)
 */
export function formatSimpleAorpAsMarkdown(aorp: SimpleAorpResponse): string {
  // Fix any literal unicode escape sequences in the data
  const fixedAorp = fixLiteralUnicodeEscapesInData(aorp) as SimpleAorpResponse;

  // Validate string fields for length (DoS protection)
  const fieldsToValidate = [
    fixedAorp.immediate.key_insight,
    fixedAorp.summary,
  ];

  for (const field of fieldsToValidate) {
    if (field.length > MAX_INPUT_LENGTH) {
      throw new Error(
        `Input field exceeds maximum length of ${MAX_INPUT_LENGTH} characters (got ${field.length})`,
      );
    }
  }

  const lines: string[] = [];

  // Status header
  const statusEmoji = getStatusEmoji(fixedAorp.immediate.status);
  const confidencePercent = Math.round(fixedAorp.immediate.confidence * 100);
  lines.push(`## ${statusEmoji} ${fixedAorp.immediate.status.charAt(0).toUpperCase() + fixedAorp.immediate.status.slice(1)} | Confidence: ${confidencePercent}%`);

  // Key insight
  lines.push('');
  lines.push(`**Key Insight**: ${escapeMarkdown(fixedAorp.immediate.key_insight)}`);

  // Session ID if present
  if (fixedAorp.immediate.session_id) {
    lines.push(`**Session ID**: \`${escapeMarkdown(fixedAorp.immediate.session_id)}\``);
  }

  // Summary
  lines.push('');
  lines.push(`**Summary**: ${escapeMarkdown(fixedAorp.summary)}`);

  // Metadata
  lines.push('');
  lines.push('**Metadata**:');
  lines.push(`- **Timestamp**: ${escapeMarkdown(fixedAorp.metadata.timestamp)}`);
  lines.push(`- **Operation**: ${escapeMarkdown(fixedAorp.metadata.operation)}`);
  lines.push(`- **Success**: ${fixedAorp.metadata.success ? '✅ Yes' : '❌ No'}`);

  return lines.join('\n');
}

/**
 * Formats AORP response as clean, readable Markdown
 * All user-controlled content is sanitized to prevent Markdown injection
 *
 * @param aorp - The AORP response to format
 * @returns Markdown-formatted string representation
 * @throws Error if any input field exceeds MAX_INPUT_LENGTH (DoS protection)
 */
export function formatAorpAsMarkdown(aorp: AorpResponse | SimpleAorpResponse): string {
  // Handle simple AORP response
  if (isSimpleAorpResponse(aorp)) {
    return formatSimpleAorpAsMarkdown(aorp);
  }

  // Fix any literal unicode escape sequences in the data
  // This addresses the issue where API data contains escaped unicode like "\ud83d\udc65"
  const fixedAorp = fixLiteralUnicodeEscapesInData(aorp) as AorpResponse;

  // Validate all string fields for length (DoS protection)
  const fieldsToValidate = [
    fixedAorp.immediate.key_insight,
    fixedAorp.details.summary,
    fixedAorp.actionable.workflow_guidance || '',
    ...fixedAorp.actionable.next_steps,
    fixedAorp.actionable.recommendations.primary,
    ...(fixedAorp.actionable.recommendations.secondary || []),
  ];

  for (const field of fieldsToValidate) {
    if (field.length > MAX_INPUT_LENGTH) {
      throw new Error(
        `Input field exceeds maximum length of ${MAX_INPUT_LENGTH} characters (got ${field.length})`,
      );
    }
  }

  const lines: string[] = [];

  // === IMMEDIATE SECTION ===
  const statusEmoji = getStatusEmoji(fixedAorp.immediate.status);
  const statusText = fixedAorp.immediate.status.charAt(0).toUpperCase() + fixedAorp.immediate.status.slice(1);
  const confidence = Math.round(fixedAorp.immediate.confidence * 100);

  lines.push(`## ${statusEmoji} ${statusText} | Confidence: ${confidence}%`);
  lines.push('');
  lines.push(`**Key Insight**: ${escapeMarkdown(fixedAorp.immediate.key_insight)}`);

  if (fixedAorp.immediate.session_id) {
    lines.push(`**Session ID**: \`${fixedAorp.immediate.session_id}\``);
  }
  lines.push('');

  // === ACTIONABLE SECTION ===
  lines.push('### 🎯 Next Steps');
  fixedAorp.actionable.next_steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${escapeMarkdown(step)}`);
  });
  lines.push('');

  lines.push('### 💡 Recommendations');
  lines.push(`**Primary**: ${escapeMarkdown(fixedAorp.actionable.recommendations.primary)}`);

  if (fixedAorp.actionable.recommendations.secondary?.length) {
    fixedAorp.actionable.recommendations.secondary.forEach((rec) => {
      lines.push(`- ${escapeMarkdown(rec)}`);
    });
  }
  lines.push('');

  if (fixedAorp.actionable.workflow_guidance) {
    lines.push('### 🔄 Workflow Guidance');
    lines.push(escapeMarkdown(fixedAorp.actionable.workflow_guidance));
    lines.push('');
  }

  // === QUALITY SECTION ===
  lines.push('### 📊 Quality Indicators');
  const completeness = Math.round(fixedAorp.quality.completeness * 100);
  const reliability = Math.round(fixedAorp.quality.reliability * 100);
  const urgencyEmoji = getUrgencyEmoji(fixedAorp.quality.urgency);
  const urgencyText = fixedAorp.quality.urgency.charAt(0).toUpperCase() + fixedAorp.quality.urgency.slice(1);

  lines.push(`- **Completeness**: ${completeness}%`);
  lines.push(`- **Reliability**: ${reliability}%`);
  lines.push(`- **Urgency**: ${urgencyEmoji} ${urgencyText}`);

  if (fixedAorp.quality.indicators && Object.keys(fixedAorp.quality.indicators).length > 0) {
    Object.entries(fixedAorp.quality.indicators).forEach(([key, value]) => {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      let formattedValue: string;
      if (typeof value === 'number' && value >= 0 && value <= 1) {
        formattedValue = `${Math.round(value * 100)}%`;
      } else if (value && typeof value === 'object') {
        // Complex object - serialize as JSON
        try {
          formattedValue = `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
        } catch (error) {
          formattedValue = `[Object serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}]`;
        }
      } else {
        formattedValue = String(value);
      }

      if (formattedValue.includes('```json')) {
        // Multi-line JSON - put on separate lines
        lines.push(`- **${escapeMarkdown(formattedKey)}**:`);
        lines.push(formattedValue);
      } else {
        // Single line value
        lines.push(`- **${escapeMarkdown(formattedKey)}**: ${escapeMarkdown(formattedValue)}`);
      }
    });
  }
  lines.push('');

  // === DETAILS SECTION ===
  lines.push('### 📋 Details');
  lines.push(`**Summary**: ${escapeMarkdown(fixedAorp.details.summary)}`);
  lines.push(`**Timestamp**: ${fixedAorp.details.metadata.timestamp}`);

  // Display actual data from details.data (the most important part!)
  if (fixedAorp.details.data && Object.keys(fixedAorp.details.data).length > 0) {
    lines.push('');
    lines.push('### 📦 Actual Data');

    Object.entries(fixedAorp.details.data).forEach(([key, value]) => {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      if (Array.isArray(value)) {
        lines.push(`**${escapeMarkdown(formattedKey)}** (${value.length} items):`);
        if (value.length > 0) {
          // Display array items with proper serialization
          value.forEach((item, index) => {
            try {
              const itemStr = typeof item === 'object'
                ? JSON.stringify(item, null, 2)
                : String(item);
              lines.push(`${index + 1}. \`\`\`json`);
              // Split long JSON across multiple lines for readability
              const jsonLines = itemStr.split('\n');
              jsonLines.forEach(line => {
                if (line.trim()) {
                  lines.push(`   ${line}`);
                }
              });
              lines.push('   ```');
            } catch (error) {
              lines.push(`${index + 1}. [Object serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}]`);
            }
          });
        } else {
          lines.push('- *Empty array*');
        }
      } else if (value && typeof value === 'object') {
        lines.push(`**${escapeMarkdown(formattedKey)}**:`);
        try {
          const objStr = JSON.stringify(value, null, 2);
          lines.push('```json');
          objStr.split('\n').forEach(line => {
            lines.push(line);
          });
          lines.push('```');
        } catch (error) {
          lines.push(`[Object serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}]`);
        }
      } else {
        // Primitive value - safe to cast to string since we've excluded objects
        const displayValue = value !== null ? String(value as string | number | boolean) : 'null';
        lines.push(`**${escapeMarkdown(formattedKey)}**: ${escapeMarkdown(displayValue)}`);
      }
      lines.push(''); // Add spacing between data sections
    });
  }

  // Additional metadata (excluding timestamp which we already displayed)
  const additionalMetadata = Object.entries(fixedAorp.details.metadata)
    .filter(([key]) => key !== 'timestamp');

  if (additionalMetadata.length > 0) {
    lines.push('### 📊 Metadata');
    additionalMetadata.forEach(([key, value]) => {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      let formattedValue: string;
      if (key === 'operation') {
        // Format operation field as kebab-case for markdown compatibility
        // SECURITY: operation is system-controlled (AORP response), not user input
        formattedValue = typeof value === 'string' ? value.replace(/_/g, '-') : (value !== null && value !== undefined ? String(value as string | number | boolean) : '');
      } else if (value && typeof value === 'object') {
        // Complex object - serialize as JSON
        try {
          formattedValue = `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
        } catch (error) {
          formattedValue = `[Object serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}]`;
        }
      } else {
        // Simple value - escape for markdown safety
        formattedValue = escapeMarkdown(typeof value === 'string' ? value : (value !== null && value !== undefined ? String(value as string | number | boolean) : 'null'));
      }

      if (formattedValue.includes('```json')) {
        // Multi-line JSON - put on separate lines
        lines.push(`**${escapeMarkdown(formattedKey)}**:`);
        lines.push(formattedValue);
      } else {
        // Single line value
        lines.push(`**${escapeMarkdown(formattedKey)}**: ${formattedValue}`);
      }
    });
  }

  return lines.join('\n');
}
