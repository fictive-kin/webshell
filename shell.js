//require.paths.unshift(__dirname);
var sys = require('sys'),
    repl = require('repl'),
    http = require('http'),
    url = require('url');


function WebShell(stream) {
  oldParseREPLKeyword = repl.REPLServer.prototype.parseREPLKeyword;
  var web_repl = new repl.REPLServer("webshell> ", stream);
  repl.REPLServer.prototype.parseREPLKeyword = this.parseREPLKeyword;
  doHttpReq = function(verb, urlStr) {
    var u = url.parse(urlStr);
    var client = http.createClient(80, u.hostname);
    var request = client.request(verb, u.pathname, {'host': u.hostname});
    request.end();
    request.on('response', function (response) {
      sys.print('STATUS: ' + response.statusCode);
      sys.print('HEADERS: ' + JSON.stringify(response.headers));
      response.setEncoding('utf8');
      response.on('data', function (chunk) {
        console.log('BODY: ' + chunk);
      });
      response.on('end', function() {
        web_repl.displayPrompt();
      });
    });
  };
}

var U = {
  inArray: function(value, array) {
    for (var i = 0, l = array.length; i < l; i++) {
      if (array[i] === value) {
        return true;
      }
    }
    return false;
  }
}
WebShell.prototype = {
  parseREPLKeyword: function(cmd) {
    var verbs = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'];
    if (oldParseREPLKeyword.call(this, cmd)) {
      return true;
    }
    try {
      var split = cmd.split(' ');
      if (split.length === 2 && U.inArray(split[0], verbs)) {
        doHttpReq(split[0], split[1]);
        return true;
      }
    } catch(e) {
    }
    return false;
  }
};

exports.WebShell = WebShell;


new WebShell();

