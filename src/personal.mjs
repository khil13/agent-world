// Everything a visitor chooses just for themselves (effects on or off, the activity feed open, and later colours, names, sound)
// is kept in their own browser under one name each. Browser storage can be blocked (private windows, strict settings), full, or
// hold a value that is damaged or of the wrong kind, so nothing here ever throws: a read gives the fallback and a write says
// whether it was kept. Text choices are saved as plain text, exactly as earlier visits saved them.
const PREFIX = 'world.';

export const browserStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };   // even asking for it can throw

export function personal(storage = browserStorage()) {
  const read = name => { try { return storage?.getItem(PREFIX + name) ?? null; } catch { return null; } };
  const write = (name, text) => { try { if (!storage) return false; storage.setItem(PREFIX + name, text); return true; } catch { return false; } };
  return {
    // A choice from a fixed list of words. Anything saved that is not on the list is ignored.
    choice(name, allowed, fallback) { const v = read(name); return v !== null && allowed.includes(v) ? v : fallback; },
    setChoice(name, value, allowed) { return (!allowed || allowed.includes(value)) && write(name, String(value)); },
    // A structured choice. `valid` may refuse a value that parsed but is not the right kind.
    json(name, fallback, valid = () => true) { try { const v = JSON.parse(read(name)); return v !== null && valid(v) ? v : fallback; } catch { return fallback; } },
    setJson(name, value) { try { return write(name, JSON.stringify(value)); } catch { return false; } },
    forget(name) { try { storage?.removeItem(PREFIX + name); } catch { /* blocked: nothing to forget */ } },
  };
}
