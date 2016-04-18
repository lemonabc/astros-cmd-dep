'use strict';

var nodeUrl = require('url');
var nodePath = require('path');
var nodeFs = require('fs');
var nodeUtil = require('util');

var util = require('lang-utils');

// 支持CMD
// 分析依赖列表

module.exports = new astro.Middleware({
    modType: 'page',
    fileType: ['js','css']
}, function(asset, next) {
    if(!asset.data){
        next(asset);
        return
    }
    var project = asset.project;
    var prjCfg = Object.assign({
        source: {},
        unCombine: []
    }, asset.prjCfg);
    let data;
    if(asset.fileType === 'css'){
            data = asset.data;
        let _asset = asset.clone();
            _asset.fileType = 'js';
        asset.data = _asset.read();
    }

    getJsDependent(asset, function(errorMsg, jsLibs) {

        asset.jsLibs = asset.jsLibs || ['', []];
        asset.jsLibs[0] = asset.jsLibs[0] ? asset.jsLibs[0] + '\n' + errorMsg :
            errorMsg;
        asset.jsLibs[1] = jsLibs.concat(asset.jsLibs[1] || []);


        // asset.jsLibs = [errorMsg, jsLibs];
        if(asset.fileType === 'css'){
            asset.data = data;
        }
        next(asset);
    });
});

let refer_cache = {};
// 获取代码里的引用关系
function getReference(asset) {
    let cache = refer_cache[asset.filePath] || {};
    if(cache.mtime !== asset.mtime ||
        (typeof asset.mtime) == 'undefined'){

        let ret = [];
        (asset.data||'').replace(/require\s*?\(\s*(['"])(\S+)\1\s*\);?/g, 
            function(a, b, reqjs) {
            ret.push(reqjs);
        });
        cache.data = ret;
        cache.mtime = asset.mtime;

        refer_cache[asset.filePath] = cache;
    }
    return cache.data;
}

function getJsDependent(asset, callback) {
    let errorMsg = '';
    let jsLibs = getReference(asset);
    //处理依赖
    if (jsLibs.length > 0) {
        // 处理JS组件依赖关系
        let process = (function*() {
            let i = 0;
            while (jsLibs[i]) {
                if (i > 1000) {
                    errorMsg += '/* ***** ' + '\n依赖套嵌超过一千次，可能出现死循环\n' + jsLibs.join(',') + '** */\n';
                    console.error('n依赖套嵌超过一千次，可能出现死循环, asset.name:%s, asset.components', asset.name, asset.components ? asset.components.join(',') : 'null');
                    console.info(jsLibs.join(','));
                    break;
                }
                new astro.Asset({
                    ancestor: asset,
                    modType: 'jsCom',
                    fileType: 'js',
                    name: jsLibs[i],
                    project: asset.project
                }).getContent(function(asset) {
                    if (!asset.data) {
                        errorMsg += '/* js-dep -> (' + asset.info + ') ' + jsLibs[i] + ' is miss or empty */\n';
                    } else {
                        jsLibs = jsLibs.concat(getReference(asset));
                    }
                    i++;
                    process.next();
                });
                yield;
            }
            done();
        }());
        process.next();
    } else {
        done();
    }
    function done() {
        callback(errorMsg, util.dequeueArray(jsLibs).reverse());
    }
}