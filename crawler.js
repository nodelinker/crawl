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
  format: winston.format.simple(),
  defaultMeta: { service: 'user-service' },
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


  let targetUrl = new URL('http://127.0.0.1:8080/WebGoat/attack');
  let targetScope = targetUrl.host;


  const browser = await puppeteer.launch({
    headless: false, devtools: true,
  });

  // 初始化cluster
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 2,
    browser: browser,
    skipDuplicateUrls: true,
  });

  await cluster.task(async ({ page, data: url }) => {

    let currentScope = '';
    try {
      let _url = new URL(url);
      currentScope = _url.host;
    } catch (error) {
      console.log("cluster error => ", url);
      return;
    }

    // 判断是否为当前任务领空
    if (currentScope !== targetScope) {
      return;
    }

    // 判断是否为注销页面
    let isLogout = url.toLowerCase().includes('logout');
    if (isLogout == true) {
      return;
    }

    const cookiesString = fs.readFileSync('scope-cookie.json', 'utf8');
    const cookies = JSON.parse(cookiesString);
    // await page.setCookie(...cookies);
    await page.setCookie.apply(page, cookies);


    await sleep(3000);


    intercept(page, patterns.XHR('*'), {
      onInterception: event => {
        // console.log(`${event.request.url} ${event.request.method} intercepted.`);
        let url = event.request.url;
        cluster.queue(url);

        // capture some data

      },
    });

    await page.goto(url, {
      waitUntil: [
        'load',
        'domcontentloaded',
        'networkidle0',
        'networkidle2']
    });

    console.log("================> task: ", url);

    let a_tags = await page.evaluate(() => {
      let elements = Array.from(document.querySelectorAll('a'));
      let links = elements.map(element => {
        return element.href
      })
      return links;
    });

    // filter out the links that are not in the target scope
    // filter duplicated links
    for (var i = 0; i < a_tags.length; i++) {
      let tag = a_tags[i];
      // console.log("cluster url: ", tag);
      if (!tag.trim()) {
        continue;
      }
      cluster.queue(tag);
    }

    // init javascript env
    await page.evaluate(() => {
      window.sleep = function (time) {
        return new Promise((resolve) => setTimeout(resolve, time));
      }
    });

    // dom0 trigger
    await page.evaluate(() => {
      (async function trigger_all_inline_event() {
        let eventNames = ["onabort", "onblur", "onchange", "onclick", "ondblclick", "onerror",
          "onfocus", "onkeydown", "onkeypress", "onkeyup", "onload", "onmousedown", "onmousemove",
          "onmouseout", "onmouseover", "onmouseup", "onreset", "onresize", "onselect", "onsubmit",
          "onunload"];
        for (let eventName of eventNames) {
          let event = eventName.replace("on", "");
          let nodeList = document.querySelectorAll("[" + eventName + "]");
          if (nodeList.length > 100) {
            nodeList = nodeList.slice(0, 100);
          }
          for (let node of nodeList) {
            await window.sleep(1000);
            let evt = document.createEvent('CustomEvent');
            evt.initCustomEvent(event, false, true, null);
            try {
              node.dispatchEvent(evt);
            }
            catch (e) {
              console.error(e);
            }
          }
        }
      })();
    });


    // dom2 trigger

    // 填充表单

    // 提交表单


  });


  const page = await browser.newPage();
  await page.goto(targetUrl.href, {
    waitUntil: [
      'load',
      'domcontentloaded',
      'networkidle0',
      'networkidle2'],
  });

  // intercept(page, patterns.All('*'), {
  //   onInterception: event => {
  //     console.log(`${event.request.url} intercepted.`)
  //   },
  //   // onResponseReceived: event => {
  //   //   console.log(`${event.request.url} intercepted, going to modify`)
  //   //   event.response.body += `\n;console.log("This script was modified inline");`
  //   //   return event.response;
  //   // }
  // });


  await page.type('input[name=username]', 'admin123', { delay: 20 });
  await page.type('input[name=password]', '123123', { delay: 20 });

  await page.click('button[type=submit]');

  // wait for sec
  await sleep(1000);

  // login success save cookie
  const cookies = await page.cookies()
  console.info("cookies are ", cookies);

  fs.writeFile('scope-cookie.json', JSON.stringify(cookies, null, 2), function (err) {
    if (err) throw err;
    console.log('completed write of cookies');
  });


  let a_tags = await page.evaluate(() => {

    let elements = Array.from(document.querySelectorAll('a'));
    let links = elements.map(element => {
      return element.href
    })
    return links;

    // let tags = document.querySelectorAll('a');
    // return tags;
  });



  // filter out the links that are not in the target scope
  // filter duplicated links
  for (var i = 0; i < a_tags.length; i++) {
    let tag = a_tags[i];
    console.log("cluster url: ", tag);
    if (!tag.trim()) {
      continue;
    }
    cluster.queue(tag);
  }


  await cluster.idle();
  await cluster.close();

  await browser.close();
})();