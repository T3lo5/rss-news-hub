import assert from 'node:assert';
import { describe, mock, test } from 'node:test';

describe('Keyboard Shortcuts Logic', () => {
  function createKeyboardEvent(key) {
    return { key, preventDefault: mock.fn() };
  }

  function handleKeyDown(event, shortcuts) {
    for (const shortcut of shortcuts) {
      if (event.key.toLowerCase() === shortcut.key.toLowerCase()) {
        if (shortcut.preventDefault) {
          event.preventDefault();
        }
        shortcut.handler();
        return true;
      }
    }
    return false;
  }

  function isInputElement(target) {
    return (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable === true)
    );
  }

  test('shortcut handler is called on matching key', () => {
    const handler = mock.fn();
    const shortcuts = [{ key: 's', description: 'Open stats', handler }];

    const event = createKeyboardEvent('s');
    handleKeyDown(event, shortcuts);

    assert.strictEqual(handler.mock.callCount(), 1);
  });

  test('shortcut handler is not called for non-matching key', () => {
    const handler = mock.fn();
    const shortcuts = [{ key: 's', description: 'Open stats', handler }];

    const event = createKeyboardEvent('x');
    handleKeyDown(event, shortcuts);

    assert.strictEqual(handler.mock.callCount(), 0);
  });

  test('shortcut is case insensitive', () => {
    const handler = mock.fn();
    const shortcuts = [{ key: 'S', description: 'Open stats', handler }];

    const event = createKeyboardEvent('s');
    handleKeyDown(event, shortcuts);

    assert.strictEqual(handler.mock.callCount(), 1);
  });

  test('shortcut disabled in input elements', () => {
    const handler = mock.fn();
    const shortcuts = [{ key: 's', description: 'Open stats', handler, disabledInInputs: true }];

    const event = createKeyboardEvent('s');
    event.target = { tagName: 'INPUT' };

    if (!(shortcuts[0].disabledInInputs && isInputElement(event.target))) {
      handleKeyDown(event, shortcuts);
    }

    assert.strictEqual(handler.mock.callCount(), 0);
  });

  test('shortcut works outside input elements', () => {
    const handler = mock.fn();
    const shortcuts = [{ key: 's', description: 'Open stats', handler, disabledInInputs: true }];

    const event = createKeyboardEvent('s');
    event.target = { tagName: 'DIV' };

    if (!(shortcuts[0].disabledInInputs && isInputElement(event.target))) {
      handleKeyDown(event, shortcuts);
    }

    assert.strictEqual(handler.mock.callCount(), 1);
  });

  test('preventDefault is called when specified', () => {
    const handler = mock.fn();
    const shortcuts = [{ key: '/', description: 'Focus search', handler, preventDefault: true }];

    const event = createKeyboardEvent('/');
    handleKeyDown(event, shortcuts);

    assert.strictEqual(event.preventDefault.mock.callCount(), 1);
  });

  test('multiple shortcuts can be registered', () => {
    const handlers = {
      s: mock.fn(),
      r: mock.fn(),
      escape: mock.fn(),
    };

    const shortcuts = [
      { key: 's', description: 'Open stats', handler: handlers.s },
      { key: 'r', description: 'Refresh', handler: handlers.r },
      { key: 'Escape', description: 'Close modals', handler: handlers.escape },
    ];

    handleKeyDown(createKeyboardEvent('s'), shortcuts);
    handleKeyDown(createKeyboardEvent('r'), shortcuts);
    handleKeyDown(createKeyboardEvent('Escape'), shortcuts);

    assert.strictEqual(handlers.s.mock.callCount(), 1);
    assert.strictEqual(handlers.r.mock.callCount(), 1);
    assert.strictEqual(handlers.escape.mock.callCount(), 1);
  });

  test('only first matching shortcut is executed', () => {
    const handler1 = mock.fn();
    const handler2 = mock.fn();

    const shortcuts = [
      { key: 's', description: 'First', handler: handler1 },
      { key: 's', description: 'Second', handler: handler2 },
    ];

    handleKeyDown(createKeyboardEvent('s'), shortcuts);

    assert.strictEqual(handler1.mock.callCount(), 1);
    assert.strictEqual(handler2.mock.callCount(), 0);
  });
});
