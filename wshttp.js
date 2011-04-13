// Note: the Digest code in this file was mostly lifted from:
//   https://github.com/codehero/node-http-digest
// "node-http-digest is in the public domain."

var _ = require('underscore')._,
    http = require('http'),
    https = require('https'),
    url = require('url'),
    cookies = require('cookies'),
    env = require('env'),
    stylize = require('colors').stylize,
    querystring = require('querystring'),
    hashlib = require('hashlib'),
    wsutil = require('wsutil');

var window = env.window;

var digestPersistent = {
  // FIXME This is bad, should use a random cnonce!
  cnonce: "cdb0e64d1ded02dd",
  qop: null,
  opaque: null,
  // Have not yet determined realm
  HA1: null,
  nonceCount: 0,
  nonce: null,
  realm: null,
  stale: null
};
var digestPersistentCopy = _.clone(digestPersistent);
var digestWwwAuthMap = {
  "realm" : "realm=\"",
  "nonce" : "nonce=\"",
  "qop" : "qop=\"",
  "opaque" : "opaque=\"",
  "stale" : "stale="
};

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
  this.$_.pendingRequests = {_count: 0};
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

    if (this.$_.useCookies) {
      var cookie = cookies.headerFor(url);
      if (cookie) {
        headers['cookie'] = cookie;
      }
    }
    return headers;
  },

  doReq: function (verb, urlStr, cb, doAuth, prevResponse) {
    result = new ResultHolder(verb, urlStr);

    var u = wsutil.parseURL(urlStr, true, this.$_.previousUrl);
    var client;
    var xmlHeaders = ['text/html', 'text/xml', 'application/xml', 'application/rss+xml', 'application/rdf+xml', 'application/atom+xml'];
    var baseHeaders = _.clone(this.$_.requestHeaders);
    var lowerHeaders = {};
    _.map(baseHeaders, function (v, k) {
      lowerHeaders[k.toLowerCase()] = v;
    });
    baseHeaders = lowerHeaders;
    delete baseHeaders.host; // provided by makeHeaders()
    delete baseHeaders.cookie; // provided by makeHeaders()

    this.$_.previousVerb = verb;
    this.$_.previousUrl = wsutil.formatUrl(u, true, true);

    var content = null;
    var headers = this.makeHeaders(u, this.$_);
    var self = this;
    var responseHandler = function (response) {
      if (self.$_.printStatus) {
        console.log(
            '\x1b[1K' // erase to start of line
            + '\x1b[' + (self.web_repl.rli._promptLength + self.web_repl.rli.line.length) + 'D' // cursor to start of line
            + wsutil.formatStatus(
                response.statusCode,
                u,
                response.client._httpMessage.seq,
                undefined === self.$_.auth ? null : self.$_.auth.rerequested
              )
        );
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
        } else if ((undefined === doAuth) && response.statusCode == 401 && self.$_.auth) {
          if (undefined !== response.headers['www-authenticate']) {
            var authType = response.headers['www-authenticate'].split(' ')[0].toLowerCase();
            self.doReq(verb, urlStr, cb, authType, _.clone(response));
          }
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
          self.web_repl.displayPrompt();
        } else {
          self.web_repl.displayPromptOnDrain = true;
        }

        // remove this client from pending requests
        delete self.$_.pendingRequests[response.client.seq];
        self.$_.pendingRequests._count--;

        // check to see if there are enqueued requests
        if (self.$_.enqueuedRequests.length > 0) {
          var request = self.$_.enqueuedRequests.shift();
          self.web_repl.outputAndPrompt(
            stylize(request.result.verb, 'blue') + ' ' + request.result.url
            + stylize(' #' + request.seq + ' (dequeued)', 'grey')
          );
          self.$_.pendingRequests[request.seq] = request.result;
          self.$_.pendingRequests._count++;
          request.end();

        }
      });
    };


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
          this.web_repl.displayPrompt();
          return false;
        }
        content = this.$_.requestData;
        if (!headers['content-type']) {
          headers['content-type'] = 'application/octet-stream';
        }
        break;
    }
    if (content) {
      headers['content-length'] = content.length;
    } else {
      // no content = no content-length header necessary
      delete headers['content-length'];
    }

    this.calculateAuth(u);
    delete(u.auth);
    delete(headers.authorization);
    if (!doAuth && undefined !== this.$_.auth && (this.$_.auth.rerequested)) {
      doAuth = this.$_.auth.rerequested;
    }

    var reqPath = u.pathname + (undefined === u.search ? '' : u.search);

    if (doAuth) {
      u.auth = this.$_.auth.user + ':' + this.$_.auth.pass;
      switch (doAuth) {
        case 'basic':
          headers['authorization'] = 'Basic ' + wsutil.base64Encode(u.auth);
          this.$_.auth.rerequested = doAuth;
          break;
        case 'digest':
          this.makeDigestHeaders(verb, reqPath, this.$_.auth.user, this.$_.auth.pass, prevResponse, headers);
          this.$_.auth.rerequested = doAuth;
          break;
        default:
          console.log(stylize('Unable to handle www-authenticate type: ' + doAuth, 'red'));
          return;
      }
    }
    var port;
    switch (u.protocol) {
      case 'http:':
        client = http;
        port = (undefined === u.port) ? 80 : u.port;
        break;
      case 'https:':
        client = https;
        port = (undefined === u.port) ? 443 : u.port;
        break;
      default:
        console.log(stylize("Unsupported protocol: " + u.protocol, 'red'));
        return;
    }
    var request = client.request(
        {
          host: u.hostname,
          port: port,
          method: verb,
          path: reqPath,
          headers: headers
        },
        responseHandler
    );

    // set prompt
    this.web_repl.prompt = wsutil.formatUrl(u, false) + ' > ';

    if (content) {
      request.write(content);
    }

    this.$_.requestHeaders = headers;

    // set client to a unique ID so it can be tracked in the response
    client.seq = this.requestSeq++;
    request.seq = client.seq;
    request.result = result;
    if (this.$_.pendingRequests._count < this.$_.requestConcurrency) {
      this.$_.pendingRequests[client.seq] = result;
      this.$_.pendingRequests._count++;
      request.end();
      this.web_repl.outputStream.write(stylize(result.verb, 'blue') + ' ' + result.url);
      this.web_repl.displayPrompt();
    } else {
      this.$_.enqueuedRequests.push(request);
      this.web_repl.outputAndPrompt(
        stylize(result.verb, 'blue') + ' ' + result.url
        + stylize(' #' + client.seq + ' (enqueued)', 'grey')
      );
    }
  },

  doRedirect: function() {
    var location = this.$_.headers.location;
    if (location) {
      this.doReq(this.$_.previousVerb, location, null);
    } else {
      console.log(stylize("No previous request!", 'red'));
    }
  },

  calculateAuth: function (u) {
    var currentHost = u.protocol + (u.slashes ? '//' : '') + u.hostname + ":" + u.port;
    var changed = false;
    if (
      undefined !== this.$_.auth
      && undefined !== this.$_.auth.host
      && this.$_.auth.host !== currentHost
    ) {
      delete(this.$_.auth);
      changed = true;
    }
    if (u.auth) {
      var auth = u.auth.split(':');
      if (undefined === this.$_.auth) {
        this.$_.auth = {
          user: auth[0],
          host: currentHost,
        };
        if (undefined !== auth[1]) {
          this.$_.auth.pass = auth[1];
        }
        changed = true;
      } else {
        if (undefined === this.$_.auth.user || this.$_.auth.user !== auth[0]) {
          changed = true;
          this.$_.auth.user = auth[0];
        }
        if (undefined !== auth[1]) {
          if (this.$_.auth.pass !== auth[1]) {
            changed = true;
            this.$_.auth.pass = auth[1];
          }
        }
      }
      if (changed) {
        digestPersistent = _.clone(digestPersistentCopy); // reset digest
        this.$_.auth.rerequested = false;
        console.log(stylize('Changed $_.auth to ' + this.$_.auth.user + ':' + this.$_.auth.pass, 'blue'));
      }
    } else {
      if (changed) {
        digestPersistent = _.clone(digestPersistentCopy); // reset digest
        console.log(stylize('Unset $_.auth', 'blue'));
      }
    }
  },

  makeDigestHeaders: function (method, path, user, pass, response, headers) {
    ++digestPersistent.nonceCount;
    if (digestPersistent.HA1) {
      var HA2 = (method + ":" + path);
      // FIXME Handle "auth-int" case!
      //if(self.qop == "auth" || self.qop == "auth-int"){
      //}

      // Calculate 8 digit hex nc value.
      var nc = digestPersistent.nonceCount.toString(16);
      while (nc.length < 8) {
        nc = "0" + nc;
      }

      HA2 = hashlib.md5(HA2);

      /* Calculate middle portion of undigested 'response' */
      var middle = digestPersistent.nonce;
      if (digestPersistent.qop == "auth" || digestPersistent.qop == "auth-int") {
        middle += ":" + nc + ":" + digestPersistent.cnonce + ":" + digestPersistent.qop;
      }

      /* Digest the response. */
      var response = digestPersistent.HA1 + ":" + middle + ":" + HA2;
      response = hashlib.md5(response);

      /* Assemble the header value. */
      var hdrVal = "Digest username=\"" + user
        + "\", realm=\"" + digestPersistent.realm
        + "\", nonce=\"" + digestPersistent.nonce
        + "\", uri=\"" + path + "\"";

      if (digestPersistent.qop) {
        hdrVal += ", qop=" + digestPersistent.qop
          + ", nc=" + nc
          + ", cnonce=\"" + digestPersistent.cnonce + '"';
      }

      hdrVal += ", response=\"" + response + '"';
      if (digestPersistent.opaque) {
        hdrVal += ", opaque=\"" + digestPersistent.opaque + '"';
      }

      headers["authorization"] = hdrVal;
      return;
    }

    // HA1 is not yet set, so determine it:
    var a = response.headers["www-authenticate"];
    if (a) {
      /* Update server values. */
      for (v in digestWwwAuthMap) {
        var idx = a.indexOf(digestWwwAuthMap[v]);
        if (idx != -1) {
          idx += digestWwwAuthMap[v].length;
          var e = (v != "stale") ? a.indexOf('"', idx) : a.indexOf(',', idx);

          // Correct for the odd ball stale (has no quotes..)
          // FIXME handle badly formatted string?
          if (-1 == e && "stale" == v) {
            e = a.length;
          }

          digestPersistent[v] = a.substring(idx, e);
        }
      }
    } else {
      // FIXME Server is not using auth digest?
    }

    // Ignore realm
    //if(self.expectedRealm && self.realm != self.expectedRealm){
      // FIXME realm mismatch!
    //}

    // If have previous auth info, then try to revalidate.
    if (digestPersistent.HA1) {
      // If did not recv stale, then have bad credentials.
      if (null == digestPersistent.stale) {
        // FIXME some kind of exception?
      }
    } else {
      // Initialize HA1
      digestPersistent.HA1 = user + ":" + digestPersistent.realm + ":" + pass;
      digestPersistent.HA1 = hashlib.md5(digestPersistent.HA1);
    }

    // HACK FIXME Just dropping back to auth!
    if (digestPersistent.qop) {
      digestPersistent.qop = "auth";
    }

    // Start with 0 nonceCount
    digestPersistent.nonceCount = -1;

    // call self now that we have HA1 set up
    return this.makeDigestHeaders(method, path, user, pass, response, headers);
  }


};

exports.WsHttp = WsHttp;
