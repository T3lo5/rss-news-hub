/**
 * Plugin configuration validation using JSON Schema
 */

export function validateConfig(
  config: Record<string, unknown>,
  schema: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const schemaObj = schema as {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };

  // Check required fields
  if (schemaObj.required) {
    for (const field of schemaObj.required) {
      if (!(field in config)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Validate properties
  if (schemaObj.properties) {
    for (const [key, propSchema] of Object.entries(schemaObj.properties)) {
      const value = config[key];

      if (value === undefined) {
        // Check if there's a default
        if (propSchema.default !== undefined) {
          continue;
        }
        // If required, already caught above
        continue;
      }

      const propErrors = validateProperty(key, value, propSchema);
      errors.push(...propErrors);
    }
  }

  // Check additional properties
  if (schemaObj.additionalProperties === false && schemaObj.properties) {
    for (const key of Object.keys(config)) {
      if (!(key in schemaObj.properties!)) {
        errors.push(`Unexpected property: ${key}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateProperty(key: string, value: unknown, propSchema: any): string[] {
  const errors: string[] = [];

  // Type validation
  if (propSchema.type) {
    const expectedType = propSchema.type;
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (expectedType === 'integer' && actualType === 'number' && Number.isInteger(value)) {
      // Valid integer
    } else if (expectedType === 'number' && actualType === 'number') {
      // Valid number
    } else if (expectedType === 'string' && actualType === 'string') {
      // Valid string
    } else if (expectedType === 'boolean' && actualType === 'boolean') {
      // Valid boolean
    } else if (expectedType === 'array' && actualType === 'array') {
      // Valid array
    } else if (
      expectedType === 'object' &&
      actualType === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      // Valid object
    } else {
      errors.push(`Field ${key}: expected ${expectedType}, got ${actualType}`);
    }
  }

  // Enum validation
  if (propSchema.enum && value !== undefined) {
    if (!propSchema.enum.includes(value)) {
      errors.push(
        `Field ${key}: value must be one of [${propSchema.enum.join(', ')}], got ${value}`
      );
    }
  }

  // String format validation
  if (propSchema.format === 'url' && typeof value === 'string') {
    try {
      new URL(value);
    } catch {
      errors.push(`Field ${key}: invalid URL format`);
    }
  }

  // Minimum/maximum for numbers
  if (typeof value === 'number') {
    if (propSchema.minimum !== undefined && value < propSchema.minimum) {
      errors.push(`Field ${key}: must be >= ${propSchema.minimum}`);
    }
    if (propSchema.maximum !== undefined && value > propSchema.maximum) {
      errors.push(`Field ${key}: must be <= ${propSchema.maximum}`);
    }
  }

  // Min/max length for strings
  if (typeof value === 'string') {
    if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
      errors.push(`Field ${key}: must be at least ${propSchema.minLength} characters`);
    }
    if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
      errors.push(`Field ${key}: must be at most ${propSchema.maxLength} characters`);
    }
  }

  // Pattern validation
  if (propSchema.pattern && typeof value === 'string') {
    const regex = new RegExp(propSchema.pattern);
    if (!regex.test(value)) {
      errors.push(`Field ${key}: does not match pattern ${propSchema.pattern}`);
    }
  }

  // Nested object validation
  if (
    propSchema.type === 'object' &&
    propSchema.properties &&
    typeof value === 'object' &&
    value !== null
  ) {
    const nestedErrors = validateConfig(value as Record<string, unknown>, propSchema);
    for (const error of nestedErrors.errors) {
      errors.push(`${key}.${error}`);
    }
  }

  // Array item validation
  if (propSchema.type === 'array' && propSchema.items && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const itemErrors = validateProperty(`${key}[${i}]`, value[i], propSchema.items);
      errors.push(...itemErrors);
    }
  }

  return errors;
}

export function mergeWithDefaults(
  config: Record<string, unknown>,
  schema: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...config };

  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties as Record<string, any>)) {
      if (result[key] === undefined && propSchema.default !== undefined) {
        result[key] = propSchema.default;
      }

      // Recursively apply defaults for nested objects
      if (propSchema.type === 'object' && propSchema.properties) {
        if (result[key] === undefined) {
          // Create empty object for nested defaults
          result[key] = {};
        }
        if (typeof result[key] === 'object' && result[key] !== null) {
          result[key] = mergeWithDefaults(result[key] as Record<string, unknown>, propSchema);
        }
      }
    }
  }

  return result;
}
