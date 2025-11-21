/**
 * AORP Builder - Fluent API for constructing AI-Optimized Response Protocol responses
 * Provides type-safe, chainable methods for building comprehensive AORP responses
 */

import type {
  AorpResponse,
  AorpImmediate,
  AorpActionable,
  AorpQuality,
  AorpDetails,
  AorpBuilderConfig,
  CompleteAorpBuilderConfig,
  AorpTransformationContext,
  NextStepsConfig,
  QualityConfig,
  AorpStatus,
  AorpUrgency
} from './types';

/**
 * Default configuration for AORP Builder
 */
const DEFAULT_CONFIG: CompleteAorpBuilderConfig = {
  confidenceMethod: 'adaptive',
  confidenceWeights: {
    success: 0.4,
    dataSize: 0.2,
    responseTime: 0.2,
    completeness: 0.2
  }
};

/**
 * Default next steps templates for different operations
 */
const DEFAULT_NEXT_STEPS_TEMPLATES: Record<string, string[]> = {
  create: [
    "Verify the created item appears in listings",
    "Check related entities were updated correctly",
    "Test any automated triggers or workflows"
  ],
  update: [
    "Confirm changes are reflected in the UI",
    "Validate dependent data remains consistent",
    "Check if notifications were sent"
  ],
  delete: [
    "Verify item no longer appears in searches",
    "Confirm related data was handled appropriately",
    "Check for any orphaned references"
  ],
  list: [
    "Review the returned items for completeness",
    "Check if pagination is needed for large datasets",
    "Consider applying filters for better results"
  ],
  get: [
    "Verify all required fields are present",
    "Check related data links and references",
    "Validate data consistency"
  ]
};

/**
 * AORP Builder class with fluent API - markdown output only
 */
export class AorpBuilder {
  private config: CompleteAorpBuilderConfig;
  private response: Partial<AorpResponse> = {};
  private context: AorpTransformationContext;

  constructor(
    context: AorpTransformationContext,
    config: AorpBuilderConfig = {}
  ) {
    this.config = {
      confidenceMethod: config.confidenceMethod ?? DEFAULT_CONFIG.confidenceMethod,
      confidenceWeights: config.confidenceWeights ?? DEFAULT_CONFIG.confidenceWeights
    };
    this.context = context;

    // Initialize with defaults
    this.response.details = {
      summary: '',
      metadata: {
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Set the immediate response information
   */
  immediate(immediate: AorpImmediate): this {
    this.response.immediate = immediate;
    return this;
  }

  /**
   * Set status and key insight (shortcut for immediate)
   */
  status(status: AorpStatus, keyInsight: string, confidence?: number): this {
    const existingImmediate = this.response.immediate;
    this.response.immediate = {
      ...existingImmediate,
      status,
      key_insight: keyInsight,
      confidence: confidence ?? this.calculateConfidence()
    };
    return this;
  }

  /**
   * Set session ID
   */
  sessionId(sessionId: string): this {
    if (this.response.immediate) {
      this.response.immediate.session_id = sessionId;
    }
    return this;
  }

  /**
   * Set actionable information
   */
  actionable(actionable: AorpActionable): this {
    this.response.actionable = actionable;
    return this;
  }

  /**
   * Set next steps (shortcut for actionable.next_steps)
   */
  nextSteps(steps: string[]): this {
    if (!this.response.actionable) {
      this.response.actionable = {
        next_steps: [],
        recommendations: { primary: '' },
        workflow_guidance: ''
      };
    }
    this.response.actionable.next_steps = steps;
    return this;
  }

  /**
   * Add a single next step
   */
  addNextStep(step: string): this {
    if (!this.response.actionable) {
      this.response.actionable = {
        next_steps: [],
        recommendations: { primary: '' },
        workflow_guidance: ''
      };
    }
    this.response.actionable.next_steps.push(step);
    return this;
  }

  /**
   * Set recommendations
   */
  recommendations(primary: string, secondary?: string[]): this {
    if (!this.response.actionable) {
      this.response.actionable = {
        next_steps: [],
        recommendations: { primary: '' },
        workflow_guidance: ''
      };
    }
    this.response.actionable.recommendations = {
      primary,
      secondary: secondary || []
    };
    return this;
  }

  /**
   * Set workflow guidance
   */
  workflowGuidance(guidance: string): this {
    if (!this.response.actionable) {
      this.response.actionable = {
        next_steps: [],
        recommendations: { primary: '' },
        workflow_guidance: ''
      };
    }
    this.response.actionable.workflow_guidance = guidance;
    return this;
  }

  /**
   * Set quality indicators
   */
  quality(quality: AorpQuality): this {
    this.response.quality = quality;
    return this;
  }

  /**
   * Set quality scores (shortcut for quality)
   */
  qualityScores(
    completeness: number,
    reliability: number,
    urgency: AorpUrgency,
    indicators?: Record<string, unknown>
  ): this {
    this.response.quality = {
      completeness,
      reliability,
      urgency,
      ...(indicators && { indicators })
    };
    return this;
  }

  /**
   * Set detailed information
   */
  details(details: AorpDetails): this {
    this.response.details = details;
    return this;
  }

  /**
   * Set summary (markdown output)
   */
  summary(summary: string): this {
    if (this.response.details) {
      this.response.details.summary = summary;
    }
    return this;
  }

  /**
   * Add metadata to details
   */
  addMetadata(key: string, value: unknown): this {
    if (this.response.details) {
      this.response.details.metadata[key] = value;
    }
    return this;
  }

  /**
   * Set debug information
   */
  debug(debugInfo: unknown): this {
    if (this.response.details) {
      this.response.details.debug = debugInfo;
    }
    return this;
  }

  /**
   * Auto-generate next steps based on operation type
   */
  generateNextSteps(config: NextStepsConfig = {}): this {
    // Next steps are always enabled for AORP resilience

    const templates = { ...DEFAULT_NEXT_STEPS_TEMPLATES, ...config.templates };
    const operationSteps = templates[this.context.operation] || templates.list || [];

    // Filter based on context
    let filteredSteps = operationSteps;
    if (this.context.success === false) {
      filteredSteps = [
        "Review error details and fix the underlying issue",
        "Verify input parameters and authentication",
        "Check API rate limits and service availability"
      ];
    }

    // Limit to max steps
    const maxSteps = config.maxSteps || 5;
    this.nextSteps(filteredSteps.slice(0, maxSteps));

    return this;
  }

  /**
   * Auto-generate quality indicators
   */
  generateQuality(config: QualityConfig = {}): this {
    // Quality indicators are always enabled for AORP resilience

    const completenessWeight = config.completenessWeight || 0.5;
    const reliabilityWeight = config.reliabilityWeight || 0.5;

    // Calculate completeness based on context
    let completeness = 0.5; // Default
    if (this.context.dataSize > 0) {
      completeness = Math.min(1.0, this.context.dataSize / 10); // Assume 10 items is "complete"
    }

    // Calculate reliability based on success and errors
    let reliability = this.context.success ? 0.8 : 0.2;
    if (this.context.errors && this.context.errors.length > 0) {
      reliability -= this.context.errors.length * 0.1;
    }
    reliability = Math.max(0.0, Math.min(1.0, reliability));

    // Determine urgency based on operation and context
    let urgency: AorpUrgency = 'medium';
    if (!this.context.success) {
      urgency = 'high';
    } else if (this.context.processingTime > 5000) {
      urgency = 'low'; // Slow operations are less urgent
    } else if (this.context.operation === 'delete') {
      urgency = 'critical';
    }

    // Apply custom indicators if provided
    const indicators: Record<string, unknown> = {
      dataSize: this.context.dataSize,
      processingTime: this.context.processingTime,
      operation: this.context.operation
    };

    if (config.customIndicators) {
      for (const [key, calculator] of Object.entries(config.customIndicators)) {
        try {
          indicators[key] = calculator(null, this.context);
        } catch {
          indicators[key] = 0; // Default on error
        }
      }
    }

    this.qualityScores(
      completeness * completenessWeight,
      reliability * reliabilityWeight,
      urgency,
      indicators
    );

    return this;
  }

  /**
   * Auto-generate workflow guidance based on operation and context
   */
  generateWorkflowGuidance(): this {
    let guidance = '';

    if (!this.context.success) {
      guidance = 'Review the error details and retry the operation with corrected parameters.';
    } else if (this.context.operation === 'create') {
      guidance = 'The resource has been created successfully. Use the returned ID for future operations.';
    } else if (this.context.operation === 'update') {
      guidance = 'The resource has been updated. Verify changes are reflected in subsequent queries.';
    } else if (this.context.operation === 'delete') {
      guidance = 'The resource has been deleted. Update any references to avoid orphaned data.';
    } else if (this.context.operation === 'list') {
      const count = this.context.dataSize;
      if (count === 0) {
        guidance = 'No results found. Consider broadening search criteria or creating new resources.';
      } else {
        guidance = `Found ${count} result${count === 1 ? '' : 's'}. Review the summary for details.`;
      }
    } else {
      guidance = 'Operation completed successfully. Review the summary for details.';
    }

    this.workflowGuidance(guidance);
    return this;
  }

  /**
   * Calculate confidence score based on context and configuration
   */
  private calculateConfidence(): number {
    const weights = this.config.confidenceWeights;

    switch (this.config.confidenceMethod) {
      case 'simple':
        return this.context.success ? 0.9 : 0.3;

      case 'weighted': {
        let score = 0;
        score += (this.context.success ? 1 : 0) * weights.success;
        score += Math.min(1.0, this.context.dataSize / 100) * weights.dataSize;
        score += Math.max(0, 1 - (this.context.processingTime / 10000)) * weights.responseTime;
        score += (this.response.details?.summary ? 1 : 0) * weights.completeness;
        return Math.max(0.0, Math.min(1.0, score));
      }

      case 'adaptive':
      default: {
        // Adaptive: considers multiple factors and adjusts weights based on context
        let adaptiveScore = this.context.success ? 0.7 : 0.2;

        // Bonus for successful operations with data
        if (this.context.success && this.context.dataSize > 0) {
          adaptiveScore += 0.2;
        }

        // Penalty for slow operations
        if (this.context.processingTime > 5000) {
          adaptiveScore -= 0.1;
        }

        // Penalty for errors
        if (this.context.errors && this.context.errors.length > 0) {
          adaptiveScore -= 0.1 * this.context.errors.length;
        }

        return Math.max(0.0, Math.min(1.0, adaptiveScore));
      }
    }
  }

  /**
   * Build the final AORP response
   */
  build(): AorpResponse {
    // Validate required fields
    if (!this.response.immediate) {
      throw new Error('Immediate response information is required');
    }
    if (!this.response.actionable) {
      throw new Error('Actionable information is required');
    }
    if (!this.response.details) {
      throw new Error('Details are required');
    }

    // Auto-generate quality indicators if not enabled but required
    // Quality indicators are always enabled for AORP resilience

    if (!this.response.quality) {
      throw new Error('Quality indicators are required');
    }

    // Ensure all required fields are present
    if (this.response.immediate.confidence === undefined) {
      this.response.immediate.confidence = this.calculateConfidence();
    }

    return this.response as AorpResponse;
  }

  /**
   * Build with auto-generated components
   */
  buildWithAutogeneration(
    nextStepsConfig?: NextStepsConfig,
    qualityConfig?: QualityConfig
  ): AorpResponse {
    return this
      .generateNextSteps(nextStepsConfig)
      .generateQuality(qualityConfig)
      .generateWorkflowGuidance()
      .build();
  }

  /**
   * Create a builder instance with minimal setup
   */
  static create(
    context: AorpTransformationContext,
    config?: AorpBuilderConfig
  ): AorpBuilder {
    return new AorpBuilder(context, config);
  }

  /**
   * Create a successful response builder
   */
  static success(
    context: AorpTransformationContext,
    keyInsight: string,
    summary: string,
    config?: AorpBuilderConfig
  ): AorpBuilder {
    return new AorpBuilder(context, config)
      .status('success', keyInsight)
      .summary(summary)
      .generateNextSteps()
      .generateQuality()
      .generateWorkflowGuidance();
  }

  /**
   * Create an error response builder
   */
  static error(
    context: AorpTransformationContext,
    keyInsight: string,
    summary: string,
    config?: AorpBuilderConfig
  ): AorpBuilder {
    return new AorpBuilder(context, config)
      .status('error', keyInsight)
      .summary(summary)
      .generateNextSteps()
      .generateQuality()
      .generateWorkflowGuidance();
  }
}