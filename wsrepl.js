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

var Script = process.binding('evals').Script;
var evalcx = Script.runInContext;

// NOTE: .complete can be dumped if/when this is pulled to ryah/node:
// http://github.com/scoates/node/commit/44e8ebeee95600d571e3d316db8df1147c4da828

/**
 * Provide a list of completions for the given leading text. This is
 * given to the readline interface for handling tab completion.
 *
 * @param {line} The text (preceding the cursor) to complete
 * @returns {Array} Two elements: (1) an array of completions; and
 *    (2) the leading text completed.
 *
 * Example:
 *  complete('var foo = sys.')
 *    -> [['sys.print', 'sys.debug', 'sys.log', 'sys.inspect', 'sys.pump'],
 *        'sys.' ]
 *
 * Warning: This eval's code like "foo.bar.baz", so it will run property
 * getter code.
 */
repl.REPLServer.prototype.complete = function (line) {
  var completions,
      completionGroups = [],  // list of completion lists, one for each inheritance "level"
      completeOn,
      match, filter, i, j, group, c;

  // REPL commands (e.g. ".break").
  var match = null;
  match = line.match(/^\s*(\.\w*)$/);
  if (match) {
    completionGroups.push(['.break', '.clear', '.exit', '.help']);
    completeOn = match[1];
    if (match[1].length > 1) {
      filter = match[1];
    }
  }

  // require('...<Tab>')
  else if (match = line.match(/\brequire\s*\(['"](([\w\.\/-]+\/)?([\w\.\/-]*))/)) {
    //TODO: suggest require.exts be exposed to be introspec registered extensions?
    //TODO: suggest include the '.' in exts in internal repr: parity with `path.extname`.
    var exts = [".js", ".node"];
  var indexRe = new RegExp('^index(' + exts.map(regexpEscape).join('|') + ')$');

  completeOn = match[1];
  var subdir = match[2] || "";
  var filter = match[1];
  var dir, files, f, name, base, ext, abs, subfiles, s;
  group = [];
  for (i = 0; i < require.paths.length; i++) {
    dir = require.paths[i];
    if (subdir && subdir[0] === '/') {
      dir = subdir;
    } else if (subdir) {
      dir = path.join(dir, subdir);
    }
    try {
      files = fs.readdirSync(dir);
    } catch (e) {
      continue;
    }
    for (f = 0; f < files.length; f++) {
      name = files[f];
      ext = path.extname(name);
      base = name.slice(0, -ext.length);
      if (base.match(/-\d+\.\d+(\.\d+)?/) || name === ".npm") {
        // Exclude versioned names that 'npm' installs.
        continue;
      }
      if (exts.indexOf(ext) !== -1) {
        if (!subdir || base !== "index") {
          group.push(subdir + base);
        }
      } else {
        abs = path.join(dir, name);
        try {
          if (fs.statSync(abs).isDirectory()) {
            group.push(subdir + name + '/');
            subfiles = fs.readdirSync(abs);
            for (s = 0; s < subfiles.length; s++) {
              if (indexRe.test(subfiles[s])) {
                group.push(subdir + name);
              }
            }
          }
        } catch(e) {}
      }
    }
  }
  if (group.length) {
    completionGroups.push(group);
  }

  if (!subdir) {
    // Kind of lame that this needs to be updated manually.
    // Intentionally excluding moved modules: posix, utils.
    var builtinLibs = ['assert', 'buffer', 'child_process', 'crypto', 'dgram',
        'dns', 'events', 'file', 'freelist', 'fs', 'http', 'net', 'path',
        'querystring', 'readline', 'repl', 'string_decoder', 'sys', 'tcp', 'url'];
    completionGroups.push(builtinLibs);
  }
}

// Handle variable member lookup.
// We support simple chained expressions like the following (no function
// calls, etc.). That is for simplicity and also because we *eval* that
// leading expression so for safety (see WARNING above) don't want to
// eval function calls.
//
//   foo.bar<|>     # completions for 'foo' with filter 'bar'
//   spam.eggs.<|>  # completions for 'spam.eggs' with filter ''
//   foo<|>         # all scope vars with filter 'foo'
//   foo.<|>        # completions for 'foo' with filter ''
else if (line.length === 0 || line[line.length-1].match(/\w|\.|\$/)) {
  var simpleExpressionPat = /(([a-zA-Z_$](?:\w|\$)*)\.)*([a-zA-Z_$](?:\w|\$)*)\.?$/;
  match = simpleExpressionPat.exec(line);
  if (line.length === 0 || match) {
    var expr;
    completeOn = (match ? match[0] : "");
    if (line.length === 0) {
      filter = "";
      expr = "";
    } else if (line[line.length-1] === '.') {
      filter = "";
      expr = match[0].slice(0, match[0].length-1);
    } else {
      var bits = match[0].split('.');
      filter = bits.pop();
      expr = bits.join('.');
    }
    //console.log("expression completion: completeOn='"+completeOn+"' expr='"+expr+"'");

    // Resolve expr and get its completions.
    var obj, memberGroups = [];
    if (!expr) {
      completionGroups.push(Object.getOwnPropertyNames(this.context));
      // Global object properties
      // (http://www.ecma-international.org/publications/standards/Ecma-262.htm)
      completionGroups.push(["NaN", "Infinity", "undefined",
          "eval", "parseInt", "parseFloat", "isNaN", "isFinite", "decodeURI",
          "decodeURIComponent", "encodeURI", "encodeURIComponent",
          "Object", "Function", "Array", "String", "Boolean", "Number",
          "Date", "RegExp", "Error", "EvalError", "RangeError",
          "ReferenceError", "SyntaxError", "TypeError", "URIError",
          "Math", "JSON"]);
      // Common keywords. Exclude for completion on the empty string, b/c
      // they just get in the way.
      if (filter) {
        completionGroups.push(["break", "case", "catch", "const",
            "continue", "debugger", "default", "delete", "do", "else", "export",
            "false", "finally", "for", "function", "if", "import", "in",
            "instanceof", "let", "new", "null", "return", "switch", "this",
            "throw", "true", "try", "typeof", "undefined", "var", "void",
            "while", "with", "yield"]);
      }
    } else {
      try {
        obj = evalcx(expr, this.context, "repl");
      } catch (e) {
        //console.log("completion eval error, expr='"+expr+"': "+e);
      }
      if (obj != null) {
        if (typeof obj === "object" || typeof obj === "function") {
          memberGroups.push(Object.getOwnPropertyNames(obj));
        }
        // works for non-objects
        var p = obj.constructor ? obj.constructor.prototype : null;
        try {
          var sentinel = 5;
          while (p !== null) {
            memberGroups.push(Object.getOwnPropertyNames(p));
            p = Object.getPrototypeOf(p);
            // Circular refs possible? Let's guard against that.
            sentinel--;
            if (sentinel <= 0) {
              break;
            }
          }
        } catch (e) {
          //console.log("completion error walking prototype chain:" + e);
        }
      }

      if (memberGroups.length) {
        for (i = 0; i < memberGroups.length; i++) {
          completionGroups.push(memberGroups[i].map(function(member) {
            return expr + '.' + member;
          }));
        }
        if (filter) {
          filter = expr + '.' + filter;
        }
      }
    }
  }
}

// Filter, sort (within each group), uniq and merge the completion groups.
if (completionGroups.length && filter) {
  var newCompletionGroups = [];
  for (i = 0; i < completionGroups.length; i++) {
    group = completionGroups[i].filter(function(elem) {
      return elem.indexOf(filter) == 0;
    });
    if (group.length) {
      newCompletionGroups.push(group);
    }
  }
  completionGroups = newCompletionGroups;
}
if (completionGroups.length) {
  var uniq = {};  // unique completions across all groups
  completions = [];
  // Completion group 0 is the "closest" (least far up the inheritance chain)
  // so we put its completions last: to be closest in the REPL.
  for (i = completionGroups.length - 1; i >= 0; i--) {
    group = completionGroups[i];
    group.sort();
    for (var j = 0; j < group.length; j++) {
      c = group[j];
      if (!uniq.hasOwnProperty(c)) {
        completions.push(c);
        uniq[c] = true;
      }
    }
    completions.push(""); // separator btwn groups
  }
  while (completions.length && completions[completions.length-1] === "") {
    completions.pop();
  }
}

return [completions || [], completeOn];
};
