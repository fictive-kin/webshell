(function(){

  var colors = {
        black: 30,
        red: 31,
        green: 32,
        yellow: 33,
        blue: 34,
        magenta: 35,
        cyan: 36,
        white: 37
      },
      extras = {
        reset: 0,
        bold: 1,
        underline: 4,
        reversed: 7
      };

  function esc(str) {
    return "\x1B["+str+'m';
  }

  function defineColoredFn(name, code) {
    if(process && process.isTTY && !process.isTTY()) {
      exports[name] = function(str) {
        return (str || this)
      }
    } else {
      exports[name] = function(str) {
        return esc(code) + (str || this) + esc(extras.reset);
      }
    }
  }

  for(var name in colors) {
    defineColoredFn(name, colors[name]);
  };

  for(var name in extras) {
    defineColoredFn(name, extras[name])
  };

})();
