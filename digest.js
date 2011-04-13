// digest.js is from https://github.com/codehero/node-http-digest
// We're assuming that this is a compatible license, but if it's not, please
// let us know. This was clearly not marked GPL, on GitHub

var http = require("http");
var hashlib = require("hashlib");

var wwwAuthMap = {
	"realm" : "realm=\"",
	"nonce" : "nonce=\"",
	"qop" : "qop=\"",
	"opaque" : "opaque=\"",
	"stale" : "stale="
};

function DigestClient(client, username, password, expectedRealm){
	var self = this;
	self.client = client;
	self.username = username;
	self.password = password;
	self.expectedRealm = expectedRealm;

	/* FIXME This is bad, should use a random cnonce! */
	self.cnonce = "cdb0e64d1ded02dd";

	/* Initialize qop */
	self.qop = null;
	self.opaque = null;

	/* Have not yet determined realm. */
	self.HA1 = null;

	return self;
}

DigestClient.prototype.request = function(method, path, request_headers){
	var self = this;

	/* If method omitted, assume it was GET. */
  if(typeof(path) != "string"){
    headers = path;
    url = method;
    method = "GET";
  }

	/* If we have a definite HA1 then send authentication header. */
	if(self.HA1){
		var HA2 = (method + ":" + path);
		/* FIXME Handle "auth-int" case! */
		//if(self.qop == "auth" || self.qop == "auth-int"){
		//}

		/* Calculate 8 digit hex nc value. */
		var nc = self.nonceCount.toString(16);
		while(nc.length < 8)
			nc = "0" + nc;

		HA2 = hashlib.md5(HA2);

		/* Calculate middle portion of undigested 'response' */
		var middle = self.nonce;
		if(self.qop == "auth" || self.qop == "auth-int"){
			middle += ":" + nc + ":" + self.cnonce
				+ ":" + self.qop;
		}

		/* Digest the response. */
		var response = self.HA1 + ":" + middle + ":" + HA2;
		response = hashlib.md5(response);

		/* Assemble the header value. */
		var hdrVal = "Digest username=\"" + self.username
			+ "\", realm=\"" + self.realm
			+ "\", nonce=\"" + self.nonce
			+ "\", uri=\"" + path + "\"";

		if(self.qop){
			hdrVal += ", qop=" + self.qop
				+ ", nc=" + nc
				+ ", cnonce=\"" + self.cnonce + '"';
		}

		hdrVal += ", response=\"" + response + '"';
		if(self.opaque)
			hdrVal += ", opaque=\"" + self.opaque + '"';

		request_headers["authorization"] = hdrVal;
	}

	req = self.client.request(method, path, request_headers);

	req.addListener("response", this.responseListener);

	return req;
}

DigestClient.prototype.responseListener = function (response) {
	/* If not authorized, then probably need to update nonce. */
	if(401 == response.statusCode){
		var a = response.headers["www-authenticate"];
		if(a){
			/* Update server values. */
			for(v in wwwAuthMap){
				var idx = a.indexOf(wwwAuthMap[v]);
				if(idx != -1){
					idx += wwwAuthMap[v].length;

					var e = (v != "stale") ? a.indexOf('"', idx) : a.indexOf(',', idx);

					/* Correct for the odd ball stale (has no quotes..)
						* FIXME handle badly formatted string? */
					if(-1 == e){
						if("stale" == v)
							e = a.length;
					}

					self[v] = a.substring(idx, e);
				}
			}
		}
		else{
			/* FIXME Server is not using auth digest? */
		}

		/* Verify correct realm. */
		if(self.expectedRealm && self.realm != self.expectedRealm){
			/* FIXME realm mismatch! */
		}

		/* If have previous auth info, then try to revalidate. */
		if(self.HA1){
			/* If did not recv stale, then have bad credentials. */
			if(null == self.stale){
				/* FIXME some kind of exception? */
			}
		}
		else{
			/* Initialize HA1. */
			self.HA1 = self.username + ":" + self.realm + ":" + self.password;
			self.HA1 = hashlib.md5(self.HA1);
		}

		/* HACK FIXME Just dropping back to auth! */
		if(self.qop)
			self.qop = "auth";

		/* Start with 0 nonceCount. */
		self.nonceCount = 0;

		/* FIXME HACK Revise response code to 408 to trick user into retrying.
			* 401 is not appropriate since the credentials ARE correct.
			* I didn't store the request, so node users will be pissed that
			* they have to set up their complicated streams again.
			* Clearly this is not good karma, but I need this working now. */
		response.statusCode = 408;
	}

	/* Increment the nonceCount */
	++self.nonceCount;
};

exports.createClient = function(port, host, username, password, expectedRealm){
	var c = http.createClient(port, host);
	return new DigestClient(c, username, password);
};
exports.createFromResponse = function(response, port, host, username, password, expectedRealm){
	var dc = exports.createClient(port, host, username, password, expectedRealm);
	dc.responseListener(response);
};
