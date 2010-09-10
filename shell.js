/* Usage: node shell.js */
/* functions as a regular node shell */
/* issue HTTP commands with: `<VERB> <URL>' */
/* e.g. GET http://www.google.com/ */
/* response data will be put into the global variable $_ */
/* raw response data: $_.raw */
/* headers: $_.headers */

require.paths.unshift(__dirname + '/lib');
require.paths.unshift(__dirname);
var sys = require('sys'),
    repl = require('repl'),
    wsrepl = require('wsrepl'),
    http = require('http'),
    url = require('url'),
    fs = require('fs'),
    querystring = require('querystring'),
    stylize = require('colors').stylize,
    cookies = require('cookies'),
    wsrc = require('wsrc'),
    wsreadline = require('wsreadline'),
    _ = require('underscore')._,
    env = require('env'),
    jquery = require('jquery');

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
  cookies: cookies,
  toolbox: {},
  evalFile: function (filename) {
    eval("var s = " + fs.readFileSync(filename));
    return s;
  }
};

var window = env.window;

var verbs = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE', 'CONNECT'];

function WebShell(stream) {
  function httpSuccess(status) {
    return 200 <= status && status < 300;
  }
  
  function httpRedirection(status) {
    return 300 <= status && status < 400;
  }
  
  function httpClientError(status) {
    return 400 <= status && status < 500;
  }
  
  function httpServerError(status) {
    return 500 <= status && status < 600;
  }
  
  function parseURL(urlStr, protocolHelp) {
    var u = url.parse(urlStr);
    if (protocolHelp && !u.protocol) {
      u = url.parse('http://'+urlStr);
    }
    u.port = u.port || (u.protocol === 'https:' ? 443 : 80);
    u.pathname = u.pathname || '/';
    return u;
  }

  oldParseREPLKeyword = repl.REPLServer.prototype.parseREPLKeyword;

  wsrc.loadContext('_previous', $_);

  var getContextsCompletion = function (cmd) {
    var completion = [];
    _.each(wsrc.get().contexts, function (v, k) {
      completion.push('$_.' + cmd + '("' + k + '")');
    });
    web_repl.rli.complete(completion);
  };
  var getObjectCompletion = function (cmd, obj) {
    var completion = [];
    _.each(obj, function (v, k) {
      var completer = cmd + '.' + k;
      if (_.isFunction(obj[k])) {
        completer += '(';
      }
      completion.push(completer);
    });
    web_repl.rli.complete(completion);
  };

  web_repl = new repl.REPLServer("webshell> ", stream);
  process.on('exit', function () {
    if (web_repl.rli._hardClosed) {
      var rc = wsrc.get();
    } else {
      var rc = wsrc.saveContext('_previous', $_);
    }
    rc.history = web_repl.rli.history;
    wsrc.write(rc, cookies);
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
      return web_repl.rli.completeHistory();
    } else if (web_repl.rli.line.substring(0, '$_.loadContext('.length) == '$_.loadContext(') {
      getContextsCompletion('loadContext');
    } else if (web_repl.rli.line.substring(0, '$_.delContext('.length) == '$_.delContext(') {
      getContextsCompletion('delContext');
    } else if (web_repl.rli.line.substring(0, '$_.'.length) == '$_.') {
      var pieces = web_repl.rli.line.split('.');
      // discard last piece:
      pieces.pop();
      switch (pieces.length) {
        case 1: // "$_"
          getObjectCompletion('$_', $_);
          break;
        case 2: // "$_.something"
          if ($_[pieces[1]]) {
            getObjectCompletion(pieces.join('.'), $_[pieces[1]]);
          }
          break;
        case 3: // "$_.something.somethingelse"
          if ($_[pieces[1]][pieces[2]]) {
            getObjectCompletion(pieces.join('.'), $_[pieces[1]][pieces[2]]);
          }
          break;
        case 4: // "$_.something.somethingelse.other"
          if ($_[pieces[1]][pieces[2]][pieces[3]]) {
            getObjectCompletion(pieces.join('.'), $_[pieces[1]][pieces[2]][pieces[3]]);
          }
          break;
        default:
          // too deep;
      }
    } else if (web_repl.rli.line.substring(0, '$_.toolbox.'.length) == '$_.toolbox.') {
      getObjectCompletion('$_.toolbox', $_.toolbox);
    } else if (web_repl.rli.line.substring(0, 3) == '$_.') {
      getObjectCompletion('$_', $_);
    }
    return true;
  });

  var ctx = web_repl.context;
  
  repl.REPLServer.prototype.parseREPLKeyword = this.parseREPLKeyword;
  formatStatus = function(code, url) {
    var msg = "HTTP " + code + " " + stylize(url, 'white');
    if (httpSuccess(code)) {
      console.log(stylize(msg, 'green'));
    } else if (httpRedirection(code)) {
      console.log(stylize(msg, 'yellow'));
    } else if (httpClientError(code) || httpServerError(code)) {
      console.log(stylize(msg, 'red'));
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
      var locationUrl = parseURL(location, false);
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
      sys.puts(stylize("No previous request!", 'red'));
    }
  };
  ctx.$_.follow = doRedirect;

  ctx.$_.saveContext = function (name) { wsrc.saveContext(name, $_); };
  ctx.$_.loadContext = function (name) { wsrc.loadContext(name, $_); };
  ctx.$_.delContext = function (name) { wsrc.delContext(name, $_); };
  
  function base64Encode(str) {
    return (new Buffer(str, 'ascii')).toString('base64');
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
      headers['Authorization'] = 'Basic ' + base64Encode(url.auth);
    }
    if ($_.useCookies) {
      headers['Cookie'] = cookies.headerFor(url);
    }
    return headers;
  }

  function ResultHolder(verb, url) {
    this.verb = verb;
    this.url = url;
    this.inspectStr = verb + " " + url;
  }
  ResultHolder.prototype = {
    inspect: function() {
      var str = this.inspectStr;
      this.inspectStr = "[Pending]";
      return str;
    }
  };
  _.define(ResultHolder.prototype, 'finalize', function() {
    _.define(this, 'inspect', null);
  });

  doHttpReq = function(verb, urlStr, cb) {
    web_repl.suppressPrompt++;
    result = new ResultHolder(verb, urlStr);
    var u = parseURL(urlStr);
    var client = http.createClient(u.port, u.hostname, u.protocol === 'https:');
    var jsonHeaders = ['application/json', 'text/x-json'];
    var xmlHeaders = ['text/html', 'text/xml', 'application/xml', 'application/rss+xml', 'application/rdf+xml', 'application/atom+xml'];
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
          sys.puts(stylize("Set $_.requestData to the filename to PUT", 'red'));
          web_repl.displayPrompt(true);
          return false;
        }
        if (!headers['Content-type']) {
          headers['Content-type'] = 'application/octet-stream';
        }
        break;
    }
    var path = u.pathname;
    if (u.search) {
      path += u.search;
    }
    var request = client.request(verb, path, headers);
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
        $_.raw = body;
        $_.document = $_.json = null;

        if (httpSuccess(response.statusCode)) {
          if (_.include(jsonHeaders, $_.headers['content-type'].split('; ')[0])) {
            $_.json = JSON.parse(body);
          }
          if (_.include(xmlHeaders, $_.headers['content-type'].split('; ')[0])) {
            $_.document = new env.DOMDocument(body);
            window.document = $_.document;
            ctx.$ = function(selector, context) {
              var doSetup = !!env.window.document;
              env.window.document = $_.document;
              if (doSetup) {
                jquery.setup(env.window);
              }
              return env.window.jQuery(selector, context);
            }
          }
        }
        _.extend(result, {raw: $_.raw, headers: $_.headers, statusCode: $_.status, json: $_.json, document: $_.document});
        result.finalize();
        if (cb) {
          cb($_);
        }
        web_repl.displayPrompt(true);
      });
    });
    return result;
  };
  
  _.each(verbs, function (v) {
    $_[v.toLowerCase()] = function(url, cb) {
      return doHttpReq(v, url, cb);
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
      web_repl.displayPrompt(true);
      return true;
    }
    return false;
  },
  rescue: function() {
    web_repl.displayPrompt(true);
  }
};

var shell = new WebShell();

process.on('uncaughtException', function (err) {
  console.log(stylize('Caught exception: ' + err, 'red'));
  shell.rescue();
});

