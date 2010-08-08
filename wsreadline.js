var readline = require('readline');

module.exports = readline;

readline.Interface.prototype.cursorToEnd = function() {
    // place the cursor at the end of the current line
    this.output.write(
        '\x1b[0G\x1b[' + (
        this._promptLength + this.line.length
        ) + 'C'
    );
    this.cursor = this.line.length;
}
