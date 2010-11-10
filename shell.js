/* Usage: node shell.js */
/* functions as a regular node shell */
/* issue HTTP commands with: `<VERB> <URL>' */
/* e.g. GET http://www.google.com/ */
/* response data will be put into the global variable $_ */
/* raw response data: $_.raw */
/* headers: $_.headers */
/* vim: sw=2 ts=2 noet */

require.paths.unshift(__dirname + '/deps');
var webshellVersion = '0.2-dev';

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
    _ = require('underscore')._;
    
_.mixin({
  isJSON: function(headers) {
    var jsonHeaders = ['application/json', 'text/x-json'];
    return headers['content-type'] && _.include(jsonHeaders, headers['content-type'].split('; ')[0])
  }
});

var formatUrl = function (u, includePath, showPassword) {
  var auth = '';
  var port = '';
  if (('http:' == u.protocol && 80 != u.port) || ('https:' == u.protocol && 443 != u.port)) {
    port = ':' + u.port;
  }
  if (u.auth) {
    if (showPassword) {
      auth = u.auth + '@';
    } else {
      auth = u.auth.split(':')[0] + ':***@';
    }
  }
  var url = u.protocol + (u.slashes ? '//' : '') + auth + u.hostname + port;
  if (includePath) {
    url += u.pathname;
  }
  return url;
}

var $_ = {
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
  // set printResponse(val) {
  //   delete this['__printResponse'];
  //   Object.defineProperty(this, '__printResponse', {value: val, enumerable: false, configurable: true});
  // },
  // _printResponse: function(resp) {
  //   if (_.isFunction(this.__printResponse)) {
  //     return this.__printResponse.call(null, resp);
  //   } else {
  //     return this.__printResponse;
  //   }
  // },
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

// $_.printResponse = function(response) {
//   return _.isJSON(response.headers);
// }
// 
var verbs = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE', 'CONNECT'];

function WebShell(stream) {
  function responsePrinter($_, response) {
    var bufferOk = true;
    if (_.isFunction($_.toolbox.responsePrinter)) {
      bufferOk = $_.toolbox.responsePrinter($_, response);
    } else {
      if ($_.json) {
        web_repl.rli.outputWrite(sys.inspect($_.json, false, undefined, true));
        bufferOk = web_repl.rli.outputWrite("\n");
      }
    }
    return bufferOk;
  }
  
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

  if ($_.previousUrl) {
    var prevU = parseURL($_.previousUrl);
    web_repl = new repl.REPLServer(formatUrl(prevU, false) + ' > ', stream);
  } else {
    web_repl = new repl.REPLServer("webshell> ", stream);
  }
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
  
  repl.REPLServer.prototype.parseREPLKeyword = this.parseREPLKeyword;

  formatStatus = function(code, u) {
    var url = formatUrl(u, true);
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
  ctx.$_.loadContext = function (name) {
    wsrc.loadContext(name, $_);
    if ($_.previousUrl) {
      u = parseURL($_.previousUrl);
      web_repl.prompt = formatUrl(u, false) + ' > ';
    }
  };
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

    var headers = {
      'host': hostHeader,
      'user-agent': 'Webshell/' + webshellVersion + ' node.js/' + process.version,
      'accept': 'application/json, */*'
    };

    if (url.auth) {
      headers['authorization'] = 'Basic ' + base64Encode(url.auth);
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

    var u = parseURL(urlStr);
    var prevU = parseURL($_.previousUrl || 'http://example.com');

    // check for prev host (and no host on this req) == relative request
    if (!u.protocol && !u.hostname) {
      u.protocol = prevU.protocol;
      u.hostname = prevU.hostname;
      u.slashes = prevU.slashes;
      u.port = prevU.port;
      if (u.pathname.substr(0,1) != '/') {
        u.pathname = '/' + u.pathname;
      }
    }
 
    var client = http.createClient(u.port, u.hostname, u.protocol === 'https:');
    var baseHeaders = _.clone($_.requestHeaders);
    var lowerHeaders = {};
    _.map(baseHeaders, function (v, k) {
      lowerHeaders[k.toLowerCase()] = v;
    });
    baseHeaders = lowerHeaders;
    delete baseHeaders.host; // provided by makeHeaders()
    delete baseHeaders.cookie; // provided by makeHeaders()

    // check for prev auth
    if (!u.auth && prevU.auth) {
      if ((prevU.hostname == u.hostname)) {
        u.auth = prevU.auth; // re-use previous auth
      } else {
        delete baseHeaders.authorization; // different hostname = delete auth
      }
    }

    $_.previousVerb = verb;
    $_.previousUrl = formatUrl(u, true, true);

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
    web_repl.prompt = formatUrl(u, false) + ' > ';

    var request = client.request(verb, path, headers);
    if (content) {
      request.write(content);
    }

    $_.requestHeaders = headers;
    request.end();
    request.on('response', function (response) {
      if ($_.printStatus) {
        formatStatus(response.statusCode, u);
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
        var bufferOk = true;
        $_.raw = body;
        delete $_['document'];
        delete $_['json'];
        if (httpSuccess(response.statusCode) && _.isJSON($_.headers)) {
          $_.json = JSON.parse(body);
        }
        
        if ($_.printResponse) {
          bufferOk = responsePrinter($_, response);
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

