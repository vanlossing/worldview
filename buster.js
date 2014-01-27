/*
 * NASA Worldview
 *
 * This code was originally developed at NASA/Goddard Space Flight Center for
 * the Earth Science Data and Information System (ESDIS) project.
 *
 * Copyright (C) 2013 - 2014 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 */

var config = module.exports;

config["wv"] = {
    rootPath: "./",
    environment: "browser",
    libs: [
        "src/ext/wv.main/lodash-2.4.1/lodash.js",
        "src/ext/wv.main/jquery-1.6.4/jquery.js",
        "src/ext/wv.main/jscache-gitba01cdc/cache.js",
        "src/ext/wv.ui/yui-2.9.0/yui.js"
    ],
    src: [
        "src/js/wv.*.js",
        "src/js/util/wv.*.js",
        "src/js/ui/wv.ui.js",
        "src/js/date/wv.*.js",
        "src/js/layers/wv.*.js",
        "src/js/link/wv.*.js",
        "src/js/palettes/wv.*.js",
        "src/js/proj/wv.*.js",
    ],
    tests: [
        "test/**/*.js"
    ]
};
