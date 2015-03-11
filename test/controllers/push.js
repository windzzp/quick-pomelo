'use strict';

var Q = require('q');
var env = require('../env');
var quick = require('../../lib');
var logger = require('pomelo-logger').getLogger('test', __filename);

var dbConfig = env.dbConfig;

describe('push test', function(){
	beforeEach(env.dropDatabase.bind(null, dbConfig));
	after(env.dropDatabase.bind(null, dbConfig));

	it('push test', function(cb){
		var app = quick.mocks.app({serverId : 'server1', serverType : 'area'});

		app.set('memorydbConfig', dbConfig);
		app.set('controllersConfig', {basePath : 'lib/controllers'});
		app.set('pushConfig', {maxMsgCount : 2});

		app.load(quick.components.memorydb);
		app.load(quick.components.controllers);

		return Q.fcall(function(){
			return Q.ninvoke(app, 'start');
		})
		.then(function(){
			var push = app.controllers.push;
			var autoconn = app.memorydb.autoConnect();
			return autoconn.execute(function(){
				return Q.fcall(function(){
					//p1 join c1 (connector s1)
					return push.join('c1', 'p1', 's1');
				})
				.then(function(){
					//send persistent msg to p1
					return push.push('c1', null, 'chat', 'hello1', true);
				})
				.then(function(){
					//p2 (offline) join c1
					return push.join('c1', 'p2', '');
				})
				.then(function(){
					//send persistent msg to p1 & p2 (p2 will not receive notify but can read msg history)
					return push.push('c1', null, 'chat', 'hello2', true);
				})
				.then(function(){
					//send msg to p1 (p2 will not see this message)
					return push.push('c1', null, 'notify', 'context', false);
				})
				.then(function(){
					//p2 is online (connector s2)
					return push.connect('p2', 's2');
				})
				.then(function(){
					//send msg to p1 & p2 (both will receive notify)
					return push.push('c1', null, 'notify', 'context', false);
				})
				.then(function(){
					//send msg to p2 only
					return push.push('c1', ['p2'], 'notify', 'content', false);
				})
				.then(function(){
					//get message history
					return push.getMsgs('c1', 0)
					.then(function(ret){
						ret.length.should.eql(2);
						ret[0].should.eql({
							route : 'chat',
							msg : 'hello1',
							seq : 0,
						});
						ret[1].should.eql({
							route : 'chat',
							msg : 'hello2',
							seq : 1,
						});
					});
				})
				.then(function(){
					//send 3rd persistent message, will exceed history limit, history will be cut down
					return push.push('c1', null, 'chat', 'hello3', true);
				})
				.then(function(){
					//get history
					return push.getMsgs('c1', 0, 3)
					.then(function(ret){
						//can get only latest 2 messages
						ret.length.should.eql(2);
						ret[0].should.eql({
							route : 'chat',
							msg : 'hello2',
							seq : 1,
						});
						ret[1].should.eql({
							route : 'chat',
							msg : 'hello3',
							seq : 2,
						});
					});
				})
				.then(function(){
					return push.disconnect('p1');
				})
				.then(function(){
					return push.quit('c1', 'p1');
				})
				.then(function(){
					return push.quit('c1', 'p2');
				});
			});
		})
		.then(function(){
			return Q.ninvoke(app, 'stop');
		})
		.nodeify(cb);
	});
});