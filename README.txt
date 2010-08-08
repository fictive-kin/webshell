Webshell: A console-based, JavaScripty HTTP client utility.

Includes tab completion, history, context persistence and cookies.

This is best demonstrated:

sarcasm:~/src/webshell$ node shell.js 
webshell> GET http://google.com/
HTTP 301 http://google.com/
webshell> $_.headers
{ location: 'http://www.google.com/'
, 'content-type': 'text/html; charset=UTF-8'
, date: 'Sun, 08 Aug 2010 22:38:23 GMT'
, expires: 'Tue, 07 Sep 2010 22:38:23 GMT'
, 'cache-control': 'public, max-age=2592000'
, server: 'gws'
, 'content-length': '219'
, 'x-xss-protection': '1; mode=block'
, connection: 'close'
}
webshell> $_.headers.location
'http://www.google.com/'
webshell> $_.follow()
HTTP 302 http://www.google.com/
webshell> $_.headers.location
'http://www.google.ca/'
webshell> $_.follow()
HTTP 200 http://www.google.ca/
webshell> $_.raw.substring(0, 50)
'<!doctype html><html><head><meta http-equiv="conte'
webshell> ^D

sarcasm:~/src/webshell$ node shell.js
webshell> GET http://twitter.com/users/coates.json
HTTP 200 http://twitter.com/users/coates.json
webshell> $_.json.name
'Sean Coates'
webshell> ^D

sarcasm:~/src/webshell$ node shell.js
webshell> $_.json // empty
webshell> $_.loadContext("twitter-coates") // pick up where we left off
Loaded context: twitter-coates
webshell> $_.json.name
'Sean Coates'

sarcasm:~/src/webshell$ node shell.js
webshell> GET http://coates:notmypassword@twitter.com/users/coates.json
HTTP 401 http://coates:notmypassword@twitter.com/users/coates.json
webshell> ^D

sarcasm:~/src/webshell$ node shell.js 
webshell> GET http://files.seancoates.com/cookiecounter.php
HTTP 200 http://files.seancoates.com/cookiecounter.php
webshell> $_.raw
'You have visited this page 1 times.'
webshell> GET http://files.seancoates.com/cookiecounter.php
HTTP 200 http://files.seancoates.com/cookiecounter.php
webshell> $_.raw
'You have visited this page 2 times.'
webshell> GET http://files.seancoates.com/cookiecounter.php
HTTP 200 http://files.seancoates.com/cookiecounter.php
webshell> GET http://files.seancoates.com/cookiecounter.php
HTTP 200 http://files.seancoates.com/cookiecounter.php
webshell> GET http://files.seancoates.com/cookiecounter.php
HTTP 200 http://files.seancoates.com/cookiecounter.php
webshell> $_.raw
'You have visited this page 5 times.'
webshell> $_.saveContext("cookiedemo")
Saved context: cookiedemo
webshell> GET http://files.seancoates.com/cookiecounter.php
HTTP 200 http://files.seancoates.com/cookiecounter.php
webshell> $_.raw
'You have visited this page 6 times.'
webshell> $_.loadContext("cookiedemo")
Loaded context: cookiedemo
webshell> $_.raw
'You have visited this page 5 times.'
webshell> GET http://files.seancoates.com/cookiecounter.php
HTTP 200 http://files.seancoates.com/cookiecounter.php
webshell> $_.raw
'You have visited this page 6 times.'
webshell> $_.cookies.get("files.seancoates.com")
{ cookiecounter: 
   { http_only: false
   , key: 'cookiecounter'
   , value: '6'
   , expires: Sun, 15 Aug 2010 23:11:33 GMT
   , path: '/'
   , domain: 'files.seancoates.com'
   }
}
webshell> ^D

sarcasm:~/src/webshell$ node shell.js 
webshell> $_.loadContext("cookiedemo")
Loaded context: cookiedemo
webshell> $_.cookies.get("files.seancoates.com").cookiecounter.value
'5'
webshell> GET http://files.seancoates.com/cookiecounter.php
HTTP 200 http://files.seancoates.com/cookiecounter.php
webshell> $_.cookies.get("files.seancoates.com").cookiecounter.value
'6'
webshell> ^D

