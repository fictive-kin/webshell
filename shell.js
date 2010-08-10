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
    style = require('colored'),
    base64 = require('base64'),
    cookies = require('cookies'),
    wsrc = require('wsrc'),
    wsreadline = require('wsreadline'),
    eventEmitter = require('events').EventEmitter,
    _ = require('underscore')._;

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
  function patchHTTP(http) {
    var oldAddHeader = http.IncomingMessage.prototype._addHeaderLine;
    http.IncomingMessage.prototype._addHeaderLine = function(field, value) {
      if (field === 'set-cookie') {
        this.headers['set-cookie'] = this.headers['set-cookie'] || [];
        this.headers['set-cookie'].push(value);
        return;
      }
      return oldAddHeader.call(this, field, value);
    };
  }


  for(var f in style) {
    String.prototype[f] = style[f];
  }

  function parseURL(urlStr) {
    var u = url.parse(urlStr);
    if (!u.protocol) {
      u = url.parse('http://'+urlStr);
    }
    u.port = u.port || (u.protocol === 'https:' ? 443 : 80);
    u.pathname = u.pathname || '/';
    return u;
  }

  patchHTTP(http);
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
    if (_.include(verbs, split[0])) {
      return web_repl.rli.completeHistory(true);
    } else if (web_repl.rli.line.substring(0, '$_.loadContext('.length) == '$_.loadContext(') {
      var completion = [];
      _.each(wsrc.get().contexts, function (k) {
        completion.push('$_.loadContext("' + k + '")');
      });
      web_repl.rli.complete(true, completion);
    } else if (web_repl.rli.line.substring(0, 3) == '$_.') {
      var completion = [];
      _.each($_, function (v, k) {
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
      console.log(msg.green());
    } else if (300 <= code && code < 400) {
      console.log(msg.yellow());
    } else if (400 <= code && code < 600) {
      console.log(msg.red());
    }
  };
  
  normalizeName = function(name) {
    return _.map(name.split('-'), function(s) { return s[0].toUpperCase() + s.slice(1, s.length); }).join('-');
  };
  
  printHeader = function(value, name) {
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
    _.each(ctx.$_, function(v, k) {
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
      _.each(rc.contexts[name], function (v, k) {
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
    var hostHeader = url.hostname;
    if (url.protocol === 'https:' && url.port !== 443) {
      hostHeader += ":" + url.port;
    } else if (url.protocol === 'http:' && url.port !== 80) {
      hostHeader += ":" + url.port;
    }
    var headers = {'Host': hostHeader, 'User-Agent': 'webshell (node.js)', 'Accept': '*/*'};
    if (url.auth) {
      headers['Authorization'] = 'Basic ' + base64.encode(url.auth);
    }
    if ($_.useCookies) {
      headers['Cookie'] = cookies.headerFor(url);
    }
    return headers;
  }

  doHttpReq = function(verb, urlStr, result) {
    result = result || {};
    var u = parseURL(urlStr);
    var client = http.createClient(u.port, u.hostname, u.protocol === 'https:');
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
        if (!headers['Content-type']) {
          headers['Content-type'] = 'application/octet-stream';
        }
        break;
    }
    var request = client.request(verb, u.pathname, headers);
    if (content) {
      headers['Content-length'] = content.length;
      request.write(content);
    }
    request.end();
    request.on('response', function (response) {
      if ($_.printResponse) {
        formatStatus(response.statusCode, u.href);
      }
      ctx.$_.status = response.statusCode;

      if ($_.printHeaders) {
        _.each(response.headers, printHeader);
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
        if (_.include(jsonHeaders, ctx.$_.headers['content-type'].split('; ')[0])) {
          ctx.$_.json = JSON.parse(body);
        }
        
        _.extend(result, {raw: ctx.$_.raw, headers: ctx.$_.headers, statusCode: ctx.$_.status, json: ctx.$_.json});
      });
    });
  };
  
  _.each(verbs, function (v) {
    $_[v.toLowerCase()] = function(url, result) { 
      doHttpReq(v, url, result);
    };
  });
  
}

WebShell.prototype = {
  parseREPLKeyword: function(cmd) {
    if (oldParseREPLKeyword.call(this, cmd)) {
      return true;
    }
    try {
      if (cmd) {
        var split = cmd.split(' ');
        if (split.length === 2 && _.include(verbs, split[0])) {
          doHttpReq(split[0], split[1]);
          return true;
        }
      }
    } catch(e) {
      console.log(e.stack);
      web_repl.displayPrompt();
      return true;
    }
    return false;
  },
  rescue: function() {
    web_repl.displayPrompt();
  }
};

var shell = new WebShell();

process.on('uncaughtException', function (err) {
  console.log(('Caught exception: ' + err).red());
  shell.rescue();
});

