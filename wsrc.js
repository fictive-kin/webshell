var fs = require('fs'),
    sys = require('sys'),
    stylize = require('colors').stylize,
    _ = require('underscore')._;

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
  delete obj['cookies'];
  obj.__cookieJar = $_.cookies.__get_raw__();

  var rc = getRC();

  if (!rc.contexts) {
    rc.contexts = {};
  }
  rc.contexts[name] = obj;
  writeRC(rc, $_.cookies);
  sys.puts("Saved context: " + name);
  return getRC();
}


function loadContext(name, $_) {
  var rc = getRC();
  if (rc.contexts[name]) {
    _.each(rc.contexts[name], function (v, k) {
      $_[k] = v;
    });
    $_.cookies.__set_raw__($_.__cookieJar);
    delete $_['__cookieJar'];
    sys.puts("Loaded context: " + name);
  } else {
    sys.puts(stylize("Could not load context: " + name, 'red'));
  }
}


exports.get = getRC;
exports.write = writeRC;
exports.saveContext = saveContext;
exports.loadContext = loadContext;

