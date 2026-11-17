'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const EventEmitter = require('events');
const createPlugin = require('../routeplus').routeplus;

async function main() {
    const sent = [], replies = [];
    const agent = { dbNodeKey: 'node', send: value => sent.push(JSON.parse(value)) };
    const server = { debug() {}, webserver: { wsagents: { node: agent }, GetNodeWithRights(domain, user, id, cb) { cb({}, 8, true); } } };
    const plugin = createPlugin({ parent: server });
    const client = { domain: {}, user: { _id: 'user/domain/test' }, ws: { send: data => replies.push(JSON.parse(data)) } };
    plugin.serveraction({ pluginaction: 'scanNetwork', node: 'node', port: 37777 }, client);
    assert.strictEqual(sent.length, 1);
    const request = sent[0];
    plugin.serveraction({ pluginaction: 'scanNetworkResult', requestId: request.requestId, addresses: ['192.168.1.1'] }, { dbNodeKey: 'node' });
    assert.strictEqual(replies.length, 0, 'different agent cannot supply results');

    const probes = [];
    const mockNet = { createConnection(options, callback) {
        probes.push(options.host);
        const socket = new EventEmitter(); socket.destroy = () => {};
        setImmediate(() => options.host === '192.168.1.2' ? callback() : socket.emit('error', new Error('closed')));
        return socket;
    } };
    const fakeOs = { networkInterfaces: () => ({ lan: [{ family: 'IPv4', address: '192.168.1.10', netmask: '255.255.255.0', internal: false }], loop: [{ family: 'IPv4', address: '127.0.0.1', internal: true }] }) };
    const mockRequire = name => name === 'net' ? mockNet : name === 'os' ? fakeOs : name === 'SimpleDataStore' ? { Shared: () => ({}) } : require(name);
    const context = { module: { exports: {} }, require: mockRequire, setTimeout, clearTimeout, console, isFinite };
    vm.runInNewContext(fs.readFileSync(require.resolve('../modules_meshcore/routeplus.js'), 'utf8'), context);
    const agentReply = await new Promise(resolve => context.module.exports.consoleaction(request, 0, null, { SendCommand: resolve }));
    assert.strictEqual(probes.length, 253);
    assert.deepStrictEqual(Array.from(agentReply.addresses), ['192.168.1.2']);
    plugin.serveraction(agentReply, agent);
    assert.strictEqual(replies.length, 1);
    assert.deepStrictEqual(replies[0].data.addresses, ['192.168.1.2']);
    console.log('Network scan, bounded private subnet and agent response verification: OK');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
