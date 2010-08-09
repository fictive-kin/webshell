/* Usage: node shell.js */
/* functions as a regular node shell */
/* issue HTTP commands with: `<VERB> <URL>' */
/* e.g. GET http://www.google.com/ */
/* response data will be put into the global variable $_ */
/* raw response data: $_.raw */
/* headers: $_.headers */
/* to follow redirects - use the command `follow!' */

require.paths.unshift(__dirname + '/deps');
require.paths.unshift(__dirname);
var sys = require('sys'),
    repl = require('repl'),
    http = require('http'),
    url = require('url'),
    fs = require('fs'),
    querystring = require('querystring'),
    style = require('colored');
    Script = process.binding('evals').Script,
    evalcx = Script.runInContext,
    base64 = require('base64'),
    cookies = require('cookies'),
    U = require('util'),
    wsrc = require('wsrc'),
    wsreadline = require('wsreadline'),
    eventEmitter = require('events').EventEmitter;

// NOTE: readline requires node.js patch; see http://gist.github.com/514195
// Requested a pull from ry, and from the node mailing list 2010/08/08 -SC

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
  useCookies: true,
  postToRequestData: function (post) {
    var data = querystring.parse(post);
    if (data) {
      this.requestData = data;
      return data;
    }
    return false;
  },
  cookies: cookies
};

var verbs = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE', 'CONNECT'];

function WebShell(stream) {
  for(var f in style) {
    String.prototype[f] = style[f];
  }

  function parseURL(urlStr) {
    var u = url.parse(urlStr);
    u.port = u.port || 80;
    u.pathname = u.pathname || '/';
    return u;
  }

  oldParseREPLKeyword = repl.REPLServer.prototype.parseREPLKeyword;
  web_repl = new repl.REPLServer("webshell> ", stream);
  process.on('exit', function () {
      var history = web_repl.rli.history;
      var rc = wsrc.get();
      rc.history = history.slice(-100);
      wsrc.write(rc, cookies);
      sys.puts("\n");
  });
  web_repl.rli.history = wsrc.get().history;

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
    var split = web_repl.rli.line.split(' ');
    if (U.inArray(split[0], verbs)) {
      return web_repl.rli.completeHistory(true);
    } else if (web_repl.rli.line.substring(0, '$_.loadContext('.length) == '$_.loadContext(') {
      var completion = [];
      U.each(wsrc.get().contexts, function (k) {
        completion.push('$_.loadContext("' + k + '")');
      });
      web_repl.rli.complete(true, completion);
    } else if (web_repl.rli.line.substring(0, 3) == '$_.') {
      var completion = [];
      U.each($_, function (k) {
        var completer = '$_.' + k;
        if (typeof $_[k] === 'function') {
          completer += '(';
        }
        completion.push(completer);
      });
      web_repl.rli.complete(true, completion);
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
      var locationUrl = parseURL(location);
      if (!locationUrl.protocol) {
        var prevUrl = parseURL($_.previousUrl);
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
    delete obj['cookies'];
    obj.__cookieJar = $_.cookies.__get_raw__();

    var rc = wsrc.get();

    if (!rc.contexts) {
      rc.contexts = {};
    }
    rc.contexts[name] = obj;
    wsrc.write(rc, cookies);
    sys.puts("Saved context: " + name);
  }

  ctx.$_.loadContext = function(name) {
    var rc = wsrc.get();
    if (rc.contexts[name]) {
      U.each(rc.contexts[name], function (k, v) {
        ctx.$_[k] = v;
      });
      $_.cookies.__set_raw__(ctx.$_.__cookieJar);
      delete ctx.$_['__cookieJar'];
      sys.puts("Loaded context: " + name);
    } else {
      sys.puts(("Could not load context: " + name).red());
    }

  }
  
  function makeHeaders(url) {
    var headers = {'Host': url.hostname, 'User-Agent': 'webshell (node.js)'};
    if (url.auth) {
      headers['Authorization'] = 'Basic ' + base64.encode(url.auth);
    }
    if ($_.useCookies) {
      headers['Cookie'] = cookies.headerFor(url);
    }
    return headers;
  }

  doHttpReq = function(verb, urlStr) {
    var u = parseURL(urlStr);
    var client = http.createClient(u.port, u.hostname);
    var jsonHeaders = ['application/json', 'text/x-json'];
    $_.previousVerb = verb;
    $_.previousUrl = urlStr;

    var content = null;
    var headers = makeHeaders(u);
    switch (verb) {
      case 'POST':
        if (typeof $_.requestData == "object") {
          content = querystring.stringify($_.requestData);
          headers['Content-type'] = 'application/x-www-form-urlencoded';
        } else {
          if (!headers['Content-type']) {
            headers['Content-type'] = 'application/x-www-form-urlencoded';
          }
          content = $_.requestData;
        }
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
      if ($_.useCookies) {
        $_.cookies.update(u.hostname, response.headers['set-cookie']);
      }
      response.setEncoding('utf8');
      var body = "";
      response.on('data', function (chunk) {
        body += chunk;
      });
      response.on('end', function() {
        web_repl.displayPrompt();
        ctx.$_.raw = body;
        if (U.inArray(ctx.$_.headers['content-type'].split('; ')[0], jsonHeaders)) {
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
    web_repl.displayPrompt();
    return true;
  }
};

new WebShell();

