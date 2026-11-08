(function () {
  'use strict';
  var http = require('http');
  var https = require('https');
  var parse = require('url').parse;
  var server = http.createServer(function (request, response) {
    response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:8081');
    response.setHeader('Content-Type', 'application/json');
    var route = parse(request.url, true);
    var source = /^https:\/\/player\.aksor\.tv\/video\/([a-f0-9]{32})(?:[?#].*)?$/i.exec(route.query.url || '');
    if (request.method !== 'GET' || route.pathname !== '/resolve' || !source) {
      response.writeHead(404).end('{}');
      return;
    }
    function unavailable() {
      if (!response.finished) response.writeHead(502).end('{}');
    }
    var upstream = https.get({
      hostname: 'player.aksor.tv',
      path: '/api/video/' + source[1],
      headers: {Accept: 'application/json', Referer: 'https://player.aksor.tv/video/' + source[1]}
    }, function (result) {
      if (result.statusCode !== 200) { result.resume(); unavailable(); return; }
      var body = '';
      result.setEncoding('utf8');
      result.on('data', function (chunk) {
        body += chunk;
        if (body.length > 65536) { upstream.destroy(); unavailable(); }
      });
      result.on('end', function () {
        if (response.finished) return;
        try {
          var qualities = JSON.parse(body).qualities || {};
          var stream = qualities.q720 || qualities.q480 || qualities.q360 || qualities.q1080;
          if (typeof stream === 'string' && /^https:\/\//i.test(stream)) {
            response.end(JSON.stringify({url: stream}));
          } else unavailable();
        } catch (error) { unavailable(); }
      });
      result.on('error', unavailable);
    });
    upstream.setTimeout(10000, function () { upstream.destroy(); unavailable(); });
    upstream.on('error', unavailable);
  });
  server.on('error', function (error) {
    if (error.code !== 'EADDRINUSE') console.error('[Yummy TV] Video service: ' + error.code);
  });
  server.listen(8791, '127.0.0.1');
}());
