'use strict';
const assert = require('assert');
const createPlugin = require('../routeplus').routeplus;
const sent = [];
const server = {
  debug() {}, loginCookieEncryptionKey: 'key',
  webserver: { users: { 'user/domain/alice': { domain: 'domain' }, 'user/domain/bob': { domain: 'domain' } }, wsagents: { node1: { send: m => sent.push(JSON.parse(m)) } }, wssessions: {} }
};
const plugin = createPlugin({ parent: Object.assign(server, { encodeCookie: v => 'cookie:' + v.userid }) });
plugin.db = {
  getMyComputerByNode: async () => [{ user: 'user/domain/alice' }, { user: 'user/domain/bob' }, { user: 'user/domain/deleted' }],
  getUserMaps: async user => [{ _id: user, toNode: 'target', port: 22, localport: 10022 }]
};
plugin.hook_agentCoreIsStable({ dbNodeKey: 'node1' });
setImmediate(() => {
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(x => x.rauth).sort(), ['cookie:user/domain/alice', 'cookie:user/domain/bob']);
  assert(sent.every(x => x.pluginaction === 'startRoute'));
  console.log('Unattended restore and per-user authorization: OK');
});
