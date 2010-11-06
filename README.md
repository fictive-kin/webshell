Webshell: A console-based, JavaScripty HTTP client utility
==========================================================
by Evan Haas and Sean Coates
----------------------------

Includes tab completion, history, context persistence, cookies and other
tasty morsels.

(NOTE: a recent version of Node.js (>=0.1.104) is required (for improved
readline-like behaviour).)

Simple HTTP requests
--------------------
Webshell supports all of the HTTP verbs in a simple to use syntax. The
response's status code (and the requested URL) are printed. Headers are
are expanded to local variables, and they can be inspected. Additionally,
if the response suggests a redirect to anotehr URL, the `$_.follow()` function
can be called for easy location following.

    http://localhost > GET http://google.com/
    HTTP 301 http://google.com/
    http://google.com > $_.headers
    { location: 'http://www.google.com/'
    , 'content-type': 'text/html; charset=UTF-8'
    , date: 'Sat, 06 Nov 2010 17:38:56 GMT'
    , expires: 'Mon, 06 Dec 2010 17:38:56 GMT'
    , 'cache-control': 'public, max-age=2592000'
    , server: 'gws'
    , 'content-length': '219'
    , 'x-xss-protection': '1; mode=block'
    , connection: 'close'
    }
    http://google.com > $_.headers.location
    'http://www.google.com/'
    http://google.com > $_.follow()
    HTTP 302 http://www.google.com/
    http://www.google.com > $_.headers.location
    'http://www.google.ca/'
    http://www.google.com > $_.follow()
    HTTP 200 http://www.google.ca/
    http://www.google.ca > $_.raw.substring(0, 50)
    '<!doctype html><html><head><meta http-equiv="conte'

Relative URLs
-------------
URLs can be retrieved relatively by simply omitting the scheme (e.g. `http://`)
and the hostname. The previous scheme and hostname (and auth credentials if
applicable) are displayed in the prompt.

    http://localhost > GET http://files.seancoates.com/testjson.php
    HTTP 404 http://files.seancoates.com/testjson.php
    http://files.seancoates.com > // oops
    http://files.seancoates.com > GET /test_json.php
    HTTP 200 http://files.seancoates.com/test_json.php
    http://files.seancoates.com > $_.json
    { one: 1, two: 2, three: 3 }


Store HTTP response
-------------------
The results of HTTP verb commands can be stored in local variables, just like
everything in the REPL.

    http://localhost > result = $_.get('http://fictivekin.com')
    GET http://fictivekin.com
    HTTP 200 http://fictivekin.com/
    http://www.google.com > result2 = $_.get('http://www.google.ca')
    GET http://www.google.ca
    HTTP 200 http://www.google.ca/
    http://www.google.ca > result.headers['content-type']
    'text/html'
    http://www.google.ca > result2.headers['content-type']
    'text/html; charset=ISO-8859-1'

JSON processing
---------------
If the server returns a JSON content-type, the response is automatically
processed, and the result is stored in `$_.json`.

    http://localhost > GET http://twitter.com/users/coates.json
    HTTP 200 http://twitter.com/users/coates.json
    http://twitter.com > $_.json.name
    'Sean Coates'

Print response
--------------------
The JSON response can optionally be automatically printed by setting
`$_.printResponse`. If $_.printResponse is a function, it will be called with
a single argument: the response object.  It should return true or false,
depending on whether the response should be printed. If $_.printResponse is
not a function, its truth value will determine whether responses are printed.
By default $_.printResponse is a function which returns true for JSON
content-type responses and false for others.

    http://localhost > GET http://files.seancoates.com/test_json.php
    HTTP 200 http://files.seancoates.com/test_json.php
    http://files.seancoates.com > $_.json
    { one: 1, two: 2, three: 3 }
    http://files.seancoates.com > $_.json.three
    3
    http://files.seancoates.com > $_.printResponse = true
    true
    http://files.seancoates.com > GET http://files.seancoates.com/test_json.php
    HTTP 200 http://files.seancoates.com/test_json.php
    { one: 1, two: 2, three: 3 }

Save and load contexts
----------------------
Contexts (including the previous request, arbitrary variables, and even
toolbox functions) can be arbitrarily stored and loaded. Contexts persist
between sessions; the `_previous` context is automatically loaded at the
start of a session and stored when a session is closed.

    sarcasm:~/src/webshell (master)$ node shell.js 
    Loaded context: _previous
    http://localhost > GET http://twitter.com/users/coates.json
    HTTP 200 http://twitter.com/users/coates.json
    http://twitter.com > $_.saveContext("twitter-coates")
    Saved context: twitter-coates
    http://twitter.com > ^D
    Saved context: _previous

    sarcasm:~/src/webshell (master)$ node shell.js 
    Loaded context: _previous
    http://twitter.com > GET http://localhost
    HTTP 200 http://localhost/
    http://localhost > $_.json //empty
    http://localhost > $_.loadContext("twitter-coates")
    Loaded context: twitter-coates
    http://twitter.com > $_.json.name
    'Sean Coates'

HTTP auth
---------
Webshell understands the `user:pass@` syntax in URLs for Basic authentication.
Auth will even persist between requests if the hostname doesn't change.

    http://twitter.com > GET http://coates:notmypassword@twitter.com/users/coates.json
    HTTP 401 http://coates:***@twitter.com/users/coates.json

    http://coates:***@twitter.com > GET http://coates:myrealpassword@twitter.com/users/coates.json
    HTTP 200 http://coates:***@twitter.com/users/coates.json
    http://coates:***@twitter.com > GET http://twitter.com/statuses/replies.json
    HTTP 200 http://coates:***@twitter.com/statuses/replies.json
    http://coates:***@twitter.com > $_.json[0].in_reply_to_screen_name
    'coates'

Cookies
-------
Webshell will keep track of cookies for you (unless `$_.useCookies` is set to
false).

    http://localhost > GET http://files.seancoates.com/cookiecounter.php
    HTTP 200 http://files.seancoates.com/cookiecounter.php
    http://files.seancoates.com > $_.raw
    'You have visited this page 1 times.'
    http://files.seancoates.com > GET http://files.seancoates.com/cookiecounter.php
    HTTP 200 http://files.seancoates.com/cookiecounter.php
    http://files.seancoates.com > $_.raw
    'You have visited this page 2 times.'
    http://files.seancoates.com > GET http://files.seancoates.com/cookiecounter.php
    HTTP 200 http://files.seancoates.com/cookiecounter.php
    http://files.seancoates.com > GET http://files.seancoates.com/cookiecounter.php
    HTTP 200 http://files.seancoates.com/cookiecounter.php
    http://files.seancoates.com > GET http://files.seancoates.com/cookiecounter.php
    HTTP 200 http://files.seancoates.com/cookiecounter.php
    http://files.seancoates.com > $_.raw
    'You have visited this page 5 times.'
    http://files.seancoates.com > $_.saveContext('cookie-demo')
    Saved context: cookie-demo
    http://files.seancoates.com > GET http://files.seancoates.com/cookiecounter.php
    HTTP 200 http://files.seancoates.com/cookiecounter.php
    http://files.seancoates.com > $_.raw
    'You have visited this page 6 times.'
    http://files.seancoates.com > $_.loadContext('cookie-demo')
    Loaded context: cookie-demo
    http://files.seancoates.com > $_.raw
    'You have visited this page 5 times.'
    http://files.seancoates.com > GET http://files.seancoates.com/cookiecounter.php
    HTTP 200 http://files.seancoates.com/cookiecounter.php
    http://files.seancoates.com > $_.raw
    'You have visited this page 6 times.'
    http://files.seancoates.com > $_.cookies.get("files.seancoates.com")
    { cookiecounter: 
      { http_only: false
      , key: 'cookiecounter'
      , value: '6'
      , expires: Sat, 13 Nov 2010 20:56:04 GMT
      , path: '/'
      , domain: 'files.seancoates.com'
      }
    }
    http://files.seancoates.com >

    http://localhost > $_.loadContext("cookie-demo")
    Loaded context: cookie-demo
    http://files.seancoates.com > $_.cookies.get("files.seancoates.com").cookiecounter.value
    '5'
    http://files.seancoates.com > GET http://files.seancoates.com/cookiecounter.php
    HTTP 200 http://files.seancoates.com/cookiecounter.php
    http://files.seancoates.com > $_.cookies.get("files.seancoates.com").cookiecounter.value
    '6'

HTTP verbs
----------
All of the HTTP verbs are available. To include data in the request body, set
`$_.requestData`, as shown below.

    http://localhost > GET http://localhost/json.php?one=1&two=2
    HTTP 200 http://localhost/json.php
    http://localhost > $_.json.get
    { one: '1', two: '2' }
    http://localhost > $_.json.server.REQUEST_METHOD
    'GET'
    http://localhost > $_.requestData = {three:3, four:4}
    { three: 3, four: 4 }
    http://localhost > POST http://localhost/json.php?one=1&two=2
    HTTP 200 http://localhost/json.php
    http://localhost > $_.json.post
    { three: '3', four: '4' }
    http://localhost > $_.json.get
    { one: '1', two: '2' }
    http://localhost > $_.json.server.REQUEST_METHOD
    'POST'
    http://localhost > $_.requestData = "five=5&six=6"
    'five=5&six=6'
    http://localhost > POST http://localhost/json.php?one=1&two=2
    HTTP 200 http://localhost/json.php
    http://localhost > $_.json.post
    { five: '5', six: '6' }

    sarcasm:~/src/webshell (master)$ echo "testing some PUT data" > ~/test.txt
    sarcasm:~/src/webshell (master)$ node shell.js
    Loaded context: _previous
    http://localhost > $_.fileToRequestData('/Users/sean/test.txt')
    Set requestData to '/Users/sean/test.txt' (22 bytes, utf8)
    http://localhost > PUT http://localhost/json.php
    HTTP 200 http://localhost/json.php
    http://localhost > $_.json.server.REQUEST_METHOD
    'PUT'
    http://localhost > $_.json.input
    'testing some PUT data\n'
    http://localhost > 

HTTP headers
------------
You can inspect request and response headers, easily.

    http://localhost > GET http://localhost
    HTTP 200 http://localhost/
    http://localhost > $_.requestHeaders
    { host: 'localhost'
    , 'user-agent': 'Webshell/0.1-dev node.js/v0.2.1'
    , accept: 'application/json, */*'
    , 'content-type': 'application/x-www-form-urlencoded'
    }
    http://localhost > $_.headers
    { date: 'Sat, 06 Nov 2010 21:14:02 GMT'
    , server: 'Apache/2.2.15 (Unix) PHP/5.3.3-dev mod_ssl/2.2.15 OpenSSL/0.9.8l'
    , 'content-length': '3617'
    , connection: 'close'
    , 'content-type': 'text/html;charset=ISO-8859-1'
    }

You can also arbitrarily set request headers.

    http://localhost > GET http://localhost:5984/
    HTTP 200 http://localhost:5984/
    http://localhost:5984 > $_.json
    { couchdb: 'Welcome', version: '1.0.1' }
    http://localhost:5984 > $_.json.version
    '1.0.1'
    http://localhost:5984 > $_.headers['content-type']
    'application/json'
    http://localhost:5984 > $_.requestHeaders.accept
    'application/json, */*'

    http://localhost:5984 > $_.requestHeaders.accept = '*/*' // not json explicitly
    '*/*'
    http://localhost:5984 > GET http://localhost:5984/
    HTTP 200 http://localhost:5984/
    http://localhost:5984 > $_.headers['content-type']
    'text/plain;charset=utf-8'
    http://localhost:5984 > $_.json
    http://localhost:5984 > // no JSON )-:

