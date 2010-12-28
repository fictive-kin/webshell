require.paths.unshift(__dirname + '/deps');
var webshellVersion = '0.3-dev';

require.paths.unshift(__dirname);
var WebShell = {
  Util: {}
};

var util = require('util'),
    repl = require('repl'),
    wsrepl = require('wsrepl'),
    fs = require('fs'),
    querystring = require('querystring'),
    stylize = require('colors').stylize,
    wsrc = require('wsrc'),
    wsreadline = require('wsreadline'),
    _ = require('underscore')._,
    wshttp = require('wshttp'),
    jquery = require('jquery');

_.extend(WebShell.Util, require('wsutil'));

_.mixin({
  isJSON: function(headers) {
    var jsonHeaders = ['application/json', 'text/x-json'];
    return headers['content-type'] && _.include(jsonHeaders, headers['content-type'].split('; ')[0]);
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
  postToRequestData: function (post) { return WebShell.Util.postToRequestData(this, post); },
  fileToRequestData: function (filename, encoding) { return WebShell.Util.fileToRequestData(this, filename, encoding); },
  cookies: require('cookies'),
  toolbox: {},
  evalFile: WebShell.Util.evalFile
};

var verbs = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE', 'CONNECT'];

WebShell.Shell = function(stream) {
  var prevU;
  wsrc.loadContext('_previous', $_, false, true);

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

  process.on('exit', function () { WebShell.Util.onExit(web_repl, $_); });
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

  ctx.$_.follow = function () { return wshttp.doRedirect($_, web_repl); };

  ctx.$_.saveContext = function (name) { wsrc.saveContext(name, $_); };
  ctx.$_.loadContext = function (name) { wsrc.loadContext(name, $_, web_repl); };
  ctx.$_.delContext = function (name) { wsrc.delContext(name, $_); };

  _.each(verbs, function (v) {
    $_[v.toLowerCase()] = function(url, cb) {
      return wshttp.doReq(v, url, cb, $_, web_repl);
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
            wshttp.doReq(split[0], split[1], null, $_, web_repl);
            web_repl.displayPrompt(true);
          } else {
            oldOnLineListener.call(null, cmd);
          }
        } else {
          web_repl.displayPrompt(true);
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

// vim: sw=2 ts=2 et
