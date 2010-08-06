var sys = require('sys'),
    fs = require('fs'),
    U = require('util'),
    wsrc = require('wsrc');

var rc = wsrc.get();
var cookieJar = rc.cookies || {};

function clear() {
  cookieJar = {};
}

function remove(site, key) {
  if (cookieJar[site]) {
    if (key) {
      delete cookieJar[site][key];
    } else {
      delete cookieJar[site];
    }
  } 
}

function set(site, key, value, options) {
  cookieJar[site] = cookieJar[site] || {};
  cookieJar[site][key] = {value: value};
  U.extend(true, cookieJar[site][key], options);
}

function get(domain, key) {
  cookieJar = compactJar(false);
  for (var site in cookieJar) {
    if (U.endsWith(site, domain)) {
      var jar = cookieJar[site];
      if (!key) {
        return U.extend(true, {}, jar);
      } else if (jar[key]) {
        return U.extend(true, {}, jar[key]);
      }
    }
  }
}

function parseCookie(string) {
  var first = true;
  var cookie = {http_only: false};
  string.trim().split(";").forEach(function(component) {
    if (first) {
      var parts = component.trim().split('=');
      cookie.key = parts[0];
      cookie.value = parts.slice(1).join('=');
      first = false;
    } else {
      if (component.trim().toLowerCase() === 'httponly') {
        cookie.http_only = true;
      } else {
        var parts = component.trim().split('=');
        cookie[parts[0]] = parts[1];
      }
    }
  });
  if (cookie.expires) {
    cookie.expires = new Date(cookie.expires);
  }
  if (!cookie.path) {
    cookie.path = "/";
  }
  return cookie;
}

function mergeCookies(domain, cookies, cookieJar) {
  //filter out cookies with illegal domains
  U.filter(cookies, function(cookie) {
    return U.endsWith(cookie.domain, domain);
  });
  var now = new Date();
  U.each(cookies, function(cookie) {
    var jar = cookieJar[cookie.domain] || {};
    jar[cookie.key] = cookie;
    if (cookie.expires && cookie.expires < now) {
      delete jar[cookie.key];
    }
    cookieJar[cookie.domain] = jar;
  });
}

function update(domain, header) {
  if (header) {
    var cookies = U.map(header, parseCookie);
    U.each(cookies, function(cookie) {
      if (!cookie.domain) {
        cookie.domain = domain;
      }
    });
    mergeCookies(domain, cookies, cookieJar);
  }
}

function compactJar(expireSessionCookies) {
  var now = new Date();
  U.map(cookieJar, function(site) {
    for (var key in site) {
      if ((expireSessionCookies && !site[key].expires) || (site[key].expires && site[key].expires < now)) {
        delete site[key];
      }
    }
    return site;
  });
  return U.extend(true, {}, cookieJar);
}

function headerFor(url) {
  var kvs = [];
  for (var site in cookieJar) {
    if (U.endsWith(site, url.hostname)) {
      var jar = cookieJar[site];
      for (var key in jar) {
        if (U.startsWith(jar[key].path, url.pathname)) {
          kvs.push(key + "=" + jar[key].value); 
        }
      }
    }
  }
  return kvs.length > 0 ? kvs.join('; ') : undefined;
}

/* internal use only */
function get_raw() {
  return cookieJar;
}

/* internal use only */
function set_raw(jar) {
  cookieJar = jar;
}

exports.clear = clear;
exports.remove = remove;
exports.set = set;
exports.get = get;
exports.update = update;
exports.compactJar = compactJar;
exports.headerFor = headerFor;
exports.__set_raw__ = set_raw;
exports.__get_raw__ = get_raw;
/*

function createCookie(name,value,days) {
	if (days) {
		var date = new Date();
		date.setTime(date.getTime()+(days*24*60*60*1000));
		var expires = "; expires="+date.toGMTString();
	}
	else var expires = "";
	document.cookie = name+"="+value+expires+"; path=/";
}

function readCookie(name) {
	var nameEQ = name + "=";
	var ca = document.cookie.split(';');
	for(var i=0;i < ca.length;i++) {
		var c = ca[i];
		while (c.charAt(0)==' ') c = c.substring(1,c.length);
		if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
	}
	return null;
}

function eraseCookie(name) {
	createCookie(name,"",-1);
}
*/