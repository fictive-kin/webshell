exports.isArray = function(obj) {
  return toString.call(obj) === "[object Array]";
};

exports.isFunction = function(obj) {
  return toString.call(obj) === "[object Function]";
};

exports.isPlainObject = function( obj ) {
  // Must be an Object.
  // Because of IE, we also have to check the presence of the constructor property.
  // Make sure that DOM nodes and window objects don't pass through, as well
  if ( !obj || toString.call(obj) !== "[object Object]" || obj.nodeType || obj.setInterval ) {
    return false;
  }
  
  // Not own constructor property must be Object
  if ( obj.constructor
    && !hasOwnProperty.call(obj, "constructor")
    && !hasOwnProperty.call(obj.constructor.prototype, "isPrototypeOf") ) {
    return false;
  }
  
  // Own properties are enumerated firstly, so to speed up,
  // if last one is own, then all properties are own.

  var key;
  for ( key in obj ) {}
  
  return key === undefined || hasOwnProperty.call( obj, key );
};

exports.isEmptyObject = function( obj ) {
  for ( var name in obj ) {
    return false;
  }
  return true;
};


exports.extend = function() {
  // copy reference to target object
  var target = arguments[0] || {}, i = 1, length = arguments.length, deep = false, options, name, src, copy;

  // Handle a deep copy situation
  if ( typeof target === "boolean" ) {
    deep = target;
    target = arguments[1] || {};
    // skip the boolean and the target
    i = 2;
  }

  // Handle case when target is a string or something (possible in deep copy)
  if ( typeof target !== "object" && !this.isFunction(target) ) {
    target = {};
  }

  // extend jQuery itself if only one argument is passed
  if ( length === i ) {
    target = this;
    --i;
  }

  for ( ; i < length; i++ ) {
    // Only deal with non-null/undefined values
    if ( (options = arguments[ i ]) != null ) {
      // Extend the base object
      for ( name in options ) {
        src = target[ name ];
        copy = options[ name ];

        // Prevent never-ending loop
        if ( target === copy ) {
          continue;
        }

        // Recurse if we're merging object literal values or arrays
        if ( deep && copy && ( this.isPlainObject(copy) || this.isArray(copy) ) ) {
          var clone = src && ( this.isPlainObject(src) || this.isArray(src) ) ? src
            : this.isArray(copy) ? [] : {};

          // Never move original objects, clone them
          target[ name ] = this.extend( deep, clone, copy );

        // Don't bring in undefined values
        } else if ( copy !== undefined ) {
          target[ name ] = copy;
        }
      }
    }
  }

  // Return the modified object
  return target;
};


exports.inArray = function(value, array) {
  for (var i = 0, l = array.length; i < l; i++) {
    if (array[i] === value) {
      return true;
    }
  }
  return false;
};

exports.map = function(obj, fn) {
  if (this.isArray(obj)) {
    var newArray = [];
    for (var i = 0, l = obj.length; i < l; i++) {
      newArray.push(fn.call(this, obj[i], i));
    }
    return newArray;
  } else {
    var newObj = {};
    for (var k in obj) {
      newObj[k] = fn.call(this, obj[k], k);
    }
    return newObj;
  }
};

exports.each = function(obj, fn) {
  if (this.isArray(obj)) {
    for (var i = 0, l = obj.length; i < l; i++) {
      fn.call(this, obj[i], i);
    }
  } else {
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) {
        fn.call(this, k, obj[k], k);
      }
    }
  }
};

exports.filter = function(arr, fn) {
  var newArray = [];
  this.each(arr, function(obj) {
    if (fn.call(this, obj)) {
      newArray.push(obj);
    }
  });
  return newArray;
};

exports.endsWith = function(needle, hayStack) {
  return hayStack.match(needle + "$") == needle;
};

exports.startsWith = function(needle, hayStack) {
  return hayStack.match("^" + needle) == needle;
};
