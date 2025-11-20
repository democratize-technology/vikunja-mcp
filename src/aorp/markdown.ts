/**
 * AORP Markdown Formatter
 * Formats AORP responses as clean, readable Markdown with security hardening
 * Manual string building (no external libraries) per audit approval
 */

import type { AorpResponse, AorpStatus, AorpUrgency } from './types';

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
 * Formats AORP response as clean, readable Markdown
 * All user-controlled content is sanitized to prevent Markdown injection
 *
 * @param aorp - The AORP response to format
 * @returns Markdown-formatted string representation
 * @throws Error if any input field exceeds MAX_INPUT_LENGTH (DoS protection)
 */
export function formatAorpAsMarkdown(aorp: AorpResponse): string {
  // Validate all string fields for length (DoS protection)
  const fieldsToValidate = [
    aorp.immediate.key_insight,
    aorp.details.summary,
    aorp.actionable.workflow_guidance || '',
    ...aorp.actionable.next_steps,
    aorp.actionable.recommendations.primary,
    ...(aorp.actionable.recommendations.secondary || []),
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
  const statusEmoji = getStatusEmoji(aorp.immediate.status);
  const statusText = aorp.immediate.status.charAt(0).toUpperCase() + aorp.immediate.status.slice(1);
  const confidence = Math.round(aorp.immediate.confidence * 100);

  lines.push(`## ${statusEmoji} ${statusText} | Confidence: ${confidence}%`);
  lines.push('');
  lines.push(`**Key Insight**: ${escapeMarkdown(aorp.immediate.key_insight)}`);

  if (aorp.immediate.session_id) {
    lines.push(`**Session ID**: \`${aorp.immediate.session_id}\``);
  }
  lines.push('');

  // === ACTIONABLE SECTION ===
  lines.push('### 🎯 Next Steps');
  aorp.actionable.next_steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${escapeMarkdown(step)}`);
  });
  lines.push('');

  lines.push('### 💡 Recommendations');
  lines.push(`**Primary**: ${escapeMarkdown(aorp.actionable.recommendations.primary)}`);

  if (aorp.actionable.recommendations.secondary?.length) {
    aorp.actionable.recommendations.secondary.forEach((rec) => {
      lines.push(`- ${escapeMarkdown(rec)}`);
    });
  }
  lines.push('');

  if (aorp.actionable.workflow_guidance) {
    lines.push('### 🔄 Workflow Guidance');
    lines.push(escapeMarkdown(aorp.actionable.workflow_guidance));
    lines.push('');
  }

  // === QUALITY SECTION ===
  lines.push('### 📊 Quality Indicators');
  const completeness = Math.round(aorp.quality.completeness * 100);
  const reliability = Math.round(aorp.quality.reliability * 100);
  const urgencyEmoji = getUrgencyEmoji(aorp.quality.urgency);
  const urgencyText = aorp.quality.urgency.charAt(0).toUpperCase() + aorp.quality.urgency.slice(1);

  lines.push(`- **Completeness**: ${completeness}%`);
  lines.push(`- **Reliability**: ${reliability}%`);
  lines.push(`- **Urgency**: ${urgencyEmoji} ${urgencyText}`);

  if (aorp.quality.indicators && Object.keys(aorp.quality.indicators).length > 0) {
    Object.entries(aorp.quality.indicators).forEach(([key, value]) => {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const formattedValue = typeof value === 'number' && value >= 0 && value <= 1
        ? `${Math.round(value * 100)}%`
        : String(value);
      lines.push(`- **${escapeMarkdown(formattedKey)}**: ${escapeMarkdown(formattedValue)}`);
    });
  }
  lines.push('');

  // === DETAILS SECTION ===
  lines.push('### 📋 Details');
  lines.push(`**Summary**: ${escapeMarkdown(aorp.details.summary)}`);
  lines.push(`**Timestamp**: ${aorp.details.metadata.timestamp}`);

  // Additional metadata (excluding timestamp which we already displayed)
  const additionalMetadata = Object.entries(aorp.details.metadata)
    .filter(([key]) => key !== 'timestamp');

  if (additionalMetadata.length > 0) {
    additionalMetadata.forEach(([key, value]) => {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`**${escapeMarkdown(formattedKey)}**: ${escapeMarkdown(String(value))}`);
    });
  }

  return lines.join('\n');
}
