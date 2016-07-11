import { ApplicationFragment } from 'common/application/fragments';
import { INITIALIZE, LOAD } from 'common/application/events';
import { AcceptBus, WrapBus, AttachDefaultsBus } from 'mesh';
import RemoteBus from 'mesh-remote-bus';
import sift from 'sift';
import createServer from 'socket.io';

export const fragment = ApplicationFragment.create('application/socket.io-server', create);

function create(app) {
  app.busses.push(AcceptBus.create(sift({ type: LOAD }), WrapBus.create(load)));
  app.busses.push(AcceptBus.create(sift({ type: INITIALIZE }), WrapBus.create(initialize)));

  const port   = app.config.socketio.port;
  const logger = app.logger.createChild({ prefix: 'socket.io ' });

  function load(event) {
    logger.verbose('checking for existing socket.io instances');
  }

  function initialize() {
    logger.info('server on port %d', port);
    var server = createServer();

    server.on('connection', function(connection) {
      logger.info('client connected');
      var remoteBus = RemoteBus.create({
        addListener: connection.on.bind(connection, 'message'),
        send: connection.emit.bind(connection, 'message')
      }, AttachDefaultsBus.create({ remote: true }, app.bus));

      remoteBus = AcceptBus.create(sift({ public: true, remote: {$ne: true } }), remoteBus);

      app.busses.push(remoteBus);

      connection.once('close', function() {
        app.busses.splice(app.busses.indexOf(remoteBus), 1);
      });
    })

    server.listen(port);
  }

  function executeRemoteEvent(event) {
    app.logger.verbose('exec public event %s', event);
  }
}
