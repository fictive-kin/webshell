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

readline.Interface.prototype.completeHistory = function(chop) {
  // chop is useful for removing the "complete" character from the input
  // e.g., if the user presses "tab" then we want to chop off the tab
  if (chop) {
    var line = this.line.substring(0, this.line.length -1);
  } else {
    var line = this.line;
  }

  var matches = [];

  // find all matching history items (but avoid duplicates)
  this.history.map(function (val) {
    if (val.substring(0, line.length) == line
      && matches.indexOf(val) == -1) {
      matches.push(val);
    }
  });

  if (matches.length > 1) {
    // more than one match, print matching lines
    sys.puts("\r");
    matches.map(function (val) {
      sys.puts(val + "\r");
    });
    // populate the line with as much of the matches as we can
    // (the common part)
    var common = matches[0];
    matches.map(function(v) {
      for (var i=0; i<common.length; i++) {
        if (v.charAt(i) != common.charAt(i)) {
          common = common.substring(0, i);
          return;
        }
      }
    });
    this.line = common;
    this.prompt();
    this.cursorToEnd();
    return false; // did not complete, but matches found
  } else if (matches.length == 1) {
    // exactly one match, so fill the line
    this.line = matches[0];
    this.prompt();
    this.cursorToEnd();
    return true; // completed
  }

  // if we haven't returned yet, that means that there are no matches
  return null;
}
