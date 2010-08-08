var readline = require('readline');
var sys = require('sys');

module.exports = readline;

readline.Interface.prototype.cursorToEnd = function() {
  // place the cursor at the end of the current line
  this.output.write(
    '\x1b[0G\x1b['
    + (this._promptLength + this.line.length)
    + 'C'
  );
  this.cursor = this.line.length;
}

var inArray = function(value, array) {
  for (var i = 0, l = array.length; i < l; i++) {
    if (array[i] === value) {
      return true;
    }
  }
  return false;
};

readline.Interface.prototype.complete = function(chop) {
  if (chop) {
    var line = this.line.substring(0, this.line.length -1);
  } else {
    var line = this.line;
  }
  var matches = [];
  this.history.map(function (val) {
    if (val.substring(0, line.length) == line
      && matches.indexOf(val) == -1) {
      matches.push(val);
    }
  });
  if (matches.length > 1) {
    sys.puts("\r");
    matches.map(function (val) {
      sys.puts(val + "\r");
    });
    this.line = line;
    this.prompt();
    this.cursorToEnd();
    return false; // did not complete, but matches found
  } else if (matches.length == 1) {
    this.line = matches[0];
    this.prompt();
    this.cursorToEnd();
    return true; // completed
  }
  // if we haven't returned yet, that means that there are no matches
  return null;
}
