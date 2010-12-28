var util = require('util'),
    _ = require('underscore')._,
    http = require('http'),
    cookies = require('cookies'),
    env = require('env'),
    stylize = require('colors').stylize,
    wsutil = require('wsutil');

var window = env.window;

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

var webshellVersion = 'TMP';

function makeHeaders(url, $_) {
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

var doReq = function(verb, urlStr, cb, $_, web_repl) {
  web_repl.suppressPrompt++;
  result = new ResultHolder(verb, urlStr);

  var u = wsutil.parseURL(urlStr, true, $_.previousUrl);
  var prevU = $_.previousUrl ? wsutil.parseURL($_.previousUrl, true) : undefined;
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
  $_.previousUrl = wsutil.formatUrl(u, true, true);

  var content = null;
  var headers = makeHeaders(u, $_);

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
  web_repl.prompt = wsutil.formatUrl(u, false) + ' > ';

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
        + wsutil.formatStatus(response.statusCode, u)
        + "\n");
      if (bufferOk) {
        web_repl.displayPrompt(true);
      } else {
        web_repl.displayPromptOnDrain = true;
      }
    }
    $_.status = response.statusCode;

    if ($_.printHeaders) {
      _.each(response.headers, wsutil.printHeader);
    }
    $_.headers = response.headers;
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
        bufferOk = wsutil.responsePrinter($_, response);
      }

      if ($_.useJquery && undefined !== $_.headers['content-type'] && _.include(xmlHeaders, $_.headers['content-type'].split('; ')[0])) {
        $_.document = new env.DOMDocument(body);
        window.document = $_.document;

        web_repl.context.$ = function(selector, context) {
          var doSetup = !!env.window.document;
          env.window.document = $_.document;
          if (doSetup) {
            jquery.setup(env.window);
          }
          return env.window.jQuery(selector, context);
        };
      }

      _.extend(result, {raw: $_.raw, headers: $_.headers, statusCode: $_.status, json: $_.json});
      result.finalize();
      if (cb) {
        cb($_); // TODO
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

var doRedirect = function($_, web_repl) {
  var location = $_.headers.location;
  if (location) {
    doReq($_.previousVerb, location, null, $_, web_repl);
  } else {
    util.puts(stylize("No previous request!", 'red'));
  }
};

exports.doReq = doReq;
exports.doRedirect = doRedirect;

