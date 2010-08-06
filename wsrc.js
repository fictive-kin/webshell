var fs = require('fs');

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


exports.get = getRC;
exports.write = writeRC;