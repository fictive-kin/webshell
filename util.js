var url = require('url'),
    sys = require('sys'),
    stylize = require('colors').stylize,
    _ = require('underscore')._;

exports.parseURL = function(urlStr, protocolHelp) {
  var u = url.parse(urlStr);
  if (protocolHelp && !u.protocol) {
    u = url.parse('http://'+urlStr);
  }
  u.port = u.port || (u.protocol === 'https:' ? 443 : 80);
  u.pathname = u.pathname || '/';
  return u;
};

exports.formatUrl = function(u) {
  return url.format(u);
};

exports.responsePrinter = function($_, response) {
  var bufferOk = true;
  if (_.isFunction($_.toolbox.responsePrinter)) {
    bufferOk = $_.toolbox.responsePrinter($_, response);
  } else {
    if ($_.json) {
      bufferOk = web_repl.rli.outputWrite(sys.inspect($_.json, false, undefined, true));
      web_repl.rli.outputWrite("\n");
    }
  }
  return bufferOk;
};

exports.formatStatus = function(status, url) {
  var msg = "HTTP " + status + " " + stylize(url, 'white');
  if (200 <= status && status < 300) {
    console.log(stylize(msg, 'green'));
  } else if (300 <= status && status < 400) {
    console.log(stylize(msg, 'yellow'));
  } else if (400 <= status && status < 600) {
    console.log(stylize(msg, 'red'));
  } else {
    console.log(stylize(msg, 'white'));
  }
};

exports.base64Encode = function(str) {
  return (new Buffer(str, 'ascii')).toString('base64');
}

exports.printHeader = function(value, name) {
  function normalizeName(name) {
    return _.map(name.split('-'), function(s) { return s[0].toUpperCase() + s.slice(1, s.length); }).join('-');
  };

  sys.puts(normalizeName(name) + ": " + value);
};

