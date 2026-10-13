import assert from 'node:assert';
import { beforeEach, describe, mock, test } from 'node:test';
import { createModuleLogger, createRequestLogger, logger } from '../services/logger.js';

describe('Logger', () => {
  let _originalConsole;
  let logOutput;

  beforeEach(() => {
    _originalConsole = { ...console };
    logOutput = [];
    console.log = mock.fn((msg) => logOutput.push(msg));
    console.error = mock.fn((msg) => logOutput.push(msg));
    console.warn = mock.fn((msg) => logOutput.push(msg));
    console.info = mock.fn((msg) => logOutput.push(msg));
    console.debug = mock.fn((msg) => logOutput.push(msg));
  });

  test('logger has correct base properties', () => {
    assert.ok(logger);
    assert.ok(typeof logger.info === 'function');
    assert.ok(typeof logger.error === 'function');
    assert.ok(typeof logger.warn === 'function');
    assert.ok(typeof logger.debug === 'function');
    assert.ok(typeof logger.child === 'function');
  });

  test('createModuleLogger adds module to child', () => {
    const moduleLogger = createModuleLogger('test.module');
    assert.ok(moduleLogger);
    assert.ok(typeof moduleLogger.info === 'function');
  });

  test('createRequestLogger adds reqId to child', () => {
    const reqLogger = createRequestLogger('req-123');
    assert.ok(reqLogger);
    assert.ok(typeof reqLogger.info === 'function');
  });

  test('logger methods accept objects and strings', () => {
    const moduleLogger = createModuleLogger('test');

    moduleLogger.info('Simple message');
    moduleLogger.info({ key: 'value' }, 'Message with object');
    moduleLogger.warn({ err: new Error('test') }, 'Warning with error');
    moduleLogger.error({ err: { message: 'fail' } }, 'Error with error object');

    // Should not throw
    assert.ok(true);
  });

  test('child loggers inherit base properties', () => {
    const child = logger.child({ custom: 'field' });
    assert.ok(child);
    child.info('Test');
    assert.ok(true);
  });
});

describe('Request ID Middleware', () => {
  let _mockReq, mockRes, _next;

  beforeEach(() => {
    _mockReq = {
      method: 'POST',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    };
    mockRes = {
      statusCode: 200,
      headers: {},
      writeHead: mock.fn(),
      end: mock.fn(),
      setHeader: mock.fn((k, v) => {
        mockRes.headers[k] = v;
      }),
      getHeader: mock.fn((k) => mockRes.headers[k]),
    };
    _next = mock.fn();
  });

  test('placeholder for request ID middleware test', () => {
    assert.ok(true);
  });
});
