var readline = require('readline');
var sys = require('sys');
var exec = require('child_process').exec;
var fs = require('fs');
var _ = require('underscore')._;

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

    case 13:    /* enter */
      this._prevLineParams = null; // reset prevLineParams
      // write the rest of the current line (this ensures that the cursor is at
      // the end of the current command)
      this.output.write(this.line.slice(this.cursor));
      // no return; pass through to normal "enter" handler
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

readline.Interface.prototype._getCols = function (callback) {
  // note: unixy
  // TODO: find a better way to get the current width
  var that = this;
  exec('/usr/bin/env tput cols', function(error, stdout, stderr) {
    if (error) {
      // can't use tput; assume cols = 80
      var cols = 80;
    } else {
      var cols = stdout.replace(/\s*$/, ""); // trim
    }
    var lineLen = that.line.length + that._promptLength;
    var rows = Math.floor(lineLen / cols);
    var cursorPos = (that._promptLength + that.cursor) % cols;
    var cursorRow = Math.floor((that.cursor + that._promptLength) / cols);
    var cursorDiff = rows - cursorRow;

    var lineParams = {
      rows: rows,
      cursorPos: cursorPos,
      cursorRow: cursorRow,
      cursorDiff: cursorDiff
    };

    callback(lineParams);
  });
};

readline.Interface.prototype._prevLineParams = null;

readline.Interface.prototype._refreshLine  = function () {
  if (this._closed) return;

  stdio.setRawMode(true);

  var that = this;

  this._getCols(function(lineParams) {
    // Cursor to left edge.
    that.output.write('\x1b[0G');

    // Erase to the right
    that.output.write('\x1b[0K');

    // if we have a previous line, then clear what was written
    if (null !== that._prevLineParams) {

      // delete any additional lines in the terminal
      that.output.write('\x1b[' + that._prevLineParams.cursorDiff + 'M');

      // up one row, cursor to left, clear to right
      for (var i=0; i < that._prevLineParams.cursorRow; i++) {
        that.output.write('\x1b[1A\x1b[0G\x1b[0K');
      }
    }
    // store previous line params
    that._prevLineParams = _.clone(lineParams);

    // Write the prompt and the current buffer content.
    that.output.write(that._prompt);
    that.output.write(that.line);

    // Erase to right.
    that.output.write('\x1b[0K');

    // Move cursor to original position.
    if (lineParams.rows > 0 && lineParams.cursorDiff > 0) {
      // cursor up {cursorDiff} lines
      that.output.write('\x1b[' + lineParams.cursorDiff + 'A');
    }

    that.output.write('\x1b[0G\x1b[' + lineParams.cursorPos + 'C');
  });
};

// vim: ts=2 sw=2 et
