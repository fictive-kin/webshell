var repl = require('repl');

module.exports = repl;

repl.REPLServer.prototype.suppressPrompt = false;
repl.REPLServer.prototype.displayPrompt = function (reset) {
  if (reset) {
    this.suppressPrompt = false;
  }
  if (!this.suppressPrompt) {
    this.rli.setPrompt(this.buffered_cmd.length ? '...   ' : this.prompt);
    this.rli.prompt();
  }
};

