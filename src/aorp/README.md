# AI-Optimized Response Protocol (AORP)

The AORP module provides a structured, AI-friendly response format that enhances the existing Vikunja MCP tool responses with confidence scoring, next steps generation, and quality indicators.

## Overview

AORP responses are structured into four main sections:

1. **Immediate**: Key takeaway information (status, insight, confidence)
2. **Actionable**: Next steps, recommendations, and workflow guidance
3. **Quality**: Reliability and completeness indicators
4. **Details**: Full data and metadata for backward compatibility

## Quick Start

### Basic Usage

```typescript
import { AorpBuilder } from './aorp';
import type { AorpTransformationContext } from './aorp';

const context: AorpTransformationContext = {
  operation: 'create_task',
  success: true,
  dataSize: 5,
  processingTime: 150,
  verbosity: 'standard'
};

const response = new AorpBuilder(context)
  .status('success', 'Task created successfully', 0.95)
  .data({ id: 123, title: 'New Task' })
  .buildWithAutogeneration();
```

### Using with Response Factory

```typescript
import { createAorpEnabledFactory } from './utils/response-factory';

const factory = createAorpEnabledFactory();
const result = factory.createResponse(
  'create_project',
  'Project created',
  { id: 456, title: 'New Project' },
  {},
  { useAorp: true }
);
```

### Integration with Tools

```typescript
// In your tool handler
const response = createProjectResponse(
  'create-project',
  `Project "${project.title}" created successfully`,
  { project },
  { affectedFields: Object.keys(projectData) },
  args.verbosity,
  args.useOptimizedFormat,
  args.useAorp  // New parameter for AORP support
);
```

## Response Structure

```typescript
interface AorpResponse<T> {
  immediate: {
    status: 'success' | 'error' | 'partial' | 'pending';
    key_insight: string;
    confidence: number;        // 0.0-1.0
    session_id?: string;
  };
  actionable: {
    next_steps: string[];
    recommendations: {
      primary: string;
      secondary?: string[];
    };
    workflow_guidance: string;
  };
  quality: {
    completeness: number;     // 0.0-1.0
    reliability: number;      // 0.0-1.0
    urgency: 'low' | 'medium' | 'high' | 'critical';
    indicators?: Record<string, any>;
  };
  details: {
    summary: string;
    data: T;                  // Original data for backward compatibility
    metadata: { timestamp: string; [key: string]: any; };
    debug?: any;
  };
}
```

## Features

### Confidence Calculation

Three methods available:
- **Simple**: Success = 0.9, Error = 0.3
- **Weighted**: Considers success, data size, response time, completeness
- **Adaptive**: Intelligent scoring based on multiple factors (default)

### Next Steps Generation

Automatic generation based on:
- Operation type (create, update, delete, list, get)
- Success/failure status
- Context-specific templates
- Customizable templates per operation

### Quality Indicators

- **Completeness**: Based on data presence and size
- **Reliability**: Based on success and error patterns
- **Urgency**: Determined by operation type and context
- **Custom Indicators**: Operation-specific metrics

### Workflow Guidance

Contextual guidance for AI assistants:
- How to use the returned data
- Recommended next actions
- Integration considerations

## Configuration

### Builder Configuration

```typescript
const config = {
  confidenceMethod: 'adaptive',    // 'simple' | 'weighted' | 'adaptive'
  enableNextSteps: true,
  enableQualityIndicators: true,
  confidenceWeights: {
    success: 0.4,
    dataSize: 0.2,
    responseTime: 0.2,
    completeness: 0.2
  }
};
```

### Next Steps Configuration

```typescript
const nextStepsConfig = {
  maxSteps: 5,
  enableContextual: true,
  templates: {
    'custom_operation': [
      'Custom step 1',
      'Custom step 2'
    ]
  }
};
```

### Quality Configuration

```typescript
const qualityConfig = {
  completenessWeight: 0.5,
  reliabilityWeight: 0.5,
  customIndicators: {
    dataComplexity: (data, context) => {
      // Calculate custom quality metric
      return Object.keys(data || {}).length / 10;
    }
  }
};
```

## Integration Examples

### Project Operations

```typescript
// Enhanced project response with AORP
const response = new AorpBuilder(context)
  .status('success', 'Project created successfully')
  .data(projectData)
  .buildWithAutogeneration(
    {
      templates: {
        'create_project': [
          'Verify the project appears in listings',
          'Set up project permissions and sharing',
          'Consider creating initial tasks or milestones'
        ]
      }
    },
    {
      customIndicators: {
        projectHierarchyDepth: (data) =>
          data.project?.parent_project_id ? 0.8 : 0.9
      }
    }
  );
```

### Error Handling

```typescript
const errorResponse = new AorpBuilder(errorContext)
  .status('error', 'Project creation failed')
  .data(null)
  .buildWithAutogeneration();

// Automatically generates:
// - Error-specific next steps
// - Lower reliability scores
// - Appropriate urgency level
```

## Benefits

1. **AI-Friendly**: Structured for easy parsing and decision-making
2. **Confidence Scoring**: Quantitative reliability indicators
3. **Actionable Insights**: Clear next steps and recommendations
4. **Backward Compatible**: Existing data preserved in `details.data`
5. **Context-Aware**: Adapts to operation types and results
6. **Configurable**: Flexible configuration for different use cases
7. **Performance Tracking**: Built-in processing metrics

## Best Practices

1. **Use Fluent API**: Chain methods for clean, readable code
2. **Auto-Generate**: Use `buildWithAutogeneration()` for consistent responses
3. **Custom Templates**: Provide operation-specific next steps
4. **Quality Indicators**: Add custom metrics for your domain
5. **Session Tracking**: Use `session_id` for conversation continuity
6. **Debug Mode**: Enable debug info for development and troubleshooting

## Migration Guide

### From Standard Responses

```typescript
// Before
const response = createStandardResponse('create', 'Success', data);

// After
const result = createAorpResponse('create', 'Success', data, {
  aorpOptions: { sessionId: 'session-123' }
});
```

### From Optimized Responses

```typescript
// Before
const response = createOptimizedResponse('list', 'Success', data, {}, 'detailed');

// After
const result = factory.createAorpResponse(optimizedResponse);
```