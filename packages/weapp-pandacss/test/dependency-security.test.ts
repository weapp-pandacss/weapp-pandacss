import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const uniRoot = path.resolve(import.meta.dirname, '../../../examples/uni-app-vue3')

async function verifyUniDependency(script: string) {
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import {createRequire} from 'node:module';
    const uniRequire = createRequire(process.argv[1]);
    ${script}
  `, path.join(uniRoot, 'package.json')], {
    cwd: uniRoot,
    // Run hostile inputs outside Vitest so an unpatched regexp cannot block its worker.
    timeout: 10_000,
  })
  return JSON.parse(stdout)
}

it('keeps Uni Intlify dotted translations while rejecting prototype pollution through its actual resolver', async () => {
  const result = await verifyUniDependency(`
    const sharedRequire = createRequire(uniRequire.resolve('@dcloudio/uni-cli-shared/package.json'));
    const core = sharedRequire('@intlify/core-base');
    const coreRequire = createRequire(sharedRequire.resolve('@intlify/core-base'));
    const resolver = coreRequire('@intlify/message-resolver');
    assert.equal(core.handleFlatJson, resolver.handleFlatJson);
    const messages = core.handleFlatJson({
      'greetings.hello': 'Hello {name}!',
      'greetings.nested.title': 'Nested translation',
    });
    assert.equal(resolver.resolveValue(messages, 'greetings.hello'), 'Hello {name}!');
    const context = core.createCoreContext({
      locale: 'en',
      fallbackLocale: 'en',
      messages: {en: messages},
      messageCompiler: core.compileToFunction,
    });
    const pollutionKey = 'weappPandaDependencyPolluted';
    assert.equal(Object.hasOwn(Object.prototype, pollutionKey), false);
    assert.throws(
      () => core.handleFlatJson(JSON.parse('{"__proto__.weappPandaDependencyPolluted":true}')),
      /unsafe key: __proto__/,
    );
    assert.equal(Object.hasOwn(Object.prototype, pollutionKey), false);
    console.log(JSON.stringify({
      greeting: core.translate(context, 'greetings.hello', {name: 'Panda'}),
      nested: core.translate(context, 'greetings.nested.title'),
    }));
  `)
  expect(result).toEqual({ greeting: 'Hello Panda!', nested: 'Nested translation' })
})

it('keeps Uni Express route matching and rejects long ambiguous parameter inputs within a bounded process', async () => {
  const result = await verifyUniDependency(`
    const pluginRequire = createRequire(uniRequire.resolve('@dcloudio/vite-plugin-uni/package.json'));
    const expressRequire = createRequire(pluginRequire.resolve('express/package.json'));
    const route = expressRequire('path-to-regexp');
    const keys = [];
    const flights = route('/flights/:from-:to', keys);
    assert.deepEqual(keys.map(key => key.name), ['from', 'to']);
    assert.deepEqual(flights.exec('/flights/SFO-LAX').slice(1), ['SFO', 'LAX']);
    assert.equal(flights.test('/flights/SFO-LAX/'), true);
    assert.equal(flights.test('/flights/SFO-LAX/extra'), false);
    const docs = route('/docs/:section?', []);
    assert.equal(docs.test('/docs'), true);
    assert.equal(docs.test('/docs/api'), true);
    const assets = route('/assets/*', []);
    assert.equal(assets.exec('/assets/icons/panda.svg')[1], 'icons/panda.svg');
    const router = pluginRequire('express').Router();
    router.get('/flights/:from-:to', () => {});
    const layer = router.stack[0];
    assert.equal(layer.match('/flights/%E5%8C%97%E4%BA%AC-%E4%B8%8A%E6%B5%B7'), true);
    assert.deepEqual(layer.params, {from: '北京', to: '上海'});
    // A failed suffix makes the old two-parameter regexp try quadratic partitions.
    const adversarial = '/flights/' + '-'.repeat(100_000) + '/extra';
    assert.equal(flights.test(adversarial), false);
    assert.equal(layer.match(adversarial), false);
    console.log(JSON.stringify({parameters: keys.map(key => key.name), longInputRejected: true}));
  `)
  expect(result).toEqual({ parameters: ['from', 'to'], longInputRejected: true })
})
