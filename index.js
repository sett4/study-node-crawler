"use strict";

var EventEmitter2 = require('eventemitter2').EventEmitter2;
var server = new EventEmitter2({});
var urlUtil = require('url');

var visitedList = {};
var queue = [];

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};


function fetchRanking(url, scraper, cb) {
    if (visitedList[url] != undefined) {
        process.nextTick(cb);
        return;
    }
    visitedList[url] = "fetching...";

    var client = require('cheerio-httpcli');
    client.fetch(url, { }, function (err, $, res) {
        if (err !== undefined) {
            visitedList[url] = "err";
            server.emit('error', err, url);
            process.nextTick(cb);
            return;
        }
        visitedList[url] = true;

        scraper($, res);
        process.nextTick(cb);
    });
}

var monitorHandle = setInterval(function(){
    console.error("------");
    console.error(queue.length+' jobs on queued');
    console.error(_runningWorker+ ' running workers');
    console.error(_totalJob +' jobs total');
    console.error(_processedJob +' jobs processed');
}, 3000);


var _runningWorker = 0;
var _totalJob = 0;
var _processedJob = 0;
var concurrency = 2 ;
var delay = 20;

function isAcceptablePath($, i, e) {
    return $(e).attr('href').match('^/');
}

function scrapeRankingLink($, res, i, e) {
    var nextUrl = urlUtil.resolve(res.request.uri, $(e).attr('href'));
    if (visitedList[nextUrl] == undefined) {
        server.emit('push', nextUrl);
    }
}

function scrapeTagLink($, res, text, i, e) {
    text = text + "#" + $(e).text();
    var url = urlUtil.resolve(res.request.uri, $(e).attr('href'));

    if (visitedList.hasOwnProperty(url) == false) {
        visitedList[url] = text;
        server.emit('fetched', {url:url, text:text});
    }
}

function scraper($, res) {
    var text = $('#rnk_pnkz').text().replaceAll('[\t\n]', '');
    server.emit('fetched', {url: res.request.uri, text: text});

    // リンク一覧を表示
    var bindedAcceptFunc = isAcceptablePath.bind(null, $);
    $('a.genreMenuLink').filter(bindedAcceptFunc).each(scrapeRankingLink.bind(null, $, res));
    $('a.tagLink').filter(bindedAcceptFunc).each(scrapeTagLink.bind(null, $, res, text));    
}

server.on('push', function(url){
    queue.push({url: url});
    _totalJob++;
    server.emit('process');
});


server.on('fetched', function(r){
    console.log(r.url +"\t"+r.text);
});

server.on('error', function(err, url){
    console.error("error on "+url);
    console.error(err);
});

server.on('process', function(){
    if (queue.length>0 && _runningWorker < concurrency) {
        _runningWorker++;

        fetchRanking(queue.pop().url, scraper, function(){
            setTimeout(function(){
                _runningWorker--;
                _processedJob++;
                if (_totalJob > _processedJob) {
                    server.emit('process');
                } else {
                    clearInterval(monitorHandle);
                }
            }, delay);
        });
    }
});


server.emit('push', 'http://ranking.rakuten.co.jp/daily/');

