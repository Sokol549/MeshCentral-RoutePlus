/** 
* @description MeshCentral RoutePlus Plugin
* @author Ryan Blenis
* @copyright 
* @license Apache-2.0
*/

"use strict";

module.exports.routeplus = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.debug = obj.meshServer.debug;
    obj.onlineNodes = [];
    obj.VIEWS = __dirname + '/views/';
    obj.exports = [
      'onWebUIStartupEnd',
      'openSettings',
      'goPageStart',
      'mapUpdate',
      'resizeContent',
      'onDeviceRefreshEnd',
      'setUserRdpLinks',
      'updateUserRdpLinks',
      'dlRDPfile',
      'updateRdpDeviceLinks',
      'cantMap',
      'batchResult',
      'scanResult'
    ];
    
    obj.server_startup = function() {
        obj.meshServer.pluginHandler.routeplus_db = require (__dirname + '/db.js').CreateDB(obj.meshServer);
        obj.db = obj.meshServer.pluginHandler.routeplus_db;
        // Reconcile connected agents periodically, including after plugin/server startup.
        // This also renews the short-lived relay authorization used by new connections.
        obj.routeRefreshTimer = setInterval(function() {
            Object.keys(obj.meshServer.webserver.wsagents || {}).forEach(function(node) {
                obj.restoreRoutesForNode(node);
            });
        }, 60000);
    };
    
    obj.onWebUIStartupEnd = function() {
        var bar = document.getElementById('page_leftbar');
        if (bar && !document.getElementById('routePlusSidebar')) {
            var button = document.createElement('div');
            button.id = 'routePlusSidebar';
            button.title = 'RoutePlus';
            button.setAttribute('role', 'button');
            button.setAttribute('tabindex', '0');
            button.setAttribute('aria-label', button.title);
            button.style.cssText = 'cursor:pointer;display:flex;align-items:center;justify-content:center;height:60px;color:white';
            button.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="7" height="6" rx="1"/><rect x="15" y="15" width="7" height="6" rx="1"/><path d="M9 6h5a3 3 0 0 1 3 3v3m-3-2 3 3 3-3M15 18h-5a3 3 0 0 1-3-3v-3m3 2-3-3-3 3"/></svg>';
            button.onclick = function() { pluginHandler.routeplus.openSettings(); };
            button.onkeydown = function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); button.click(); } };
            bar.appendChild(button);
        }
        var old = Q('plugin_routePlusSettings');
        if (old) old.parentNode.removeChild(old);
        pluginHandler.routeplus.updateUserRdpLinks();
    };

    obj.batchResult = function() {};
    obj.scanResult = function() {};

    obj.updateUserRdpLinks = function() {
        if (userinfo == null) { setTimeout(pluginHandler.routeplus.updateUserRdpLinks, 100); return; }
        meshserver.send({
            'action': 'plugin',
            'plugin': 'routeplus',
            'pluginaction': 'getRdpLinks',
            'user': userinfo._id
        });
    };
    
    obj.updateRdpDeviceLinks = function() {
        var links = document.querySelectorAll('.routePlusRdpLink');
        if (links.length) {
            links.forEach(function(l) {
                l.parentNode.removeChild(l);
            });
        }
        if (pluginHandler.routeplus.myRDPLinks != null) {
            if (currentNode != null && pluginHandler.routeplus.myRDPLinks[currentNode._id] != null) {
                let l = pluginHandler.routeplus.myRDPLinks[currentNode._id];
                var holderC = Q('p10html3'), holder = holderC.querySelectorAll('.p10html3left')[0];
                let tpl = `<a href="#" class="routePlusRdpLink" onclick="pluginHandler.routeplus.dlRDPfile('${l}', '${currentNode.name}');">RoutePlus RDP</a>`;
                holder.insertAdjacentHTML( 'beforeend', tpl );
            }
        }
    };
    
    obj.onDeviceRefreshEnd = function() {
        pluginHandler.routeplus.updateRdpDeviceLinks();
    };
    
    obj.dlRDPfile = function(port, name) {
        var element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + 'full address:s:127.0.0.1:' + port);
        element.setAttribute('download', encodeURIComponent(name) + '.rdp');
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };
    
    obj.hook_userLoggedIn = function(user) {
        var myComp = null;
        const rcookie = parent.parent.encodeCookie({ userid: user._id, domainid: user.domain }, obj.meshServer.loginCookieEncryptionKey);
        obj.debug('PLUGIN', 'RoutePlus', 'User logged in... Processing');
        obj.onlineNodes = Object.keys(obj.meshServer.webserver.wsagents);
        //console.log('s1', obj.meshServer.webserver.wssessions);
        //console.log('s2', Object.keys(obj.meshServer.webserver.wssessions2));
        obj.db.getMyComputer(user._id)
        .then(mys => {
            if (mys.length) {
                myComp = mys[0].node;
            }
            return obj.db.getUserMaps(user._id);
        })
        .then((maps) => {
            obj.debug('PLUGIN', 'RoutePlus', 'Number of user maps found: ' + maps.length);
            if (maps.length == 0) return;
            maps.forEach(map => {
                //if (obj.onlineNodes.indexOf(fromNode) === -1) return; // skip offline nodes
                if (map.fromNode || myComp) obj.startRoute(map.fromNode || myComp, map, rcookie);
            });
        })
        .catch(e => console.log('PLUGIN: RoutePlus: Error starting routes for user '+ user._id + '. Error was: ', e));
        
    };
    
    obj.restoreRoutesForNode = function(nodeId) {
        if (!obj.db || !obj.db.getMyComputerByNode) return;
        Promise.all([obj.db.getMyComputerByNode(nodeId), obj.db.getMapsBySource(nodeId)])
        .then(function(results) {
            var legacy = results[0].map(function(computer) {
                return obj.db.getUserMaps(computer.user).then(function(maps) {
                    return maps.filter(function(map) { return !map.fromNode; });
                });
            });
            return Promise.all(legacy).then(function(groups) {
                var maps = results[1].concat([].concat.apply([], groups));
                maps.forEach(function(map) {
                    var user = obj.meshServer.webserver.users[map.user];
                    if (!user) return;
                    var cookie = parent.parent.encodeCookie({ userid: map.user, domainid: user.domain }, obj.meshServer.loginCookieEncryptionKey);
                    obj.startRoute(nodeId, map, cookie);
                });
            });
        })
        .catch(function(e) { console.log('PLUGIN: RoutePlus: Error restoring routes: ', e); });
    };

    obj.hook_agentCoreIsStable = function(myparent, gp) {
        obj.restoreRoutesForNode(myparent.dbNodeKey);
    };

    obj.startRoute = function(comp, map, rcookie) {
        const command = {
            action: 'plugin',
            plugin: 'routeplus',
            pluginaction: 'startRoute',
            mid: map._id,
            rauth: rcookie,
            nodeid: map.toNode,
            remotetarget: map.toIP,
            remoteport: map.port,
            localport: map.localport,
            forceSrcPort: map.forceSrcPort ? map.forceSrcPort : false
        };
        //obj.debug('PLUGIN', 'RoutePlus', 'Mapping route to ', map.toNode);
        try { 
            obj.debug('PLUGIN', 'RoutePlus', 'Starting route ' + map._id + ' to ' + comp);
            obj.meshServer.webserver.wsagents[comp].send(JSON.stringify(command)); 
        } catch (e) { 
            obj.debug('PLUGIN', 'RoutePlus', 'Could not send map to ' + comp); 
        }
    };
    
    obj.mapUpdate = function() {
        // placeholder. If settings is never opened, updates sent to user throw console error.
    };
    
    obj.cantMap = function(e, msg) {
        if (pluginHandler.routeplus.cantMapStore == null) pluginHandler.routeplus.cantMapStore = [];
        pluginHandler.routeplus.cantMapStore.push(msg.mapId);
        try {
            pluginHandler.routeplus.cantMapIn();
        } catch (e) { }
    };
    
    obj.setUserRdpLinks = function(state, msg) {
        var links = msg.data;
        pluginHandler.routeplus.myRDPLinks = {};
        if (links.length) {
            links.forEach(function(l) {
                pluginHandler.routeplus.myRDPLinks[l.toNode] = l.localport;
            });
        }
        pluginHandler.routeplus.updateRdpDeviceLinks();
    };
    
    obj.openSettings = function() {
        // Let MeshCentral and other plugins close their current page first.
        if (typeof go === 'function') go(1);
        if (Q('routePlusSettings')) pluginHandler.routeplus.goPageStart();
        var col = document.getElementById('column_l');
        if (!col) return;
        var children = Array.prototype.slice.call(col.children);
        children.forEach(function(child) {
            child.setAttribute('data-routeplus-display', child.style.display);
            child.style.display = 'none';
        });
        var page = document.createElement('div');
        page.id = 'routePlusSettings';
        page.innerHTML = '<iframe id="routePlusiframe" src="pluginadmin.ashx?pin=routeplus" title="RoutePlus" frameborder="0" style="display:block;width:100%;height:calc(100vh - 105px);min-height:450px;border:0"></iframe>';
        col.appendChild(page);
        xxcurrentView = null;
        var button = Q('routePlusSidebar');
        if (button) { button.style.backgroundColor = '#fff'; button.style.color = '#174578'; button.setAttribute('aria-current', 'page'); }
    };

    obj.goPageStart = function() {
        var page = Q('routePlusSettings');
        if (!page) return;
        var col = page.parentNode;
        page.parentNode.removeChild(page);
        Array.prototype.forEach.call(col.children, function(child) {
            if (child.hasAttribute('data-routeplus-display')) {
                child.style.display = child.getAttribute('data-routeplus-display');
                child.removeAttribute('data-routeplus-display');
            }
        });
        var button = Q('routePlusSidebar');
        if (button) { button.style.backgroundColor = ''; button.style.color = 'white'; button.removeAttribute('aria-current'); }
        pluginHandler.routeplus.mapUpdate = function() {};
        pluginHandler.routeplus.batchResult = function() {};
        pluginHandler.routeplus.scanResult = function() {};
        pluginHandler.routeplus.cantMapIn = null;
    };

    obj.resizeContent = function() {};

    obj.handleAdminReq = function(req, res, user) {
        if ((user.siteadmin & 0xFFFFFFFF) == 1 && req.query.admin == 1) 
        {
            // admin wants admin, grant
            var vars = {};
            res.render(obj.VIEWS + 'admin', vars);
            return;
        } else {
            var vars = {};
            obj.db.getUserMaps(user._id)
            .then(maps => {
                if (maps.length) vars.mappings = JSON.stringify(maps).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
                else vars.mappings = 'null';
                return obj.db.getMyComputer(user._id);
            })
            .then(mys => {
                if (mys.length) {
                    vars.myComputer = JSON.stringify(mys[0]).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
                } else {
                    vars.myComputer = 'null';
                }
                return Promise.resolve();
            })
            .then(() => {
                res.render(obj.VIEWS + 'user', vars);
            })
            .catch(e => console.log('PLUGIN: RoutePlus: Error parsing user options. ', e));
            
            return;
        }
        res.sendStatus(401); 
        return;
    };
    
    obj.removeMapFromComp = function(id) {
        var usr = null;
        obj.endRoute(id)
        .then(() => {
            return obj.db.get(id);
        })
        .then((maps) => {
            if (maps.length) {
                usr = maps[0].user;
            }
            return obj.db.delete(id);
        })
        .then(() => obj.db.getUserMaps(usr))
        .then(maps => {
            var x = { action: "plugin", plugin: "routeplus", method: "mapUpdate", data: maps };
            obj.sendUpdateToUser(usr, x);
            return Promise.resolve();
        })
        .catch(e => console.log('PLUGIN: RoutePlus: Error removing map: ', e));
    };
    obj.endRoute = function (mapId) {
        var mapRef = null;
        return obj.db.get(mapId)
            .then((maps) => {
                mapRef = maps[0];
                if (!maps.length) return [];
                if (maps[0].fromNode) return [{ node: maps[0].fromNode }];
                return obj.db.getMyComputer(maps[0].user);
            })
            .then((mcs) => {
                var mc = mcs[0];
                if (!mc || !mapRef) return;
                // destroy the user map
                const cmd = {
                    action: 'plugin',
                    plugin: 'routeplus',
                    pluginaction: 'endRoute',
                    mid: mapId
                };
                try { 
                    obj.debug('PLUGIN', 'RoutePlus', 'Ending route for ID ' + mapId + ' (User: ' + mapRef.user + ')'); 
                    obj.meshServer.webserver.wsagents[mc.node].send(JSON.stringify(cmd)); 
                } catch (e) { 
                    obj.debug('PLUGIN', 'RoutePlus', 'Could not end map route for ' + mc.node + ' (agent offline)'); 
                }
            });
    };
    obj.sendUpdateToUser = function(user, msg) {
        if (obj.meshServer.webserver.wssessions[user] != null) {
            obj.meshServer.webserver.wssessions[user].forEach(function(sess) {
                obj.meshServer.webserver.wssessions2[sess.sessionId].send(JSON.stringify(msg));
            });
        }
    };
    obj.pendingScans = Object.create(null);
    obj.startScan = function(command, client) {
        function send(data) { if (client.ws && client.ws.send) client.ws.send(JSON.stringify({ action: 'plugin', plugin: 'routeplus', method: 'scanResult', data: data })); }
        if (!client.domain || !client.user || typeof command.node !== 'string' || !command.node || !Number.isInteger(command.port) || command.port < 1 || command.port > 65535) return send({ error: 'Некорректные параметры поиска.' });
        var agent = obj.meshServer.webserver.wsagents[command.node];
        if (!agent) return send({ error: 'Агент на выбранном компьютере не подключён.' });
        if (Object.keys(obj.pendingScans).some(function(id) { return obj.pendingScans[id].node === command.node; })) return send({ error: 'На этом компьютере уже выполняется поиск.' });
        try {
            obj.meshServer.webserver.GetNodeWithRights(client.domain, client.user, command.node, function(node, rights, visible) {
                if (!node || !visible || !(rights & 8)) return send({ error: 'Нет прав удалённого управления на выбранный компьютер.' });
                // Recheck after the asynchronous rights lookup.
                if (obj.meshServer.webserver.wsagents[command.node] !== agent || Object.keys(obj.pendingScans).some(function(id) { return obj.pendingScans[id].node === command.node; })) return send({ error: 'Агент отключился или поиск уже выполняется.' });
                var id = require('crypto').randomBytes(16).toString('hex');
                var timer = setTimeout(function() { delete obj.pendingScans[id]; send({ error: 'Агент не ответил на запрос поиска. Проверьте, что плагин обновлён на сервере и агенте.' }); }, 90000);
                obj.pendingScans[id] = { node: command.node, agent: agent, send: send, timer: timer, port: command.port };
                try { agent.send(JSON.stringify({ action: 'plugin', plugin: 'routeplus', pluginaction: 'scanNetwork', requestId: id, port: command.port })); }
                catch (e) { clearTimeout(timer); delete obj.pendingScans[id]; send({ error: 'Не удалось отправить запрос агенту.' }); }
            });
        } catch (e) { send({ error: 'Не удалось проверить доступ к устройству.' }); }
    };

    // A batch is processed in order so fixed source ports and status reporting are deterministic.
    obj.addMaps = async function(command, client) {
        var report = { created: 0, skipped: 0, failed: 0, errors: [] };
        var reply = function(method, data) {
            if (client.ws && client.ws.send) client.ws.send(JSON.stringify({ action: 'plugin', plugin: 'routeplus', method: method, data: data }));
        };
        try {
            var ids = Array.isArray(command.toNodes) ? Array.from(new Set(command.toNodes)) : [];
            var port = command.port, portEnd = command.portEnd, start = command.srcport, end = command.endport;
            var targetPorts = [];
            if (Array.isArray(command.ports)) {
                targetPorts = Array.from(new Set(command.ports));
            } else if (Number.isInteger(port) && Number.isInteger(portEnd) && port >= 1 && portEnd >= port && portEnd <= 65535 && portEnd - port < 5000) {
                for (var p = port; p <= portEnd; p++) targetPorts.push(p);
            }
            var routeCount = ids.length * targetPorts.length;
            if (!client.domain || !client.user || typeof command.fromNode !== 'string' || !command.fromNode || !ids.length || ids.some(function(id) { return typeof id !== 'string' || !id; }) || !targetPorts.length || targetPorts.some(function(p) { return !Number.isInteger(p) || p < 1 || p > 65535; }) || routeCount > 5000 || !Number.isInteger(start) || start < 0 || start > 65535 || !Number.isInteger(end) || end < 0 || end > 65535 || (start && (end < start || start + routeCount - 1 > end)) || (!start && end) || (command.toIP != null && (typeof command.toIP !== 'string' || command.toIP.length > 255))) throw new Error('Некорректные параметры или слишком много маршрутов (максимум 5000).');
            var checkNode = function(id) { return new Promise(function(resolve) {
                try { obj.meshServer.webserver.GetNodeWithRights(client.domain, client.user, id, function(node, rights, visible) {
                    resolve(!!node && !!visible && ((rights & 8) !== 0));
                }); } catch (e) { resolve(false); }
            }); };
            if (!await checkNode(command.fromNode)) throw new Error('Нет прав удалённого управления на исходный компьютер.');
            var maps = await obj.db.getUserMaps(command.user);
            var legacy = await obj.db.getMyComputer(command.user);
            var legacySource = legacy.length ? legacy[0].node : null;
            var cookie = parent.parent.encodeCookie({ userid: command.user, domainid: client.user.domain }, obj.meshServer.loginCookieEncryptionKey);
            var nextPort = start;
            for (var i = 0; i < ids.length; i++) {
              var destination = ids[i];
              if (!await checkNode(destination)) { report.failed += targetPorts.length; report.errors.push('Нет доступа: ' + destination); continue; }
              for (var j = 0; j < targetPorts.length; j++) {
                var targetPort = targetPorts[j];
                var localPort = 0;
                var duplicate = maps.some(function(m) { return (m.fromNode || legacySource) === command.fromNode && m.toNode === destination && Number(m.port) === targetPort && (m.toIP || '') === (command.toIP || ''); });
                if (duplicate) { report.skipped++; continue; }
                if (start) {
                    while (nextPort <= end && maps.some(function(m) { return (m.fromNode || legacySource) === command.fromNode && Number(m.localport) === nextPort; })) nextPort++;
                    if (nextPort > end) { report.failed++; report.errors.push('Нет свободных портов RoutePlus в выбранном диапазоне.'); continue; }
                    localPort = nextPort++;
                }
                try {
                    var info = await obj.db.addMap(command.user, destination, targetPort, localPort, !!localPort, command.toIP || null, command.fromNode);
                    var created = await obj.db.get(info.insertedId);
                    if (!created.length) throw new Error('Не удалось прочитать созданный маршрут.');
                    maps.push(created[0]);
                    report.created++;
                    obj.startRoute(command.fromNode, created[0], cookie);
                } catch (e) { report.failed++; report.errors.push('Ошибка создания маршрута для ' + destination + ': ' + e.message); }
              }
            }
            reply('mapUpdate', await obj.db.getUserMaps(command.user));
        } catch (e) { report.errors.push(e.message); }
        reply('batchResult', report);
    };

    obj.serveraction = function(command, myparent, grandparent) {
        var userActions = ['scanNetwork', 'addMaps', 'addMap', 'removeMap', 'setMyComputer', 'rdpLinkUpdate', 'getRdpLinks'];
        if (userActions.indexOf(command.pluginaction) >= 0) {
            if (!myparent || !myparent.user) return;
            command.user = myparent.user._id;
        }
        switch (command.pluginaction) {
            case 'scanNetwork':
                obj.startScan(command, myparent);
            break;
            case 'scanNetworkResult':
                var scan = typeof command.requestId === 'string' && obj.pendingScans[command.requestId];
                if (!scan || myparent !== scan.agent || myparent.dbNodeKey !== scan.node) break;
                clearTimeout(scan.timer);
                delete obj.pendingScans[command.requestId];
                var addresses = Array.isArray(command.addresses) ? command.addresses.filter(function(ip) { return typeof ip === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip); }).slice(0, 508) : [];
                scan.send({ node: scan.node, port: scan.port, addresses: addresses, networks: Array.isArray(command.networks) ? command.networks.slice(0, 2) : [], error: typeof command.error === 'string' ? command.error.slice(0, 300) : '' });
            break;
            case 'addMaps':
                obj.addMaps(command, myparent);
            break;
            case 'addMap':
                var newMapId = null, myComp = null;
                if (!command.fromNode || !command.toNode || !Number.isInteger(command.port) || command.port < 1 || command.port > 65535 || !Number.isInteger(command.srcport) || command.srcport < 0 || command.srcport > 65535 || !myparent.domain || typeof obj.meshServer.webserver.GetNodeWithRights !== 'function') return;
                var checkNode = function(id) { return new Promise(function(resolve) {
                    obj.meshServer.webserver.GetNodeWithRights(myparent.domain, myparent.user, id, function(node, rights, visible) {
                        resolve(!!node && !!visible && ((rights & 8) !== 0));
                    });
                }); };
                Promise.all([checkNode(command.fromNode), checkNode(command.toNode)]).then(function(allowed) {
                    if (!allowed[0] || !allowed[1]) throw new Error('Remote control permission is required on both nodes');
                    return obj.db.addMap(command.user, command.toNode, command.port, command.srcport, command.forceSrcPort, command.toIP, command.fromNode);
                })
                .then((newMapInfo) => {
                    newMapId = newMapInfo.insertedId;
                    return obj.db.getUserMaps(command.user);
                })
                .then(maps => {
                    var x = { action: "plugin", plugin: "routeplus", method: "mapUpdate", data: maps};
                    myparent.ws.send(JSON.stringify(x));
                    return obj.db.getMyComputer(command.user);
                })
                .then((mcs) => {
                    myComp = command.fromNode || (mcs[0] && mcs[0].node);
                    return obj.db.get(newMapId);
                })
                .then((maps) => {
                    var uinfo = command.user.split('/');
                    var rcookie = parent.parent.encodeCookie({ userid: command.user, domainid: uinfo[1] }, obj.meshServer.loginCookieEncryptionKey);

                    if (myComp && maps.length) obj.startRoute(myComp, maps[0], rcookie);
                })
                .catch(e => console.log('PLUGIN: RoutePlus: Error adding a map: ', e));
            break;
            case 'removeMap':
                obj.db.get(command.id).then(function(maps) { if (maps.length && maps[0].user === command.user) obj.removeMapFromComp(command.id); });
            break;
            case 'userLoggedIn':
                // obj.userLoggedIn();
            break;
            case 'setMyComputer':
                // remove mappings from current computer first
                obj.db.getMyComputer(command.user)
                .then(mys => {
                    if (mys.length == 0) return Promise.resolve();
                    var my = mys[0];
                    return obj.db.getUserMaps(mys[0].user)
                        .then(maps => {
                            obj.debug('PLUGIN', 'RoutePlus', 'setMyComputer maps length: ' + maps.length); 
                            if (maps.length == 0) return Promise.resolve();
                            maps.forEach(function(map) {
                                if (!map.fromNode) obj.endRoute(map._id);
                            });
                            return Promise.resolve();
                        })
                        .catch(e => console.log('PLUGIN: RoutePlus: setMyComputer user map changing failed with: ', e));
                })
                .then(() => {
                    return obj.db.setMyComputer({
                        user: command.user,
                        node: command.node
                    });
                })
                .then(() => { // update new MyComputer with mappings
                    return obj.db.getUserMaps(command.user)
                        .then(maps => {
                            if (maps.length == 0) return Promise.resolve();
                            var uinfo = command.user.split('/');
                            var rcookie = parent.parent.encodeCookie({ userid: command.user, domainid: uinfo[1] }, obj.meshServer.loginCookieEncryptionKey);
                            maps.forEach(function(map) {
                                if (!map.fromNode) obj.startRoute(command.node, map, rcookie);
                            });
                            return Promise.resolve();
                        })
                        .catch(e => console.log('PLUGIN: RoutePlus: setMyComputer user map adding failed with: ', e));
                })
                .then(() => { // update front end
                    obj.db.getMyComputer(command.user)
                    .then(rows => {
                        if (rows.length) {
                            var x = { action: "plugin", plugin: "routeplus", method: "myComputerUpdate", data: rows[0]};
                            myparent.ws.send(JSON.stringify(x));
                        }
                    })
                });
            break;
            case 'updateMapPort':
                obj.debug('PLUGIN', 'RoutePlus', 'Updating mapped port for ' + command.mid + ' to ' + command.port);
                var upUser = null;
                obj.db.update(command.mid, { localport: command.port })
                .then(() => {
                    return obj.db.get(command.mid);
                })
                .then((mObj) => {
                    mObj = mObj[0];
                    upUser = mObj.user;
                    return obj.db.getUserMaps(mObj.user);
                })
                .then(maps => {
                    var x = { action: "plugin", plugin: "routeplus", method: "mapUpdate", data: maps};
                    //myparent.ws.send(JSON.stringify(x));
                    //obj.debug('PLUGIN', 'RoutePlus', 'Checking for session for '+ maps[0].user);
                    // send the port to the RoutePlus settings screen
                    obj.sendUpdateToUser(maps[0].user, x);
                    //console.log('s1', Object.keys(obj.meshServer.webserver.wssessions));
                    //var targets = ['*', 'server-users'];
                    //obj.meshServer.DispatchEvent(targets, obj, { action: 'plugin', plugin: 'routeplus', pluginaction: 'mapUpdate', data: maps });
                })
                .then(() => {
                    return obj.db.getRdpLinksForUser(upUser)
                })
                .then(links => {
                    var x = { action: "plugin", plugin: "routeplus", method: "setUserRdpLinks", data: links};
                    obj.sendUpdateToUser(upUser, x);
                })
                .catch(e => console.log('PLUGIN: RoutePlus: Error updating mapped port: ', e));
            break;
            case 'cantMapPort':
                obj.debug('PLUGIN', 'RoutePlus', 'Client cannot map forced port for id: ' + command.mid);
                obj.db.get(command.mid)
                .then(maps => {
                    var x = { action: "plugin", plugin: "routeplus", method: "cantMap", mapId: maps[0]._id };
                    obj.sendUpdateToUser(maps[0].user, x);
                })
                .catch(e => console.log('PLUGIN: RoutePlus: CantMap Reporting Error: ', e));
            break;
            case 'rdpLinkUpdate':
                var upUser = null;
                obj.db.get(command.mid).then(function(maps) { if (!maps.length || maps[0].user !== command.user) throw new Error('Map not owned by user'); return obj.db.update(command.mid, { rdplink: command.rdplink }); })
                .then(() => {
                    return obj.db.get(command.mid);
                })
                .then((mObj) => {
                    mObj = mObj[0];
                    upUser = mObj.user;
                    return obj.db.getUserMaps(mObj.user);
                })
                .then(maps => {
                    var x = { action: "plugin", plugin: "routeplus", method: "mapUpdate", data: maps};
                    obj.sendUpdateToUser(maps[0].user, x);
                })
                .then(() => {
                    return obj.db.getRdpLinksForUser(upUser)
                })
                .then(links => {
                    var x = { action: "plugin", plugin: "routeplus", method: "setUserRdpLinks", data: links};
                    obj.sendUpdateToUser(upUser, x);
                })
                .catch(e => console.log('PLUGIN: RoutePlus: Error updating RDP link setting: ', e));
            break;
            case 'getRdpLinks':
                obj.db.getRdpLinksForUser(command.user)
                .then(links => {
                    var x = { action: "plugin", plugin: "routeplus", method: "setUserRdpLinks", data: links};
                    obj.sendUpdateToUser(command.user, x);
                })
                .catch(e => console.log('PLUGIN: RoutePlus: Error updating RDP link maps: ', e));
            break;
            default:
                console.log('PLUGIN: RoutePlus: unknown action');
            break;
        }
    };
    
    return obj;
}
