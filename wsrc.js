var fs = require('fs'),
    stylize = require('colors').stylize,
    wsutil = require('wsutil'),
    _ = require('underscore')._;

var functionPrefix = '___WSFUNC___';

function getRC() {
  try {
    return JSON.parse(fs.readFileSync(process.env.HOME + '/.webshellrc'));
  } catch (e) {
    return { history: [], contexts: {}, cookies: {} };
  }
}

function writeRC(rc, cookies) {
  rc.cookies = cookies.compactJar(true);
  return fs.writeFileSync(
    process.env.HOME + '/.webshellrc',
    JSON.stringify(rc)
  );
}

function saveContext(name, $_) {
  var obj = {};
  _.each($_, function(v, k) {
    if (!_.isFunction(v)) {
      obj[k] = v;
    }
  });
  var toolbox = {};
  _.each(obj.toolbox, function(v, k) {
    if (typeof v === 'function') {
      toolbox[k] = functionPrefix + v;
    } else {
      toolbox[k] = v;
    }
  });
  obj.toolbox = toolbox;
  delete obj['cookies'];
  obj.__cookieJar = $_.cookies.__get_raw__();

  var rc = getRC();

  if (!rc.contexts) {
    rc.contexts = {};
  }
  rc.contexts[name] = obj;
  writeRC(rc, $_.cookies);
  console.log("Saved context: " + name);
  return getRC();
}


function loadContext(name, $_, web_repl, ignoreError) {
  var rc = getRC();
  if (rc.contexts[name]) {
    _.each(rc.contexts[name], function (v, k) {
      $_[k] = v;
    });
    // transpose functions from toolbox
    if ($_.toolbox) {
      var toolbox = {};
      _.each($_.toolbox, function (v, k) {
        if (typeof v == 'string' && v.substring(0, functionPrefix.length) == functionPrefix) {
          try {
            eval("toolbox[k] = " + v.slice(functionPrefix.length));
          } catch (e) {}
        } else {
          toolbox[k] = v;
        }
      });
      $_.toolbox = toolbox;
    }
    $_.cookies.__set_raw__($_.__cookieJar);
    delete $_['__cookieJar'];
    console.log("Loaded context: " + name);
  } else if (!ignoreError) {
    console.log(stylize("Could not load context: " + name, 'red'));
  }
  if (web_repl && $_.previousUrl) {
    u = wsutil.parseURL($_.previousUrl);
    web_repl.prompt = wsutil.formatUrl(u, false) + ' > ';
  }
}

function delContext(name, $_) {
  var rc = getRC();
  if (rc.contexts[name]) {
    delete rc.contexts[name];
    writeRC(rc, $_.cookies);
    console.log("Deleted context: " + name);
  } else {
    console.log(stylize("Context " + name + " does not exist.", 'red'));
  }
}


exports.get = getRC;
exports.write = writeRC;
exports.saveContext = saveContext;
exports.loadContext = loadContext;
exports.delContext = delContext;

