/* Usage: node shell.js */
/* functions as a regular node shell */
/* issue HTTP commands with: `<VERB> <URL>' */
/* e.g. GET http://www.google.com/ */
/* response data will be put into the global variable $_ */
/* raw response data: $_.raw */
/* headers: $_.headers */
/* to follow redirects - use the command `follow!' */

require.paths.unshift(__dirname);
var sys = require('sys'),
    repl = require('repl'),
    http = require('http'),
    url = require('url'),
    fs = require('fs'),
    style = require('colored');
    Script = process.binding('evals').Script,
    evalcx = Script.runInContext;

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

var $_ = {
  printHeaders: false,
  printResponse: true,
  raw: null,
  response: null,
  status: 0,
  previousVerb: null,
  previousUrl: null,
  headers: []
};

var verbs = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE', 'CONNECT'];

function WebShell(stream) {
  for(var f in style) {
    String.prototype[f] = style[f];
  }
  
  oldParseREPLKeyword = repl.REPLServer.prototype.parseREPLKeyword;
  web_repl = new repl.REPLServer("webshell> ", stream);
  process.on('exit', function () {
      var history = web_repl.rli.history;
      fs.writeFileSync(process.env.HOME + '/.webshellrc', JSON.stringify({history: history.slice(-100)}));
  });
  try {
    web_repl.rli.history = JSON.parse(fs.readFileSync(process.env.HOME + '/.webshellrc')).history;
  } catch (e) {}
  var ctx = web_repl.context;

  repl.REPLServer.prototype.parseREPLKeyword = this.parseREPLKeyword;
  formatStatus = function(code, url) {
    var msg = "HTTP " + code + " " + url.white();
    if (200 <= code && code < 300) {
      sys.puts(msg.green());
    } else if (300 <= code && code < 400) {
      sys.puts(msg.yellow());
    } else if (400 <= code && code < 600) {
      sys.puts(msg.red());
    }
  };
  
  normalizeName = function(name) {
    return U.map(name.split('-'), function(s) { return s[0].toUpperCase() + s.slice(1, s.length); }).join('-');
  };
  
  printHeader = function(name, value) {
    sys.puts(normalizeName(name) + ": " + value);
  };
  
  ctx.$_ = $_;
  
  doRedirect = function() {
    var location = $_.headers.location;
    if (location) {
      var locationUrl = url.parse(location);
      if (!locationUrl.protocol) {
        var prevUrl = url.parse($_.previousUrl);
        // a relative URL, auto-populate with previous URL's info
        locationUrl.protocol = prevUrl.protocol;
        locationUrl.hostname = prevUrl.hostname;
        if (prevUrl.auth) {
          locationUrl.auth = prevUrl.auth;
        }
        if (prevUrl.port) {
          locationUrl.port = prevUrl.port;
        }
        location = url.format(locationUrl);
      }
      doHttpReq($_.previousVerb, location);
    } else {
      sys.puts("No previous request!".red());
    }
  };
  ctx.$_.follow = doRedirect;

  doHttpReq = function(verb, urlStr) {
    var u = url.parse(urlStr);
    var client = http.createClient(80, u.hostname);
    var request = client.request(verb, u.pathname, {'host': u.hostname});
    $_.previousVerb = verb;
    $_.previousUrl = urlStr;
    request.end();
    request.on('response', function (response) {
      if ($_.printResponse) {
        formatStatus(response.statusCode, urlStr);
      }
      ctx.$_.status = response.statusCode;
      
      if ($_.printHeaders) {
        U.each(response.headers, printHeader);
      }
      ctx.$_.headers = response.headers;
      
      response.setEncoding('utf8');
      var body = "";
      response.on('data', function (chunk) {
        body += chunk;
      });
      response.on('end', function() {
        web_repl.displayPrompt();
        ctx.$_.raw = body;
        if ('application/json' == ctx.$_.headers['content-type']) {
          ctx.$_.json = JSON.parse(body);
        }
      });
    });
  };
}

WebShell.prototype = {
  parseREPLKeyword: function(cmd) {
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

new WebShell();

