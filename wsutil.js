var url = require('url'),
    util = require('util'),
    stylize = require('colors').stylize,
    _ = require('underscore')._;

exports.parseURL = function(urlStr, protocolHelp, previousUrl) {
  var u = url.parse(urlStr);
  var prevU = previousUrl ? arguments.callee(previousUrl) : url.parse('http://example.com:80/');
  
  if (!u.protocol && !u.hostname) {
    u.protocol = prevU.protocol;
    u.hostname = prevU.hostname;
    u.slashes = prevU.slashes;
    u.port = prevU.port;
    if (u.pathname.substr(0,1) != '/') {
      u.pathname = '/' + u.pathname;
    }
  }
  
  if (protocolHelp && !u.protocol) {
    u = url.parse('http://'+urlStr);
  }
  u.port = u.port || (u.protocol === 'https:' ? 443 : 80);
  u.pathname = u.pathname || '/';
  return u;
};

exports.formatUrl = function (u, includePath, showPassword) {
  var auth = '';
  var port = '';
  if (('http:' === u.protocol && 80 !== u.port) || ('https:' === u.protocol && 443 !== u.port)) {
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
};

exports.responsePrinter = function($_, response) {
  var bufferOk = true;
  if (_.isFunction($_.toolbox.responsePrinter)) {
    bufferOk = $_.toolbox.responsePrinter($_, response);
  } else {
    if ($_.json) {
      bufferOk = web_repl.rli.outputWrite(util.inspect($_.json, false, undefined, true));
      web_repl.rli.outputWrite("\n");
    }
  }
  return bufferOk;
};

exports.formatStatus = function(status, url) {
  var url = exports.formatUrl(url, true);
  var msg = "HTTP " + status + " " + stylize(url, 'white');
  if (exports.httpSuccess(status)) {
    console.log(stylize(msg, 'green'));
  } else if (exports.httpRedirection(status)) {
    console.log(stylize(msg, 'yellow'));
  } else if (exports.httpClientError(status) || exports.httpServerError(status)) {
    console.log(stylize(msg, 'red'));
  } else {
    console.log(stylize(msg, 'white'));
  }
};

exports.httpSuccess = function(status) {
  return status >= 200 && status < 300;
};

exports.httpRedirection = function(status) {
  return status >= 300 && status < 400;
};

exports.httpClientError = function(status) {
  return status >= 400 && status < 500;
};

exports.httpServerError = function(status) {
  return status >= 500 && status < 600;
};

exports.base64Encode = function(str) {
  return (new Buffer(str, 'ascii')).toString('base64');
}

exports.printHeader = function(value, name) {
  function normalizeName(name) {
    return _.map(name.split('-'), function(s) { return s[0].toUpperCase() + s.slice(1, s.length); }).join('-');
  };

  util.puts(normalizeName(name) + ": " + value);
};

