var readline = require('readline');
var sys = require('sys');
var exec = require('child_process').exec;
var fs = require('fs');

var stdio = process.binding('stdio');

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

readline.Interface.prototype.completeHistory = function() {
  return this.complete(this.history);
}

readline.Interface.prototype.complete = function(input) {

  var line = this.line;
  var matches = [];

  // find all matching items (but avoid duplicates)
  input.map(function (val) {
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

readline.Interface.prototype.outputWrite = function (msg) {
  this.output.write(msg);
};

readline.Interface.prototype.node_ttyWrite = readline.Interface.prototype._ttyWrite;

readline.Interface.prototype._ttyWrite = function (b) {
  this._hardClosed = false;
  switch (b[0]) {

    case 3: // control-c
      this.output.write("^C");
      this._hardClosed = true;
      break;

    case 4: // control-d, delete right or EOF
      if (this.cursor === 0 && this.line.length === 0) { // only at start
        this.output.write("^D\r\n");
      }
      break;

    case 12: // CTRL-L
      // clear screen
      this.output.write('\x1b[2J');
      this.output.write('\x1b[0;0H');
      this._refreshLine();
      return;
      break;

    case 13: // enter
      this._prevLineParams = null; // reset prevLineParams
      // write the rest of the current line (this ensures that the cursor is at
      // the end of the current command)
      this.output.write(this.line.slice(this.cursor));
      // no return; pass through to normal "enter" handler
      break;

    case 27: // escape sequence
      if (b[1] === 91 && b[2] === 67) { // right arrow
        if (this.cursor != this.line.length) {
          this.cursor++;
          var cols = getColumns();
          // if we're at the first character of a new line:
          if (((this.cursor + this._promptLength) % cols) == 0) {
            // cursor to the left, down one line
            this.output.write('\x1b[0G\x1b[1B');
          } else {
            // otherwise, just move the cursor one char to the right
            this.output.write('\x1b[0C');
          }
          this._renegotiatePrevLineParams();
        }
        return;
      } else if (b[1] === 91 && b[2] === 68) { // left arrow
        if (this.cursor > 0) {
          this.cursor--;
          this.output.write('\x1b[0D');
          this._renegotiatePrevLineParams();
        }
        return;
      }
      break;

  }
  // unhandled, so let the original method handle it
  this.node_ttyWrite(b);
}

// overloading the _addHistory method to up the history size to 1000
var kHistorySize = 1000;
readline.Interface.prototype._addHistory = function () {
  if (this.line.length === 0) return "";

  this.history.unshift(this.line);
  this.line = "";
  this.historyIndex = -1;

  this.cursor = 0;

  // Only store so many
  if (this.history.length > kHistorySize) this.history.pop();

  return this.history[0];
};

readline.Interface.prototype._renegotiatePrevLineParams = function () {
  if (this._prevLineParams) {
    var cols = stdio.getColumns();
    this._prevLineParams.cursorPos = (this._promptLength + this.cursor) % cols;
    this._prevLineParams.cursorRow = Math.floor((this._promptLength + this.cursor) / cols);
  }
};

readline.Interface.prototype._prevLineParams = null;
readline.Interface.prototype._refreshLine  = function () {
  if (this._closed) return;

  stdio.setRawMode(true);

  var cols = stdio.getColumns();
  var lineLen = this.line.length + this._promptLength;
  var rows = Math.floor(lineLen / cols);
  var cursorPos = (this._promptLength + this.cursor) % cols;
  var cursorRow = Math.floor((this.cursor + this._promptLength) / cols);
  var cursorDiff = rows - cursorRow;

  // Cursor to left edge.
  this.output.write('\x1b[0G');

  // Erase to the right
  this.output.write('\x1b[0K');

  // if we have a previous line, then clear what was written
  if (null !== this._prevLineParams) {

    // delete any additional lines in the terminal
    this.output.write('\x1b[' + this._prevLineParams.cursorDiff + 'M');

    // up one row, cursor to left, clear to right
    for (var i=0; i < this._prevLineParams.cursorRow; i++) {
      this.output.write('\x1b[1A\x1b[0G\x1b[0K');
    }
  }
  // store previous line params
  this._prevLineParams = {
    rows: rows,
    cursorPos: cursorPos,
    cursorRow: cursorRow,
    cursorDiff: cursorDiff
  };

  // Write the prompt and the current buffer content.
  this.output.write(this._prompt);
  this.output.write(this.line);

  // Erase to right.
  this.output.write('\x1b[0K');

  // Move cursor to original position.
  if (rows > 0 && cursorDiff > 0) {
    // cursor up {cursorDiff} lines
    this.output.write('\x1b[' + cursorDiff + 'A');
  }

  this.output.write('\x1b[0G\x1b[' + cursorPos + 'C');
};

// vim: ts=2 sw=2 et
