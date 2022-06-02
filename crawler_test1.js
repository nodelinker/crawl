const puppeteer = require('puppeteer');
const { intercept, patterns } = require('puppeteer-interceptor');
const { Cluster } = require('puppeteer-cluster');
const fs = require('fs');
const { URL } = require('url');
const winston = require('winston');


const logLevels = {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
};


const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}` + (info.splat !== undefined ? `${info.splat}` : " "))
    ),
    // format: winston.format.simple(),
    // defaultMeta: { service: 'user-service' },
    transports: [
        //
        // - Write all logs with importance level of `error` or less to `error.log`
        // - Write all logs with importance level of `info` or less to `combined.log`
        //
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isEmpty(value) {
    return typeof value == 'string' && !value.trim() || typeof value == 'undefined' || value === null;
}

(async () => {


    let targetUrl = new URL('http://www.baidu.com/');
    let targetScope = targetUrl.host;


    const browser = await puppeteer.launch({
        headless: false, devtools: true,
    });


    const page = await browser.newPage();
    await page.goto(targetUrl.href, {
        waitUntil: [
            'load',
            'domcontentloaded',
            'networkidle0',
            'networkidle2'],
    });

    // await page.type('input[name=username]', 'admin123', { delay: 20 });
    // await page.type('input[name=password]', '123123', { delay: 20 });
    // await page.click('button[type=submit]');

    // // wait for sec
    // await sleep(1000);
    // inline trigger
    let links = await page.evaluate(() => {
        
        (async function collect_comment_url() {
            function getAllComments(node) {
                const xPath = "//comment()",
                result = [];
                
                let query = document.evaluate(xPath, node, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
                for (let i = 0, length = query.snapshotLength; i < length; ++i) {
                    result.push(query.snapshotItem(i));
                }
                
                return result;
            }
            
            let links = [];
            let urlRegex = `((https?|ftp|file):)?//[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]`;
            let comments = getAllComments(document.documentElement);
            for (var i =0; i < comments.length; i++) {
                var re = new RegExp(urlRegex);
                let url = comments[i].textContent.match(re);
                if (url != null && url.length > 0) {
                    links = links.concat(url);
                }
                // if (re.test(comments[i].textContent) == true){
                //     links.push(comments[i].nodeValue);
                // }
            }

            return links;

        })();
    });

    console.log("aaaaaaaaaaaaaa", links);



    // await browser.close();
})();