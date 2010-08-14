/*
 * Simulated browser environment for Rhino
 *   By John Resig <http://ejohn.org/>
 * Copyright 2007 John Resig, under the MIT License
 */

var sys = require('sys'),
    http = require('http'),
    url = require('url'),
    _ = require('underscore')._;
var libxml;
try {
  libxml = require('libxmljs/libxmljs');
} catch (e) {
  exports.DOMDocument = function(x) { };
  return;
}

(function(){
  // The window Object
  var window = {};

  function URL(context, spec) {
    this.context = context;
    this.spec = spec;
    return url.parse(spec);
  }
	// Browser Navigator

	window.navigator = {
		get userAgent(){
			return "Mozilla/5.0 (Macintosh; U; Intel Mac OS X; en-US; rv:1.8.1.3) Gecko/20070309 Firefox/2.0.0.3";
		}
	};
	
	var curLocation = url.parse("file://" + __filename);
	
	window.__defineSetter__("location", function(url){
		var xhr = new XMLHttpRequest();
		xhr.open("GET", url);
		xhr.send();
	});
	
	window.__defineGetter__("location", function(url){
		return {
			get protocol(){
				return curLocation.protocol + ":";
			},
			get href(){
				return curLocation.href;
			},
			toString: function(){
				return this.href;
			}
		};
	});
	// Timers

/*	var timers = [];
	
	window.setTimeout = function(fn, time){
		var num;
		return num = setInterval(function(){
			fn();
			clearInterval(num);
		}, time);
	};
	
	window.setInterval = function(fn, time){
		var num = timers.length;
		
		timers[num] = new java.lang.Thread(new java.lang.Runnable({
			run: function(){
				while (true){
					java.lang.Thread.currentThread().sleep(time);
					fn();
				}
			}
		}));
		
		timers[num].start();
	
		return num;
	};
	
	window.clearInterval = function(num){
		if ( timers[num] ) {
			timers[num].stop();
			delete timers[num];
		}
	};*/
	
	
	// Window Events
	
	var events = [{}];

	window.addEventListener = function(type, fn){
		if ( !this.uuid || this == window ) {
			this.uuid = events.length;
			events[this.uuid] = {};
		}
	   
		if ( !events[this.uuid][type] )
			events[this.uuid][type] = [];
		
		if ( events[this.uuid][type].indexOf( fn ) < 0 )
			events[this.uuid][type].push( fn );
	};
	
	window.removeEventListener = function(type, fn){
	   if ( !this.uuid || this == window ) {
	       this.uuid = events.length;
	       events[this.uuid] = {};
	   }
	   
	   if ( !events[this.uuid][type] )
			events[this.uuid][type] = [];
			
		events[this.uuid][type] =
			events[this.uuid][type].filter(function(f){
				return f != fn;
			});
	};
	
	window.dispatchEvent = function(event){
		if ( event.type ) {
			if ( this.uuid && events[this.uuid][event.type] ) {
				var self = this;
			
				events[this.uuid][event.type].forEach(function(fn){
					fn.call( self, event );
				});
			}
			
			if ( this["on" + event.type] )
				this["on" + event.type].call( self, event );
		}
	};
	
	// DOM Document
	DOMDocument = function(file){
		this._file = file;
		this._dom = libxml.parseHtmlString(file);
		/* 
		  the next line is not a bug or a side-effect free function.  On www.google.com the HTML is particularly
		   malformed, and for some reason calling toString() on the root element changes the declared character encoding
		   of the underlying document...interesting.
		   The upshot is that without this call, jQuery doesn't work on google.com because the obj_nodes cache key changes
		   after it gets assigned in the line below 
		*/ 
		this._dom.root().toString();
		if (!obj_nodes[this._dom])
			obj_nodes[this._dom] = this;
	};
	
	window.DOMDocument=DOMDocument;
	
	function _getElementsByTagName(dom, name) {
		return dom.find('.//'+name);
	}
	
	DOMDocument.prototype = {
	  get nodeType(){
	    return this._dom.nodeType();
    },
	  get documentElement(){
	    return makeNode(this._dom.root());
    },
		createTextNode: function(text){
			return makeNode(this._dom.createTextNode(text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")));
		},
		createComment: function(text){
			return makeNode(this._dom.createComment(text));
		},
		createElement: function(name){
			return makeNode(new libxml.Element(this._dom, name.toLowerCase()));
		},
		getElementsByTagName: function(name){
			return new DOMNodeList(_getElementsByTagName(this._dom, name.toLowerCase()));
		},
		getElementsByClassName: function(name){
		  var elems = _getElementsByTagName(this._dom, "*");
	    return new DOMNodeList(_.filter(elems, function(elem) {
	      var classAttr = elem.attr('class');
	      var className = classAttr ? classAttr.value() : "";
	      return _.include(className.split(' '), name); 
	    }));
	  },
		getElementById: function(id){
		  var elem = this._dom.get("//*[@id='" + id + "']");
		  if (elem) {
		    return makeNode(elem);
	    }
	    return null;
		},
		get body(){
			return this.getElementsByTagName("body")[0];
		},
		get head(){
			return this.getElementsByTagName("head")[0];
	  },
		get G(){
			return makeNode(this._dom.document());
		},
		get ownerDocument(){
			return null;
		},
		addEventListener: window.addEventListener,
		removeEventListener: window.removeEventListener,
		dispatchEvent: window.dispatchEvent,
		get nodeName() {
			return "#document";
		},
		importNode: function(node, deep){
			return makeNode(this._dom.importNode(node._dom, deep));
		},
		toString: function(){
			return "Document" + (typeof this._file == "string" ?
				": " + this._file : "");
		},
		get innerHTML(){
			return this.documentElement.outerHTML;
		},
		
		get defaultView(){
			return {
				getComputedStyle: function(elem){
					return {
						getPropertyValue: function(prop){
							prop = prop.replace(/\-(\w)/g,function(m,c){
								return c.toUpperCase();
							});
							var val = elem.style[prop];
							
							if ( prop == "opacity" && val == "" )
								val = "1";
								
							return val;
						}
					};
				}
			};
		},
		
		createEvent: function(){
			return {
				type: "",
				initEvent: function(type){
					this.type = type;
				}
			};
		},
		
		createDocumentFragment: function() {
		  return makeNode(this._dom.createDocumentFragment());
	  }
	};
	
	function getDocument(node){
		return obj_nodes[node];
	}
	
	// DOM NodeList
	
	DOMNodeList = function(list){
		this._dom = list;
		this.length = list.length;
		
		for ( var i = 0; i < this.length; i++ ) {
			var node = list[i];
			this[i] = makeNode(node);
		}
	};
	
	DOMNodeList.prototype = {
		toString: function(){
			return "[ " + Array.prototype.join.call( this, ", " ) + " ]";
		},
		get outerHTML(){
			return Array.prototype.map.call(this, function(node){return node.outerHTML;}).join('');
		}
	};
	
	// DOM Node
	
	DOMNode = function(node){
		this._dom = node;
	};
	
	DOMNode.prototype = {
		get nodeType(){
			return this._dom.nodeType();
		},
		get nodeValue(){
			if (this.nodeType === 1) {
				return null;
			} else if (this.nodeType === 3 || this.nodeType === 8) {
				return this._dom.toString();
			}
		},
		get nodeName() {
			return "#" + this._dom.name();
		},
		cloneNode: function(deep){
			return makeNode( this._dom.cloneNode(deep) );
		},
		get ownerDocument(){
			return getDocument(this._dom.doc());
		},
		get documentElement(){
			return makeNode(this._dom.doc());
		},
		get parentNode() {
			return makeNode(this._dom.parent());
		},
		get nextSibling() {
			return makeNode(this._dom.nextSibling());
		},
		get previousSibling() {
			return makeNode(this._dom.prevSibling());
		},
		toString: function(){
			return '"' + this.nodeValue + '"';
		},
		get outerHTML(){
			return this.nodeValue;
		}
	};
	
	DOMDocumentFragment = function(elem){
		this._dom = elem;
	};
	
	DOMDocumentFragment.prototype = extend( new DOMNode(), {
		get childNodes(){
			return new DOMNodeList(this._dom.childNodes());
		},
		get firstChild(){
			return makeNode(this._dom.childNodes()[0]);
		},
		get lastChild(){
			var children = this._dom.childNodes();
			return makeNode(children[children.length - 1]);
		},
		appendChild: function(node){
			this._dom.addChild(node._dom);
			return node;
		},
		removeChild: function(node){
			node._dom.remove();
			return node;
		},

		getElementsByTagName: DOMDocument.prototype.getElementsByTagName,
		getElementsByClassName: DOMDocument.prototype.getElementsByClassName
	});

	// DOM Element

	DOMElement = function(elem){
		this._dom = elem;
		this.style = {
			get opacity(){ return this._opacity; },
			set opacity(val){ this._opacity = val + ""; }
		};
		
		// Load CSS info*/
		var styles = (this.getAttribute("style") || "").split(/\s*;\s*/);
		
		for ( var i = 0; i < styles.length; i++ ) {
			var style = styles[i].split(/\s*:\s*/);
			if ( style.length == 2 )
				this.style[ style[0] ] = style[1];
		}
	};

	DOMElement.prototype = extend( new DOMNode(), {
		get nodeName(){
			return this.tagName.toUpperCase();
		},
		get tagName(){
			return this._dom.name();
		},
		toString: function(){
			return "<" + this.tagName + (this.id ? "#" + this.id : "" ) + ">";
		},
		get outerHTML(){
			var ret = "<" + this.tagName, attr = this.attributes;
			
			for (var i in attr)
				ret += " " + i + "='" + attr[i] + "'";
				
			if ( this.childNodes.length || this.nodeName == "SCRIPT" )
				ret += ">" + this.childNodes.outerHTML + 
					"</" + this.tagName + ">";
			else
				ret += "/>";
			
			return ret;
		},
		
		get attributes(){
			var attr = {}, attrs = this._dom.attrs();
			
			for ( var i = 0, l = attrs.length; i < l; i++ )
				attr[attrs[i].name()] = attrs[i].value();
				
			return attr;
		},
		
		get innerHTML(){
			return this.childNodes.outerHTML;	
		},
		set innerHTML(html){
			html = html.replace(/<\/?([A-Z]+)/g, function(m){
				return m.toLowerCase();
			});
			
			var newDoc = new DOMDocument("<wrap>"+html+"</wrap>");
			var docElt = makeNode(newDoc._dom.document());
			var wrap = docElt.body.firstChild;
			
			var nodes = wrap.childNodes;
			while (this.firstChild) {
				this.removeChild(this.firstChild);
			}
			for ( var i = 0; i < nodes.length; i++ ){
				this.ownerDocument.importNode(nodes[i])
				this.appendChild(nodes[i]);
			}
		},
		
		get textContent(){
			return nav(this.childNodes);
			
			function nav(nodes){
				var str = "";
				for ( var i = 0; i < nodes.length; i++ )
					if ( nodes[i].nodeType == 3 )
						str += nodes[i].nodeValue;
					else if ( nodes[i].nodeType == 1 )
						str += nav(nodes[i].childNodes);
				return str;
			}
		},
		set textContent(text){
			while (this.firstChild)
				this.removeChild(this.firstChild);
			this.appendChild( this.ownerDocument.createTextNode(text));
		},
		
		style: {},
		clientHeight: 0,
		clientWidth: 0,
		offsetHeight: 0,
		offsetWidth: 0,
		
		get disabled() {
			var val = this.getAttribute("disabled");
			return val != "false" && !!val;
		},
		set disabled(val) { return this.setAttribute("disabled",val); },
		
		get checked() {
			var val = this.getAttribute("checked");
			return val != "false" && !!val;
		},
		set checked(val) { return this.setAttribute("checked",val); },
		
		get selected() {
			if ( !this._selectDone ) {
				this._selectDone = true;
				
				if ( this.nodeName == "OPTION" && !this.parentNode.getAttribute("multiple") ) {
					var opt = this.parentNode.getElementsByTagName("option");
					
					if ( this == opt[0] ) {
						var select = true;
						
						for ( var i = 1; i < opt.length; i++ )
							if ( opt[i].selected ) {
								select = false;
								break;
							}
							
						if ( select )
							this.selected = true;
					}
				}
			}
			
			var val = this.getAttribute("selected");
			return val != "false" && !!val;
		},
		set selected(val) { return this.setAttribute("selected",val); },

		get className() { return this.getAttribute("class") || ""; },
		set className(val) {
			return this.setAttribute("class",
				val.replace(/(^\s*|\s*$)/g,""));
		},
		
		get type() { return this.getAttribute("type") || ""; },
		set type(val) { return this.setAttribute("type",val); },
		
		get value() { return this.getAttribute("value") || ""; },
		set value(val) { return this.setAttribute("value",val); },
		
		get src() { return this.getAttribute("src") || ""; },
		set src(val) { return this.setAttribute("src",val); },
		
		get id() { return this.getAttribute("id") || ""; },
		set id(val) { return this.setAttribute("id",val); },
		
		getAttribute: function(name){
			return this._dom.attr(name) ? this._dom.attr(name).value() : null;
		},
		setAttribute: function(name,value){
			this._dom.setAttribute(name,value);
		},
		removeAttribute: function(name){
			this._dom.removeAttribute(name);
		},
		
		get childNodes(){
			return new DOMNodeList(this._dom.childNodes());
		},
		get firstChild(){
			return makeNode(this._dom.childNodes()[0]);
		},
		get lastChild(){
			var children = this._dom.childNodes();
			return makeNode(children[children.length - 1]);
		},
		appendChild: function(node){
			this._dom.addChild(node._dom);
			return node;
		},
		insertBefore: function(node,before){
		  if (before) {
		    before._dom.addPrevSibling(node._dom);
//  			this._dom.insertBefore(node._dom, before._dom);
	    } else {
	      this.appendChild(node);
      }
			return node;
		},
		removeChild: function(node){
			node._dom.remove();
			return node;
		},

		getElementsByTagName: DOMDocument.prototype.getElementsByTagName,
		getElementsByClassName: DOMDocument.prototype.getElementsByClassName,
		
		addEventListener: window.addEventListener,
		removeEventListener: window.removeEventListener,
		dispatchEvent: window.dispatchEvent,
		
		click: function(){
			var event = document.createEvent();
			event.initEvent("click");
			this.dispatchEvent(event);
		},
		submit: function(){
			var event = document.createEvent();
			event.initEvent("submit");
			this.dispatchEvent(event);
		},
		focus: function(){
			var event = document.createEvent();
			event.initEvent("focus");
			this.dispatchEvent(event);
		},
		blur: function(){
			var event = document.createEvent();
			event.initEvent("blur");
			this.dispatchEvent(event);
		},
		get elements(){
			return this.getElementsByTagName("*");
		},
		get contentWindow(){
			return this.nodeName == "IFRAME" ? {
				document: this.contentDocument
			} : null;
		},
		get contentDocument(){
			if ( this.nodeName == "IFRAME" ) {
				if ( !this._doc )
					this._doc = new window.DOMDocument(
						new java.io.ByteArrayInputStream((new java.lang.String(
						"<html><head><title></title></head><body></body></html>"))
						.getBytes("UTF8")));
				return this._doc;
			} else
				return null;
		}
	});
	
	// Helper method for extending one object with another
	
	function extend(a,b) {
		for ( var i in b ) {
			var g = b.__lookupGetter__(i), s = b.__lookupSetter__(i);
			
			if ( g || s ) {
				if ( g )
					a.__defineGetter__(i, g);
				if ( s )
					a.__defineSetter__(i, s);
			} else
				a[i] = b[i];
		}
		return a;
	}
	
	// Helper method for generating the right
	// DOM objects based upon the type
	
	var obj_nodes = {};
	
	function makeNode(node){
		var ELEMENT_NODE = 1;
		var FRAGMENT_NODE = 11;
		if (node) {
/*			if (!obj_nodes[node]) {
			  var nodeType = node.nodeType();
			  if (nodeType === ELEMENT_NODE) {
  				obj_nodes[node] = new DOMElement(node);
		    } else if (nodeType === FRAGMENT_NODE) {
  				obj_nodes[node] = new DOMDocumentFragment(node);
	      } else {
  				obj_nodes[node] = new DOMNode(node);
        }
			}
			return obj_nodes[node];*/
			if (!obj_nodes[node]) {
    			  var nodeType = node.nodeType();
    			  if (nodeType === ELEMENT_NODE) {
      				return new DOMElement(node);
    		    } else if (nodeType === FRAGMENT_NODE) {
      				return new DOMDocumentFragment(node);
    	      } else {
      				return new DOMNode(node);
            }
          } else {
            return obj_nodes[node];
          }
		} else
			return null;
	}
	
	// XMLHttpRequest
	// Originally implemented by Yehuda Katz

	XMLHttpRequest = function(){
		this.headers = {};
		this.responseHeaders = {};
	};
	
	XMLHttpRequest.prototype = {
		open: function(method, url, async, user, password){ 
			this.readyState = 1;
			if (async)
				this.async = true;
			this.method = method || "GET";
			this.url = url;
			this.onreadystatechange();
		},
		setRequestHeader: function(header, value){
			this.headers[header] = value;
		},
		getResponseHeader: function(header){ },
		send: function(data){
			var self = this;
			
			function makeRequest(){
				var url = URL(curLocation, self.url);
				
				if (url.protocol == "file") {
					if (self.method == "PUT") {
						var out = new java.io.FileWriter( 
								new java.io.File( new java.net.URI( url.toString() ) ) ),
							text = new java.lang.String( data || "" );
						
						out.write( text, 0, text.length() );
						out.flush();
						out.close();
					} else if ( self.method == "DELETE" ) {
						var file = new java.io.File( new java.net.URI( url.toString() ) );
						file["delete"]();
					} else {
						var connection = url.openConnection();
						connection.connect();
						handleResponse();
					}
				} else { 
				  var client = http.createClient(url.port || 80, url.hostname);
					self.headers['Host'] = url.hostname;
          
          if (data && data.length > 0) {
            self.headers['content-length'] = data.length;
  				  var request = client.request(self.method, url.pathname || '/', self.headers);
  				  request.write(content);
			    } else {
  				  var request = client.request(self.method, url.pathname || '/', self.headers);
		      }
          request.end();
          var body = "";
          request.on('response', function (response) {
            self.responseHeaders = response.headers;

            response.setEncoding('utf8');
            response.on('data', function (chunk) {
              body += chunk;
            });
            response.on('end', function() {
              handleResponse(response, body);
            });
          });
          
          
				}
				
				function handleResponse(response, body){
					self.readyState = 4;
					self.status = parseInt(response.statusCode) || undefined;
					self.statusText = response.responseMessage || "";
					self.responseText = body;
					self.responseXML = null;
					
					if ( self.responseText.match(/^\s*</) ) {
						try {
							self.responseXML = new DOMDocument(body);
						} catch(e) {}
						self.onreadystatechange = function(){
							curLocation = url;
							window.document = self.responseXML;
							var event = window.document.createEvent();
							event.initEvent("load");
							window.dispatchEvent( event );
						};
						self.onreadystatechange();
					}
				}
				
			}

			if (this.async) {
			  makeRequest();
		  } else {
		    throw "No support for synchronous ajax!";
	    }
		},
		abort: function(){},
		onreadystatechange: function(){},
		getResponseHeader: function(header){
			if (this.readyState < 3)
				throw new Error("INVALID_STATE_ERR");
			else {
				var returnedHeaders = [];
				for (var rHeader in this.responseHeaders) {
					if (rHeader.match(new Regexp(header, "i")))
						returnedHeaders.push(this.responseHeaders[rHeader]);
				}
			
				if (returnedHeaders.length)
					return returnedHeaders.join(", ");
			}
			
			return null;
		},
		getAllResponseHeaders: function(header){
			if (this.readyState < 3)
				throw new Error("INVALID_STATE_ERR");
			else {
				var returnedHeaders = [];
				
				for (var header in this.responseHeaders)
					returnedHeaders.push( header + ": " + this.responseHeaders[header] );
				
				return returnedHeaders.join("\r\n");
			}
		},
		async: true,
		readyState: 0,
		responseText: "",
		status: 0
	};
	
	exports.DOMDocument = DOMDocument;
	exports.window = window;
	
})();