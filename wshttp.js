var _ = require('underscore')._,
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

var WsHttp = function($_, web_repl, webshellVersion) {
  this.$_ = $_;
  this.web_repl = web_repl;
  this.webshellVersion = webshellVersion;
  this.$_.pendingRequests = [];
  this.$_.enqueuedRequests = [];
  this.requestSeq = 0;
  if (undefined === this.$_.requestConcurrency) {
    this.$_.requestConcurrency = 5;
  }
};

WsHttp.prototype = {
  makeHeaders: function (url) {
    var hostHeader = url.hostname;
    if (url.protocol === 'https:' && url.port !== 443) {
      hostHeader += ":" + url.port;
    } else if (url.protocol === 'http:' && url.port !== 80) {
      hostHeader += ":" + url.port;
    }

    var headers = {
      'host': hostHeader,
      'user-agent': 'Webshell/' + this.webshellVersion + ' node.js/' + process.version,
      'accept': 'application/json, */*'
    };

    if (url.auth) {
      headers['authorization'] = 'Basic ' + WebShell.Util.base64Encode(url.auth);
    }

    if (this.$_.useCookies) {
      var cookie = cookies.headerFor(url);
      if (cookie) {
        headers['cookie'] = cookie;
      }
    }
    return headers;
  },

  doReq: function (verb, urlStr, cb) {
    this.web_repl.suppressPrompt++;
    result = new ResultHolder(verb, urlStr);

    var u = wsutil.parseURL(urlStr, true, this.$_.previousUrl);
    var prevU = this.$_.previousUrl ? wsutil.parseURL(this.$_.previousUrl, true) : undefined;
    var client = http.createClient(u.port, u.hostname, u.protocol === 'https:');
    var xmlHeaders = ['text/html', 'text/xml', 'application/xml', 'application/rss+xml', 'application/rdf+xml', 'application/atom+xml'];
    var baseHeaders = _.clone(this.$_.requestHeaders);
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

    this.$_.previousVerb = verb;
    this.$_.previousUrl = wsutil.formatUrl(u, true, true);

    var content = null;
    var headers = this.makeHeaders(u, this.$_);

    // merge in $_.requestHeaders
    if (typeof this.$_.requestHeaders != 'object') {
        // something's not right here, so reset requestHeaders
        // note: setting $_.requestHeaders to {} is also a good way for users
        //       to reset things like the Accept header
        this.$_.requestHeaders = {};
    }

    _.each(baseHeaders, function(v, k) {
      // these are provided by makeHeaders()
      headers[k] = v;
    });

    switch (verb) {
      case 'POST':
        if (typeof this.$_.requestData == "object") {
          content = querystring.stringify(this.$_.requestData);
          headers['content-type'] = 'application/x-www-form-urlencoded';
        } else {
          if (!headers['content-type']) {
            headers['content-type'] = 'application/x-www-form-urlencoded';
          }
          content = this.$_.requestData;
        }
        break;
      case 'PUT':
        if (typeof this.$_.requestData !== 'string') {
          console.log(stylize("$_.requestData must be a string", "red"));
          this.web_repl.displayPrompt(true);
          return false;
        }
        content = this.$_.requestData;
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
    this.web_repl.prompt = wsutil.formatUrl(u, false) + ' > ';

    var request = client.request(verb, path, headers);
    if (content) {
      request.write(content);
    }

    this.$_.requestHeaders = headers;
    var self = this;
    request.on('response', function (response) {
      if (self.$_.printStatus) {
        var bufferOk = self.web_repl.rli.outputWrite(
          '\x1b[1K'
          + '\x1b[' + (self.web_repl.rli._promptLength + self.web_repl.rli.line.length) + 'D'
          + wsutil.formatStatus(response.statusCode, u, response.client.seq)
          + "\n");
        if (bufferOk) {
          self.web_repl.displayPrompt(true);
        } else {
          self.web_repl.displayPromptOnDrain = true;
        }
      }
      self.$_.status = response.statusCode;

      if (self.$_.printHeaders) {
        _.each(response.headers, wsutil.printHeader);
      }
      self.$_.headers = response.headers;
      if (self.$_.useCookies) {
        self.$_.cookies.update(u.hostname, response.headers['set-cookie']);
      }
      response.setEncoding('utf8');
      var body = "";
      response.on('data', function (chunk) {
        body += chunk;
      });
      response.on('end', function() {
        var bufferOk = true;
        self.$_.raw = body;
        delete self.$_['document'];
        delete self.$_['json'];
        if (response.statusCode >= 200 && response.statusCode < 300 && _.isJSON(self.$_.headers)) {
          self.$_.json = JSON.parse(body);
        }

        if (self.$_.printResponse) {
          bufferOk = wsutil.responsePrinter(self.$_, response);
        }

        if (self.$_.useJquery && undefined !== self.$_.headers['content-type'] && _.include(xmlHeaders, self.$_.headers['content-type'].split('; ')[0])) {
          self.$_.document = new env.DOMDocument(body);
          window.document = self.$_.document;

          self.web_repl.context.$ = function(selector, context) {
            var doSetup = !!env.window.document;
            env.window.document = self.$_.document;
            if (doSetup) {
              jquery.setup(env.window);
            }
            return env.window.jQuery(selector, context);
          };
        }

        _.extend(result, {raw: self.$_.raw, headers: self.$_.headers, statusCode: self.$_.status, json: self.$_.json});
        result.finalize();
        if (cb) {
          cb(self.$_); // TODO
        }
        if (bufferOk) {
          self.web_repl.displayPrompt(true);
        } else {
          self.web_repl.displayPromptOnDrain = true;
          self.web_repl.suppressPrompt--;
        }
        // remove this client from pending requests
        self.$_.pendingRequests = _.without(self.$_.pendingRequests, response.client.seq);

        // check to see if there are enqueued requests
        if (self.$_.enqueuedRequests.length > 0) {
          var request = self.$_.enqueuedRequests.shift();

          var bufferOk = self.web_repl.rli.outputWrite(
            '\x1b[1K'
            + '\x1b[' + (self.web_repl.rli._promptLength + self.web_repl.rli.line.length) + 'D'
            + "Dequeuing request: enqueued seq #" + request.seq + "\n"
          );
          if (bufferOk) {
            self.web_repl.displayPrompt(true);
          } else {
            self.web_repl.displayPromptOnDrain = true;
          }
          self.$_.pendingRequests.push(request.seq);
          request.end();

        }
      });
    });

    // set client to a unique ID so it can be tracked in the response
    client.seq = this.requestSeq++;
    request.seq = client.seq;
    if (this.$_.pendingRequests.length < this.$_.requestConcurrency) {
      this.$_.pendingRequests.push(client.seq);
      request.end();
    } else {
      this.$_.enqueuedRequests.push(request);

      var bufferOk = this.web_repl.rli.outputWrite(
        '\x1b[1K'
        + '\x1b[' + (self.web_repl.rli._promptLength + self.web_repl.rli.line.length) + 'D'
        + "Already " + this.$_.requestConcurrency
        + " pending requests: enqueued seq #" + client.seq + "\n"
      );
      if (bufferOk) {
        self.web_repl.displayPrompt(true);
      } else {
        self.web_repl.displayPromptOnDrain = true;
      }
    }

    return result;
  },

  doRedirect: function() {
    var location = this.$_.headers.location;
    if (location) {
      this.doReq(this.$_.previousVerb, location, null);
    } else {
      console.log(stylize("No previous request!", 'red'));
    }
  }
};

exports.WsHttp = WsHttp;
