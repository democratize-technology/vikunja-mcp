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
import { ToolRecommendationEngine } from './tool-recommendations';

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
   * Auto-generate data-driven next steps based on operation type and context
   */
  generateNextSteps(config: NextStepsConfig = {}): this {
    // Next steps are always enabled for AORP resilience

    let dataDrivenSteps: string[] = [];

    // Generate specific insights based on operation and actual data
    if (this.context.success === false) {
      dataDrivenSteps = [
        "Review error details and fix the underlying issue",
        "Verify input parameters and authentication",
        "Check API rate limits and service availability"
      ];
    } else {
      // Generate data-driven insights based on operation type and data
      dataDrivenSteps = this.generateDataDrivenNextSteps();
    }

    // Fallback to templates if no data-driven steps generated
    if (dataDrivenSteps.length === 0) {
      const templates = { ...DEFAULT_NEXT_STEPS_TEMPLATES, ...config.templates };
      dataDrivenSteps = templates[this.context.operation] || templates.list || [];
    }

    // Limit to max steps
    const maxSteps = config.maxSteps || 5;
    this.nextSteps(dataDrivenSteps.slice(0, maxSteps));

    return this;
  }

  /**
   * Generate specific, data-driven next steps using tool recommendation engine
   */
  private generateDataDrivenNextSteps(): string[] {
    // Use the new tool recommendation engine for specific recommendations
    const recommendations = ToolRecommendationEngine.generateRecommendations(this.context);
    const formatted = ToolRecommendationEngine.formatForAorp(recommendations);

    return formatted.nextSteps;
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
   * Auto-generate data-driven workflow guidance based on operation and context
   */
  generateWorkflowGuidance(): this {
    let guidance = '';

    if (!this.context.success) {
      guidance = 'Review the error details and retry the operation with corrected parameters.';
    } else {
      // Generate specific guidance based on operation and actual data
      guidance = this.generateDataDrivenWorkflowGuidance();
    }

    // Fallback to generic guidance if no specific guidance generated
    if (!guidance) {
      guidance = 'Operation completed successfully. Review the summary for details.';
    }

    this.workflowGuidance(guidance);
    return this;
  }

  /**
   * Generate specific, data-driven workflow guidance using tool recommendation engine
   */
  private generateDataDrivenWorkflowGuidance(): string {
    // Use the new tool recommendation engine for specific workflow guidance
    const recommendations = ToolRecommendationEngine.generateRecommendations(this.context);
    const formatted = ToolRecommendationEngine.formatForAorp(recommendations);

    return formatted.workflowGuidance;
  }

  /**
   * Auto-generate recommendations using tool recommendation engine
   */
  generateRecommendations(): this {
    const recommendations = ToolRecommendationEngine.generateRecommendations(this.context);
    const formatted = ToolRecommendationEngine.formatForAorp(recommendations);

    // Set primary recommendation
    if (formatted.primaryRecommendation) {
      this.recommendations(formatted.primaryRecommendation, formatted.secondaryRecommendations);
    }

    return this;
  }

  /**
   * Calculate data-driven confidence score based on actual operation metrics
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
        // Redesigned data-driven adaptive confidence with realistic weighting
        // ARCH-001 Fix: Reduced success dominance, increased data quality impact
        let confidence = 0; // Start from 0, build up based on actual merit

        // 1. Base success factor (30% weight - reduced from 60%)
        if (this.context.success) {
          confidence += 0.3; // Modest base for success, data quality determines final score
        } else {
          confidence += 0.1; // Minimal confidence for complete failure
        }

        // 2. Data quality factor (40% weight - increased from 30%)
        const dataQualityScore = this.calculateDataQualityScore();
        confidence += dataQualityScore * 0.4;

        // 3. Performance factor (20% weight - maintained)
        const performanceScore = this.calculatePerformanceScore();
        confidence += performanceScore * 0.2;

        // 4. Field validation penalties (NEW - critical field impact)
        const fieldValidationPenalty = this.calculateFieldValidationPenalty();
        confidence -= fieldValidationPenalty;

        // 5. Error impact (reduced to prevent over-penalization)
        const errorPenalty = this.calculateErrorPenalty();
        confidence -= errorPenalty;

        // 6. Operation-specific bonus (reduced impact)
        const operationBonus = this.calculateOperationBonus();
        confidence += operationBonus;

        // Clamp to realistic range [0.0, 0.95] - perfect 1.0 requires exceptional data
        return Math.max(0.0, Math.min(0.95, confidence));
      }
    }
  }

  /**
   * Calculate field validation penalties for missing critical fields
   * ARCH-001 Fix: Enhanced validation to check field validity, not just presence
   */
  private calculateFieldValidationPenalty(): number {
    const { task, tasks, operation } = this.context;
    let penalty = 0;

    // Define critical fields by operation type with validation criteria
    const criticalFields = {
      'create-task': [
        { field: 'title', validator: (val: any) => val && typeof val === 'string' && val.trim().length > 0 },
        { field: 'priority', validator: (val: any) => val !== undefined && val !== null && val >= 1 && val <= 5 }
      ],
      'update-task': [],
      'get-task': [],
      'list-tasks': [],
      'delete-task': [],
      'bulk-create-tasks': [
        { field: 'title', validator: (val: any) => val && typeof val === 'string' && val.trim().length > 0 }
      ],
      'bulk-update-tasks': [],
      'bulk-delete-tasks': []
    };

    // Define important fields with validation criteria
    const importantFields = [
      { field: 'due_date', validator: (val: any) => val && !isNaN(new Date(val).getTime()) },
      { field: 'description', validator: (val: any) => val && typeof val === 'string' && val.trim().length > 5 }
    ];

    const operationCriticalFields = criticalFields[operation as keyof typeof criticalFields] || [];

    if (task && typeof task === 'object') {
      const taskData = task as any;

      // Heavy penalties for invalid critical fields
      operationCriticalFields.forEach(({ field, validator }) => {
        if (!validator(taskData[field])) {
          penalty += 0.4; // Increased penalty for invalid critical fields
        }
      });

      // Moderate penalties for invalid important fields
      importantFields.forEach(({ field, validator }) => {
        if (taskData[field] !== undefined && !validator(taskData[field])) {
          penalty += 0.2; // Penalty for invalid important fields (but only if field exists)
        }
      });
    }

    return Math.min(0.7, penalty); // Increased cap to 70% total penalty
  }

  /**
   * Calculate data quality score based on actual content analysis
   * ARCH-001 Fix: Enhanced to provide meaningful field completeness analysis
   */
  private calculateDataQualityScore(): number {
    let score = 0;
    let maxScore = 0;

    const { task, tasks, results } = this.context;

    if (task && typeof task === 'object') {
      const taskData = task as any;

      // Enhanced field quality analysis with validation
      const qualityFields = [
        {
          field: 'title',
          weight: 0.25,
          validator: (val: any) => val && typeof val === 'string' && val.trim().length > 0
        },
        {
          field: 'description',
          weight: 0.2,
          validator: (val: any) => val && typeof val === 'string' && val.trim().length > 10
        },
        {
          field: 'priority',
          weight: 0.2,
          validator: (val: any) => val !== undefined && val !== null && val >= 1 && val <= 5
        },
        {
          field: 'due_date',
          weight: 0.15,
          validator: (val: any) => val && !isNaN(new Date(val).getTime())
        },
        {
          field: 'assignees',
          weight: 0.1,
          validator: (val: any) => Array.isArray(val) && val.length > 0
        },
        {
          field: 'labels',
          weight: 0.1,
          validator: (val: any) => Array.isArray(val) && val.length > 0
        }
      ];

      qualityFields.forEach(({ field, weight, validator }) => {
        maxScore += weight;
        if (validator(taskData[field])) {
          score += weight;
        } else if (taskData[field]) {
          // Partial score for field that exists but doesn't meet quality criteria
          score += weight * 0.3;
        }
      });
    } else if (tasks && Array.isArray(tasks)) {
      // Enhanced task list quality analysis
      const totalTasks = tasks.length;
      if (totalTasks > 0) {
        maxScore = 1.0;

        // More sophisticated data richness checks
        const tasksWithValidTitles = tasks.filter((t: any) =>
          t.title && typeof t.title === 'string' && t.title.trim().length > 0
        ).length;
        const tasksWithValidPriority = tasks.filter((t: any) =>
          t.priority !== undefined && t.priority !== null && t.priority >= 1 && t.priority <= 5
        ).length;
        const tasksWithValidDueDates = tasks.filter((t: any) =>
          t.due_date && !isNaN(new Date(t.due_date).getTime())
        ).length;
        const tasksWithAssignees = tasks.filter((t: any) =>
          Array.isArray(t.assignees) && t.assignees.length > 0
        ).length;

        // Weighted scoring based on field completeness
        score += (tasksWithValidTitles / totalTasks) * 0.35;
        score += (tasksWithValidPriority / totalTasks) * 0.25;
        score += (tasksWithValidDueDates / totalTasks) * 0.25;
        score += (tasksWithAssignees / totalTasks) * 0.15;
      }
    } else if (results && typeof results === 'object') {
      const resultsData = results as any;
      const total = (resultsData.successful || 0) + (resultsData.failed || 0);

      if (total > 0) {
        maxScore = 1.0;
        const successRate = (resultsData.successful || 0) / total;
        // ARCH-001 Fix: More realistic success rate scaling - only excellent above 95%
        score = successRate > 0.95 ? 1.0 : successRate * 0.85; // Perfect only above 95% success
      }
    } else if (this.context.dataSize > 0) {
      // Generic data size-based scoring with diminishing returns
      maxScore = 1.0;
      // Logarithmic scaling: more realistic assessment of data quantity
      score = Math.min(1.0, Math.log10(this.context.dataSize + 1) / Math.log10(20)); // 20 items = perfect
    }

    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * Calculate performance score based on response time and operation complexity
   */
  private calculatePerformanceScore(): number {
    const { processingTime, operation, dataSize } = this.context;

    // Define acceptable response times by operation type (in ms)
    const acceptableTimes = {
      'create-task': 500,
      'update-task': 500,
      'delete-task': 300,
      'get-task': 200,
      'list-tasks': 800,
      'bulk-create-tasks': 2000,
      'bulk-update-tasks': 3000,
      'bulk-delete-tasks': 2000,
    };

    const expectedTime = acceptableTimes[operation as keyof typeof acceptableTimes] || 1000;

    // Score based on how much faster than expected
    if (processingTime <= expectedTime) {
      return 1.0; // Excellent performance
    } else if (processingTime <= expectedTime * 2) {
      return 0.7; // Acceptable performance
    } else if (processingTime <= expectedTime * 3) {
      return 0.4; // Slow performance
    } else {
      return 0.1; // Very slow performance
    }
  }

  /**
   * Calculate error penalty based on actual error count and severity
   * ARCH-001 Fix: Balanced error penalties that don't overwhelm data quality scores
   */
  private calculateErrorPenalty(): number {
    let totalPenalty = 0;

    // For bulk operations, consider both error array and results failure rate
    if (this.context.operation.includes('bulk-')) {
      // Check for explicit errors in context
      if (this.context.errors && this.context.errors.length > 0) {
        totalPenalty += Math.min(0.1, this.context.errors.length * 0.03); // Reduced from 0.2
      }

      // Check for failed operations in results
      if (this.context.results && typeof this.context.results === 'object') {
        const results = this.context.results as any;
        const failed = results.failed || 0;
        const total = (results.successful || 0) + failed;

        if (total > 0) {
          const failureRate = failed / total;
          // Moderate penalty for failure rates
          totalPenalty += failureRate * 0.2; // Reduced from 0.4
        }
      }

      return Math.min(0.3, totalPenalty); // Reduced from 0.5
    }

    // For single operations, errors are significant but not devastating
    if (this.context.errors && this.context.errors.length > 0) {
      totalPenalty += Math.min(0.2, this.context.errors.length * 0.1); // Reduced from 0.5
    }

    return totalPenalty;
  }

  /**
   * Calculate operation-specific confidence bonuses
   * ARCH-001 Fix: Reduced bonus impact to prevent artificial inflation
   */
  private calculateOperationBonus(): number {
    const { operation, success } = this.context;

    if (!success) {
      return 0;
    }

    // Different operations have different reliability patterns
    switch (operation) {
      case 'create-task':
      case 'update-task':
      case 'delete-task':
        return 0.05; // Reduced from 0.1

      case 'get-task':
        return 0.08; // Reduced from 0.15

      case 'list-tasks':
        return 0.03; // Reduced from 0.05

      case 'bulk-create-tasks':
      case 'bulk-update-tasks':
      case 'bulk-delete-tasks':
        // Bonus based on success rate for bulk operations
        if (this.context.results && typeof this.context.results === 'object') {
          const results = this.context.results as any;
          const total = (results.successful || 0) + (results.failed || 0);
          if (total > 0) {
            const successRate = (results.successful || 0) / total;
            return successRate * 0.05; // Reduced from 0.1
          }
        }
        return -0.02; // Reduced penalty from -0.05

      default:
        return 0;
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
      .generateRecommendations()
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