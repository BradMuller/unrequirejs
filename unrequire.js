(function (undefined) {
    var BROWSER = typeof window !== 'undefined';
    var document = window.document;
    var head = document.head;

    var queuedModules = { };
    var loadedModules = { };
    var loadingModules = { };

    var defineHandlers = [ ];

    var nextTick = function (callback) {
        // TODO feature-detect better methods
        setTimeout(callback, 0);
    };

    // { }.hasOwnProperty and { }.toString are syntax errors, and reusing
    // loadedModules saves bytes after minification.  =]
    var hasOwnProperty = loadedModules.hasOwnProperty;
    var toString = loadedModules.toString;

    function hasOwn(obj, name) {
        return hasOwnProperty.call(obj, name);
    }

    function isArray(x) {
        return toString.call(x) === '[object Array]';
    }

    function isPlainOldObject(x) {
        return toString.call(x) === '[object Object]';
    }

    function identity(x) { return x; }

    function extend(base, extension) {
        var key;

        for (key in extension) {
            if (hasOwn(extension, key)) {
                base[key] = extension[key];
            }
        }

        return base;
    }

    function subscribeModuleLoaded(moduleName, callback) {
        if (hasOwn(loadedModules, moduleName)) {
            nextTick(function () {
                callback(null, loadedModules[moduleName]);
            });
        } else if (hasOwn(loadingModules, moduleName)) {
            loadingModules[moduleName].push(callback);
        } else {
            loadingModules[moduleName] = [ callback ];
        }
    }

    function pathSplit(parts) {
        parts = isArray(parts) ? parts : [ parts ];

        var splitParts = [ ];
        var i;

        for (i = 0; i < parts.length; ++i) {
            if (parts[i]) {
                splitParts = splitParts.concat(parts[i].split(/\//g));
            }
        }

        return splitParts;
    }

    function pathNormalize(parts) {
        var newParts = [ ];
        var i;

        for (i = 0; i < parts.length; ++i) {
            if (!parts[i]) {
                // Root
                newParts = [ '' ];
            } else if (parts[i] === '..') {
                // Go back
                if (newParts.length === 0) {
                    newParts = [ '..' ];
                } else {
                    newParts.pop();
                }
            } else if (parts[i] === '.') {
                // Go here
                if (newParts.length === 0) {
                    newParts = [ '.' ];
                }
            } else {
                // Everything else
                newParts.push(parts[i]);
            }
        }

        return newParts;
    }

    function pathResolve(cwd, parts) {
        cwd = pathNormalize(pathSplit(cwd));
        parts = pathNormalize(pathSplit(parts));

        if (parts[0] === '..' || parts[0] === '.') {
            // Relative paths are based on cwd
            return pathNormalize(cwd.concat(parts));
        } else {
            // Absolute paths are based on root
            return parts;
        }
    }

    function pathJoin(parts) {
        return parts
            .join('/')
            .replace(/\/+/g, '/');
    }

    function dirName(path) {
        var parts = pathSplit(path);
        parts = parts.slice(0, parts.length - 1);
        return pathJoin(parts);
    }

    function getScriptName(moduleName, config, cwd) {
        var scriptName = pathJoin(pathResolve(cwd, moduleName));
        scriptName = scriptName + (/\.js$/i.test(scriptName) ? '' : '.js');
        return scriptName;
    }

    function loadOneAsync(scriptName, callback) {
        subscribeModuleLoaded(scriptName, callback);

        if (!hasOwn(loadedModules, scriptName)) {
            loadScriptAsync(scriptName, identity);
        }
    }

    function loadManyAsync(moduleNames, config, cwd, callback) {
        var moduleValues = [ ];
        var loadCount = 0;

        function check() {
            if (loadCount >= moduleNames.length) {
                callback(null, moduleValues);
            }
        }

        function load(i) {
            loadOneAsync(getScriptName(moduleNames[i], config, cwd), function (err, moduleValue) {
                if (err) return callback(err);

                moduleValues[i] = moduleValue;
                ++loadCount;

                check();
            });
        }

        var i;

        for (i = 0; i < moduleNames.length; ++i) {
            load(i);
        }

        check();
    }

    function require(config, deps, callback) {
        if (!isPlainOldObject(config)) {
            // Config omitted
            callback = deps;
            deps = config;
            config = { };
        }

        if (!isArray(deps)) {
            // Dependencies omitted
            callback = deps;
            deps = [ ];
        }

        // TODO Support cwd for require
        loadManyAsync(deps, config, '', function (err, moduleValues) {
            if (err) throw err;

            callback.apply(null, moduleValues.concat([ /* TODO */ ]));
        });
    }

    function define(name, config, deps, callback) {
        if (typeof name !== 'string') {
            // Name omitted
            callback = deps;
            deps = config;
            config = name;
            name = null;
        }

        if (!isPlainOldObject(config)) {
            // Config omitted
            callback = deps;
            deps = config;
            config = { };
        }

        if (!isArray(deps)) {
            // Dependencies omitted
            callback = deps;
            deps = [ ];
        }

        function load(scriptName) {
            loadManyAsync(deps, config, dirName(scriptName), function (err, moduleValues) {
                function callCallbacks(moduleName, err, moduleValue) {
                    if (!loadingModules[moduleName]) {
                        return;
                    }

                    var callback;

                    while ((callback = loadingModules[moduleName].pop())) {
                        (function (callback) {
                            nextTick(function () {
                                callback(err, moduleValue);
                            });
                        }(callback));
                    }

                    loadingModules[moduleName] = null;
                }

                if (err) return callCallbacks(scriptName, err);

                var moduleValue = callback.apply(null, moduleValues.concat([ /* TODO */ ]));

                loadedModules[scriptName] = moduleValue;

                callCallbacks(scriptName, null, moduleValue);
            });
        }

        defineHandlers.push(load);
    } 

    var loadScriptAsync;

    if (BROWSER) {
        loadScriptAsync = function (scriptName, callback) {
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.async = true;
            script.addEventListener('load', function () {
                var defineCallback;

                while ((defineCallback = defineHandlers.pop())) {
                    defineCallback(scriptName);
                }

                callback(null);
            }, false);

            // TODO Error checking
            // TODO Handle <base>
            // TODO Support other onloaded event types (IE)
            // TODO Clean up properly

            script.src = scriptName;

            var firstScript = document.getElementsByTagName('script')[0];
            if (firstScript) {
                firstScript.parentNode.insertBefore(script, firstScript);
            } else {
                head.appendChild(script);
            }
        };

        window.require = require;
        window.define = define;
    } else {
        throw new Error('Unsupported environment');
    }
}());
