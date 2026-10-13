import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { mergeWithDefaults, validateConfig } from '../src/plugins/config.js';
import { pluginRegistry } from '../src/plugins/registry.js';

describe('Plugin Registry', () => {
  beforeEach(async () => {
    // Clear registry before each test
    const plugins = pluginRegistry.getAll();
    for (const plugin of plugins) {
      await pluginRegistry.unregister(plugin.manifest.name);
    }
  });

  describe('validateConfig', () => {
    test('validates required fields', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
        required: ['name'],
      };

      const result = validateConfig({ name: 'test', age: 25 }, schema);
      assert.ok(result.valid);
      assert.strictEqual(result.errors.length, 0);
    });

    test('rejects missing required fields', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };

      const result = validateConfig({ age: 25 }, schema);
      assert.ok(!result.valid);
      assert.ok(result.errors.some((e) => e.includes('name')));
    });

    test('validates types', () => {
      const schema = {
        type: 'object',
        properties: {
          age: { type: 'integer' },
          name: { type: 'string' },
          active: { type: 'boolean' },
          score: { type: 'number' },
        },
      };

      assert.ok(
        validateConfig(
          { age: 25, name: 'test', active: true, score: 1.5 },
          { properties: schema.properties, type: 'object' }
        ).valid
      );
      assert.ok(
        !validateConfig({ age: '25' }, { properties: schema.properties, type: 'object' }).valid
      );
      assert.ok(
        !validateConfig({ name: 123 }, { properties: schema.properties, type: 'object' }).valid
      );
    });

    test('validates enum values', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'sent', 'failed'] },
        },
      };

      assert.ok(
        validateConfig({ status: 'pending' }, { properties: schema.properties, type: 'object' })
          .valid
      );
      assert.ok(
        !validateConfig({ status: 'unknown' }, { properties: schema.properties, type: 'object' })
          .valid
      );
    });

    test('validates URL format', () => {
      const schema = {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'url' },
        },
      };

      assert.ok(
        validateConfig(
          { url: 'https://example.com' },
          { properties: schema.properties, type: 'object' }
        ).valid
      );
      assert.ok(
        !validateConfig({ url: 'not-a-url' }, { properties: schema.properties, type: 'object' })
          .valid
      );
    });

    test('validates nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
            required: ['name'],
          },
        },
      };

      assert.ok(
        validateConfig(
          { user: { name: 'test', email: 'test@example.com' } },
          { properties: schema.properties, type: 'object' }
        ).valid
      );
      assert.ok(
        !validateConfig(
          { user: { email: 'test@example.com' } },
          { properties: schema.properties, type: 'object' }
        ).valid
      );
    });

    test('validates arrays', () => {
      const schema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };

      assert.ok(
        validateConfig({ tags: ['a', 'b', 'c'] }, { properties: schema.properties, type: 'object' })
          .valid
      );
      assert.ok(
        !validateConfig({ tags: ['a', 123] }, { properties: schema.properties, type: 'object' })
          .valid
      );
    });

    test('rejects additional properties when disabled', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };

      assert.ok(validateConfig({ name: 'test' }, schema).valid);
      assert.ok(!validateConfig({ name: 'test', extra: 'field' }, schema).valid);
    });
  });

  describe('mergeWithDefaults', () => {
    test('applies defaults', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer', default: 18 },
          active: { type: 'boolean', default: true },
        },
      };

      const result = mergeWithDefaults({ name: 'test' }, schema);
      assert.strictEqual(result.age, 18);
      assert.strictEqual(result.active, true);
    });

    test('preserves existing values', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', default: 'default' },
        },
      };

      const result = mergeWithDefaults({ name: 'custom' }, schema);
      assert.strictEqual(result.name, 'custom');
    });

    test('applies nested defaults', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string', default: 'default' },
              settings: {
                type: 'object',
                properties: {
                  theme: { type: 'string', default: 'dark' },
                },
              },
            },
          },
        },
      };

      const result = mergeWithDefaults({ user: { name: 'test' } }, schema);
      assert.strictEqual(result.user.name, 'test');
      assert.strictEqual(result.user.settings.theme, 'dark');
    });
  });
});
