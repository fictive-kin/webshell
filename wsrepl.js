var repl = require('repl');

module.exports = repl;

repl.REPLServer.prototype.suppressPrompt = false;
repl.REPLServer.prototype.displayPrompt = function (reset) {
  if (reset) {
    this.suppressPrompt--;
  }
  if (this.suppressPrompt <= 0) {
    this.rli.setPrompt(this.buffered_cmd.length ? '...   ' : this.prompt);
    this.rli.prompt();
  }
};

