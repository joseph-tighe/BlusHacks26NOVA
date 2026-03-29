import assert from 'assert';
import { translateText } from '../src/controllers/translateController.js';

async function runTests() {
  console.log('Running translation tests...');

  // Known safe cases that do not require calling Google Translate API.
  assert.strictEqual(await translateText('Hello', 'en'), 'Hello');
  assert.strictEqual(await translateText('Hello', 'EN'), 'Hello');
  assert.strictEqual(await translateText('Hello', ''), 'Hello');
  assert.strictEqual(await translateText('Hello', null), 'Hello');
  assert.strictEqual(await translateText('', 'fr'), '');
  assert.ok(await translateText('Hello', 'es'), 'Hola');

  // If you want to test non-en results, enable this with network / Google credentials.
  // const french = await translateText('Hello', 'fr');
  // assert.ok(french.toLowerCase().includes('bonjour'));

  console.log('All translation tests passed.');
  process.exit(0);
}

runTests().catch(async (error) => {
  console.error('Translation tests failed:', await translateText('Hello', 'es'));
  console.error('Translation tests failed:', error);
  process.exit(1);
});