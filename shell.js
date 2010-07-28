require.paths.unshift(__dirname);
var sys = require('sys'),
    repl = require('repl'),
    http = require('http'),
    url = require('url'),
    style = require('colored');

var U = {
  inArray: function(value, array) {
    for (var i = 0, l = array.length; i < l; i++) {
      if (array[i] === value) {
        return true;
      }
    }
    return false;
  },
  map: function(obj, fn) {
    var newArray = [];
    for (var i = 0, l = obj.length; i < l; i++) {
      newArray.push(fn.call(this, obj[i]));
    }
    return newArray;
  },
  each: function(obj, fn) {
    if (obj.constructor === Array) {
      for (var i = 0, l = obj.length; i < l; i++) {
        fn.call(this, obj[i]);
      }
    } else {
      for (var k in obj) {
        if (obj.hasOwnProperty(k)) {
          fn.call(this, k, obj[k]);
        }
      }
    }
  }
};

function WebShell(stream) {
  for(var f in style) {
    String.prototype[f] = style[f];
  }
  
  oldParseREPLKeyword = repl.REPLServer.prototype.parseREPLKeyword;
  var web_repl = new repl.REPLServer("webshell> ", stream);
  repl.REPLServer.prototype.parseREPLKeyword = this.parseREPLKeyword;
  formatStatus = function(code) {
    if (200 <= code && code < 300) {
      sys.puts(("HTTP " + code).green());
    } else if (300 <= code && code < 400) {
      sys.puts(("HTTP " + code).yellow());
    } else if (400 <= code && code < 600) {
      sys.puts(("HTTP " + code).red());
    }
  };
  
  normalizeName = function(name) {
    return U.map(name.split('-'), function(s) { return s[0].toUpperCase() + s.slice(1, s.length); }).join('-');
  };
  
  printHeader = function(name, value) {
    sys.puts(normalizeName(name) + ": " + value);
  };

  doHttpReq = function(verb, urlStr) {
    var u = url.parse(urlStr);
    var client = http.createClient(80, u.hostname);
    var request = client.request(verb, u.pathname, {'host': u.hostname});
    request.end();
    request.on('response', function (response) {
      formatStatus(response.statusCode);
      U.each(response.headers, printHeader);
      
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

