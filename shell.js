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
    querystring = require('querystring'),
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
  headers: [],
  requestData: null,
  postToRequestData: function (post) {
    var data = querystring.parse(post);
    if (data) {
      this.requestData = data;
      return data;
    }
    return false;
  }
};

var verbs = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE', 'CONNECT'];

function WebShell(stream) {
  for(var f in style) {
    String.prototype[f] = style[f];
  }

  function getRC() {
    try {
      return JSON.parse(fs.readFileSync(process.env.HOME + '/.webshellrc'));
    } catch (e) {
      return { history: [], contexts: {} };
    }
  }

  function writeRC(rc) {
    return fs.writeFileSync(
      process.env.HOME + '/.webshellrc',
      JSON.stringify(rc)
    );
  }

  oldParseREPLKeyword = repl.REPLServer.prototype.parseREPLKeyword;
  web_repl = new repl.REPLServer("webshell> ", stream);
  process.on('exit', function () {
      var history = web_repl.rli.history;
      var rc = getRC();
      rc.history = history.slice(-100);
      writeRC(rc);
  });
  web_repl.rli.history = getRC().history;

  // trap tab key:
  web_repl.stream.on('data', function (chunk) {
    if (web_repl.rli.cursor != web_repl.rli.line.length) {
      // cursor is not at the end of the line
      return true;
    }
    if (chunk != String.fromCharCode(9)) {
      // not the tab key
      return true;
    }
    // tab (trim off the tab character)
    var line = web_repl.rli.line.substring(0, web_repl.rli.line.length -1);
    var split = line.split(' ');
    if (U.inArray(split[0], verbs)) {
      var matches = [];
      U.each(web_repl.rli.history, function (cmd) {
        if (cmd.substring(0, line.length) == line) {
          if (!U.inArray(cmd, matches)) {
            matches.push(cmd);
          }
        }
      });
      if (matches.length > 1) {
        sys.puts("\r");
        U.each(matches, function (cmd) {
          sys.puts(cmd.blue() + "\r");
        });
        web_repl.rli.line = line;
        web_repl.rli.prompt();
        // hackery:
        web_repl.rli.output.write(
          '\x1b[0G\x1b[' + (
            web_repl.rli._promptLength + line.length
          ) + 'C'
        );
        web_repl.rli.cursor = line.length;
        return false;
      } else if (matches.length == 1) {
        web_repl.rli.line = matches[0];
        web_repl.rli.prompt();
        // hackery:
        web_repl.rli.output.write(
            '\x1b[0G\x1b[' + (
              web_repl.rli._promptLength + matches[0].length
              ) + 'C'
            );
        web_repl.rli.cursor = matches[0].length;
        return false;
      }
    }
    return true;
  });

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

  ctx.$_.saveContext = function(name) {
    var obj = {};
    U.each(ctx.$_, function(k, v) {
      if (typeof(v) !== 'function') {
        obj[k] = v;
      }
    });

    var rc = getRC();

    if (!rc.contexts) {
      rc.contexts = {};
    }
    rc.contexts[name] = obj;
    writeRC(rc);
    sys.puts("Saved context: " + name);
  }

  ctx.$_.loadContext = function(name) {
    var rc = getRC();
    if (rc.contexts[name]) {
      U.each(rc.contexts[name], function (k, v) {
        ctx.$_[k] = v;
      });
      sys.puts("Loaded context: " + name);
    } else {
      sys.puts(("Could not load context: " + name).red());
    }

  }

  doHttpReq = function(verb, urlStr) {
    var u = url.parse(urlStr);
    var client = http.createClient(u.port || 80, u.hostname);
    var jsonHeaders = ['application/json', 'text/x-json'];
    $_.previousVerb = verb;
    $_.previousUrl = urlStr;

    var content = null;
    var headers = {host: u.hostname};
    switch (verb) {
      case 'POST':
        content = querystring.stringify($_.requestData);
        headers['Content-type'] = 'application/x-www-form-urlencoded';
        break;
      case 'PUT':
        try {
          content = fs.readFileSync($_.requestData);
        } catch (e) {
          sys.puts("Set $_.requestData to the filename to PUT".red());
          web_repl.displayPrompt();
          return false;
        }
        headers['Content-type'] = 'application/octet-stream';
        break;
    }
    var request = client.request(verb, u.href, headers);
    if (content) {
      headers['Content-length'] = content.length;
      request.write(content);
    }
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
        if (U.inArray(ctx.$_.headers['content-type'], jsonHeaders)) {
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

