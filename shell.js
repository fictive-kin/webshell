/* Usage: node shell.js */
/* functions as a regular node shell */
/* issue HTTP commands with: `<VERB> <URL>' */
/* e.g. GET http://www.google.com/ */
/* response data will be put into the global variable $_ */
/* raw response data: $_.raw */
/* headers: $_.headers */
// vim: sw=2 ts=2 et

require.paths.unshift(__dirname + '/deps');
var webshellVersion = '0.2-dev';

require.paths.unshift(__dirname);
var WebShell = {
  Util: {}
};

var util = require('util'),
    repl = require('repl'),
    wsrepl = require('wsrepl'),
    http = require('http'),
    fs = require('fs'),
    querystring = require('querystring'),
    stylize = require('colors').stylize,
    cookies = require('cookies'),
    wsrc = require('wsrc'),
    wsreadline = require('wsreadline'),
    _ = require('underscore')._,
    env = require('env'),
    jquery = require('jquery');

_.extend(WebShell.Util, require('wsutil'));

_.mixin({
  isJSON: function(headers) {
    var jsonHeaders = ['application/json', 'text/x-json'];
    return headers['content-type'] && _.include(jsonHeaders, headers['content-type'].split('; ')[0])
  }
});


var $_ = {
  useJquery: true,
  printHeaders: false,
  raw: null,
  response: null,
  status: 0,
  previousVerb: null,
  previousUrl: null,
  headers: [],
  requestHeaders: [],
  requestData: null,
  useCookies: true,
  printStatus: true,
  printResponse: true,
  postToRequestData: function (post) {
    var data = querystring.parse(post);
    if (data) {
      this.requestData = data;
      return data;
    }
    return false;
  },
  fileToRequestData: function (filename, encoding) {
    if (undefined == encoding) {
      encoding = 'utf8';
    }
    try {
      this.requestData = fs.readFileSync(filename, encoding);
      console.log(stylize("Set requestData to '" + filename + "' (" + this.requestData.length + " bytes, " + encoding + ")", "yellow"));
    } catch (e) {
      console.log(stylize("Could not read " + filename, "red"));
    }
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

WebShell.Shell = function(stream) {
  var prevU;
  wsrc.loadContext('_previous', $_, true);

  var getContextsCompletion = function (cmd) {
    var completion = [];
    _.each(wsrc.get().contexts, function (v, k) {
      completion.push('$_.' + cmd + '("' + k + '")');
    });
    web_repl.rli.complete(completion);
  };

  if ($_.previousUrl) {
    prevU = WebShell.Util.parseURL($_.previousUrl);
    web_repl = new repl.REPLServer(WebShell.Util.formatUrl(prevU, false) + ' > ', stream);
  } else {
    web_repl = new repl.REPLServer("webshell> ", stream);
  }

  this.injectLineListener(web_repl);

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
    }
    return true;
  });

  var ctx = web_repl.context;

  ctx.$_ = $_;

  doRedirect = function() {
    var location = $_.headers.location;
    if (location) {
      var locationUrl = WebShell.Util.parseURL(location, false, $_.previousUrl);
      location = WebShell.Util.formatUrl(locationUrl);
      doHttpReq($_.previousVerb, location);
    } else {
      util.puts(stylize("No previous request!", 'red'));
    }
  };
  ctx.$_.follow = doRedirect;

  ctx.$_.saveContext = function (name) { wsrc.saveContext(name, $_); };
  ctx.$_.loadContext = function (name) {
    wsrc.loadContext(name, $_);
    if ($_.previousUrl) {
      u = WebShell.Util.parseURL($_.previousUrl);
      web_repl.prompt = WebShell.Util.formatUrl(u, false) + ' > ';
    }
  };
  ctx.$_.delContext = function (name) { wsrc.delContext(name, $_); };

  function makeHeaders(url) {
    var hostHeader = url.hostname;
    if (url.protocol === 'https:' && url.port !== 443) {
      hostHeader += ":" + url.port;
    } else if (url.protocol === 'http:' && url.port !== 80) {
      hostHeader += ":" + url.port;
    }

    var headers = {
      'host': hostHeader,
      'user-agent': 'Webshell/' + webshellVersion + ' node.js/' + process.version,
      'accept': 'application/json, */*'
    };

    if (url.auth) {
      headers['authorization'] = 'Basic ' + WebShell.Util.base64Encode(url.auth);
    }

    if ($_.useCookies) {
      var cookie = cookies.headerFor(url);
      if (cookie) {
        headers['cookie'] = cookie;
      }
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

    var u = WebShell.Util.parseURL(urlStr, true, $_.previousUrl);
    var prevU = $_.previousUrl ? WebShell.Util.parseURL($_.previousUrl, true) : undefined;
    var client = http.createClient(u.port, u.hostname, u.protocol === 'https:');
    var xmlHeaders = ['text/html', 'text/xml', 'application/xml', 'application/rss+xml', 'application/rdf+xml', 'application/atom+xml'];
    var baseHeaders = _.clone($_.requestHeaders);
    var lowerHeaders = {};
    _.map(baseHeaders, function (v, k) {
      lowerHeaders[k.toLowerCase()] = v;
    });
    baseHeaders = lowerHeaders;
    delete baseHeaders.host; // provided by makeHeaders()
    delete baseHeaders.cookie; // provided by makeHeaders()

    // check for prev auth
    if (!u.auth && prevU && prevU.auth) {
      if ((prevU.hostname == u.hostname)) {
        u.auth = prevU.auth; // re-use previous auth
      } else {
        delete baseHeaders.authorization; // different hostname = delete auth
      }
    }

    $_.previousVerb = verb;
    $_.previousUrl = WebShell.Util.formatUrl(u, true, true);

    var content = null;
    var headers = makeHeaders(u);

    // merge in $_.requestHeaders
    if (typeof $_.requestHeaders != 'object') {
        // something's not right here, so reset requestHeaders
        // note: setting $_.requestHeaders to {} is also a good way for users
        //       to reset things like the Accept header
        $_.requestHeaders = {};
    }

    _.each(baseHeaders, function(v, k) {
      // these are provided by makeHeaders()
      headers[k] = v;
    });

    switch (verb) {
      case 'POST':
        if (typeof $_.requestData == "object") {
          content = querystring.stringify($_.requestData);
          headers['content-type'] = 'application/x-www-form-urlencoded';
        } else {
          if (!headers['content-type']) {
            headers['content-type'] = 'application/x-www-form-urlencoded';
          }
          content = $_.requestData;
        }
        break;
      case 'PUT':
        if (typeof $_.requestData !== 'string') {
          console.log(stylize("$_.requestData must be a string", "red"));
          web_repl.displayPrompt(true);
          return false;
        }
        content = $_.requestData;
        if (!headers['content-type']) {
          headers['content-type'] = 'application/octet-stream';
        }
        break;
    }
    var path = u.pathname;
    if (u.search) {
      path += u.search;
    }
    if (content) {
      headers['content-length'] = content.length;
    } else {
      // no content = no content-length header necessary
      delete headers['content-length'];
    }

    // set prompt
    web_repl.prompt = WebShell.Util.formatUrl(u, false) + ' > ';

    var request = client.request(verb, path, headers);
    if (content) {
      request.write(content);
    }

    $_.requestHeaders = headers;
    request.end();
    request.on('response', function (response) {
      if ($_.printStatus) {
        var bufferOk = web_repl.rli.outputWrite(
          '\x1b[1K'
          + '\x1b[' + (web_repl.rli._promptLength + web_repl.rli.line.length) + 'D'
          + WebShell.Util.formatStatus(response.statusCode, u)
          + "\n");
        if (bufferOk) {
          web_repl.displayPrompt(true);
        } else {
          web_repl.displayPromptOnDrain = true;
        }
      }
      ctx.$_.status = response.statusCode;

      if ($_.printHeaders) {
        _.each(response.headers, WebShell.Util.printHeader);
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
        var bufferOk = true;
        $_.raw = body;
        delete $_['document'];
        delete $_['json'];
        if (response.statusCode >= 200 && response.statusCode < 300 && _.isJSON($_.headers)) {
          $_.json = JSON.parse(body);
        }

        if ($_.printResponse) {
          bufferOk = WebShell.Util.responsePrinter($_, response);
        }

        if ($_.useJquery && _.include(xmlHeaders, $_.headers['content-type'].split('; ')[0])) {
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

        _.extend(result, {raw: $_.raw, headers: $_.headers, statusCode: $_.status, json: $_.json});
        result.finalize();
        if (cb) {
          cb($_);
        }
        if (bufferOk) {
          web_repl.displayPrompt(true);
        } else {
          web_repl.displayPromptOnDrain = true;
          web_repl.suppressPrompt--;
        }
      });
    });
    return result;
  };

  _.each(verbs, function (v) {
    $_[v.toLowerCase()] = function(url, cb) {
      return doHttpReq(v, url, cb);
    };
  });
};

WebShell.Shell.prototype = {
  injectLineListener: function(web_repl) {
    var oldOnLineListener = web_repl.rli.listeners('line')[0];
    web_repl.rli.removeAllListeners('line');
    web_repl.rli.addListener('line', function(cmd) {
      try {
        if (cmd) {
          var split = cmd.split(' ');
          if (split.length === 2 && _.include(verbs, split[0])) {
            doHttpReq(split[0], split[1]);
            web_repl.displayPrompt(true);
          } else {
            oldOnLineListener.call(null, cmd);
          }
        }
      } catch (e) {
        console.log(e.stack);
        web_repl.displayPrompt(true);
      }
    });
  },
  rescue: function() {
    web_repl.displayPrompt(true);
  }
};

function checkVersion() {
  var matchInfo = process.version.match(/(\d*)\.(\d*)\.(\d*)/);
  var major = parseInt(matchInfo[1], 10);
  var minor = parseInt(matchInfo[2], 10);
  var rev = parseInt(matchInfo[3], 10);
  if (major === 0 && (minor < 3 || (minor === 3 && rev < 2))) {
    console.log(stylize("Webshell may not work with this version of node, consider upgrading\n", 'yellow'));
  }
}

checkVersion();
var shell = new WebShell.Shell;

process.on('uncaughtException', function (err) {
  console.log(stylize('Caught exception: ' + err, 'red'));
  console.log(err.stack);
  shell.rescue();
});

