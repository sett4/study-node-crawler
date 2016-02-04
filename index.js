"use strict";

var EventEmitter2 = require('eventemitter2').EventEmitter2;
var urlUtil = require('url');
var _ = require('lodash');


var Crawler = (function(){
    function Crawler(scrape, opts) {
        this.scrape = scrape.bind(this);
        this.concurrency = opts.concurrency || 1;
        this.delay = opts.delay || 20;

        this._runningWorker = 0;
        this._totalJob = 0;
        this._processedJob = 0;

        this.visitedList = {};
        this.queue = [];
        
        this.on('push', this.onPush);
        this.on('process', this.onProcess);
    }
    
    Crawler.prototype = _.create(EventEmitter2.prototype, {
        'constructor': Crawler
    });

    Crawler.prototype.fetch = function(url, scrape, cb) {
        var self = this;
        if (self.visitedList[url] != undefined) {
            process.nextTick(cb);
            return;
        }
        self.visitedList[url] = "fetching...";

        var client = require('cheerio-httpcli');
        client.fetch(url, { }, function (err, $, res) {
            if (err !== undefined) {
                self.visitedList[url] = "err";
                self.emit('error', err, url);
                process.nextTick(cb);
                return;
            }
            self.visitedList[url] = true;

            scrape(self, $, res);
            process.nextTick(cb);
        });
    };
    
    Crawler.prototype.onPush = function(url){
        var self = this;
        self.queue.push({url: url});
        self._totalJob++;
        self.emit('process');
    };
    
    Crawler.prototype.onProcess = function(){
        var self = this;
        if (self.queue.length>0 && self._runningWorker < self.concurrency) {
            self._runningWorker++;

            var url = self.queue.pop().url;
            self.fetch(url, self.scrape, function(){
                setTimeout(function(){
                    self._runningWorker--;
                    self._processedJob++;
                    if (self._totalJob > self._processedJob) {
                        self.emit('process');
                    } else {
                        self.emit('end');
                    }
                }, self.delay);
            });
        }
    };
    
    return Crawler;
})();


String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};


function scrape(crawler, $, res) {
    function isAcceptablePath(crawler, $, i, e) {
        return $(e).attr('href').match('^/');
    };

    function scrapeRankingLink(crawler, $, res, i, e) {
        var nextUrl = urlUtil.resolve(res.request.uri, $(e).attr('href'));
        if (crawler.visitedList[nextUrl] == undefined) {
            crawler.emit('push', nextUrl);
        }
    };

    function scrapeTagLink(crawler, $, res, text, i, e) {
        text = text + "#" + $(e).text();
        var url = urlUtil.resolve(res.request.uri, $(e).attr('href'));

        if (crawler.visitedList.hasOwnProperty(url) == false) {
            crawler.visitedList[url] = text;
            crawler.emit('fetched', {url:url, text:text});
        }
    }

    var text = $('#rnk_pnkz').text().replaceAll('[\t\n]', '');
    crawler.emit('fetched', {url: res.request.uri, text: text});

    // リンク一覧を表示
    var bindedAcceptFunc = isAcceptablePath.bind(this, crawler, $);
    $('a.genreMenuLink').filter(bindedAcceptFunc).each(scrapeRankingLink.bind(this, crawler, $, res));
    $('a.tagLink').filter(bindedAcceptFunc).each(scrapeTagLink.bind(this, crawler, $, res, text));    
};

var crawler = new Crawler(scrape, {});
crawler.on('fetched', function(r){
    console.log(r.url +"\t"+r.text);
});

crawler.on('error', function(err, url){
    console.error("error on "+url);
    console.error(err);
});


var monitorHandle = setInterval(function(){
    console.error("------");
    console.error(crawler.queue.length+' jobs on queued');
    console.error(crawler._runningWorker+ ' running workers');
    console.error(crawler._totalJob +' jobs total');
    console.error(crawler._processedJob +' jobs processed');
}, 3000);

crawler.on('end', function(){
    clearInterval(monitorHandle);    
});

crawler.emit('push', 'http://ranking.rakuten.co.jp/daily/');
