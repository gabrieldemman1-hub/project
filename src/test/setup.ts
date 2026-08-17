/**
 * Gives Node a real IndexedDB implementation so database code can be tested
 * without a browser. `fake-indexeddb` is a full in-memory implementation of the
 * spec, not a stub, so the tests exercise the same Dexie code paths the app does.
 */
import 'fake-indexeddb/auto'
