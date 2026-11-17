'use strict';
const assert = require('assert');
const createPlugin = require('../routeplus').routeplus;

async function main() {
    const maps = [{ _id: 'old', user: 'user/domain/alice', fromNode: 'source', toNode: 'old', port: 9, localport: 8001 }];
    const messages = [], started = [];
    const server = {
        debug() {}, loginCookieEncryptionKey: 'key', encodeCookie: () => 'cookie',
        webserver: { GetNodeWithRights(domain, user, id, cb) { cb({ _id: id }, id === 'denied' ? 0 : 8, true); } }
    };
    const plugin = createPlugin({ parent: server });
    plugin.db = {
        getUserMaps: async user => maps.filter(m => m.user === user),
        getMyComputer: async () => [],
        addMap: async (user, toNode, port, localport, forceSrcPort, toIP, fromNode) => {
            const id = String(maps.length);
            maps.push({ _id: id, user, toNode, port, localport, forceSrcPort, toIP, fromNode });
            return { insertedId: id };
        },
        get: async id => maps.filter(m => m._id === id)
    };
    plugin.startRoute = (source, map) => started.push([source, map.toNode, map.port, map.localport]);
    const client = { domain: {}, user: { _id: 'user/domain/alice', domain: 'domain' }, ws: { send: msg => messages.push(JSON.parse(msg)) } };
    const run = async extra => {
        messages.length = 0;
        await plugin.addMaps(Object.assign({ user: client.user._id, fromNode: 'source', toNodes: ['one', 'two'], port: 90, portEnd: 91, srcport: 8000, endport: 8005 }, extra), client);
        return messages.find(m => m.method === 'batchResult').data;
    };
    let result = await run({});
    assert.deepStrictEqual([result.created, result.skipped, result.failed], [4, 0, 0]);
    assert.deepStrictEqual(started.map(v => v.slice(1)), [['one', 90, 8000], ['one', 91, 8002], ['two', 90, 8003], ['two', 91, 8004]]);
    result = await run({});
    assert.strictEqual(result.skipped, 4);
    result = await run({ toNodes: ['denied'], ports: [37777, 80], srcport: 0, endport: 0 });
    assert.strictEqual(result.failed, 2);
    result = await run({ toNodes: ['three'], ports: [37777, 80, 554], srcport: 0, endport: 0 });
    assert.strictEqual(result.created, 3);
    assert.deepStrictEqual(started.slice(-3).map(v => v[2]), [37777, 80, 554]);
    result = await run({ toNodes: ['four'], port: 8000, portEnd: 8999, srcport: 0, endport: 0 });
    assert.strictEqual(result.created, 1000);
    result = await run({ toNodes: ['five'], port: 1, portEnd: 5001, srcport: 0, endport: 0 });
    assert(result.errors.length);
    console.log('Batch routes, port ranges, Dahua ports and permissions: OK');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
